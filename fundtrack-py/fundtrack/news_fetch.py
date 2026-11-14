"""Auto-fetch the ForexFactory economic calendar.

Uses the r.jina.ai text bridge to bypass Cloudflare. Two operations:

1. fetch_calendar() — pulls this week's table as Markdown, parses it into
   events (title, country, date, time, impact, forecast, previous, url).
2. A scheduler (NewsScheduler) — for every upcoming event it sleeps until
   ~1s after the event's scheduled time, then re-fetches the calendar and
   stores the released "Actual" value so the dashboard shows the result.

No third-party packages are needed (stdlib urllib only).
"""
from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timezone

from .config import TEHRAN
from .db import tx
from .news import UTC

JINA_URL = "https://r.jina.ai/https://www.forexfactory.com/calendar"
JINA_DAY = "https://r.jina.ai/https://www.forexfactory.com/calendar?day={day}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


class FetchError(Exception):
    pass


def _http_get(url: str, timeout: int = 25) -> str:
    import ssl
    import urllib.request

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "ignore")


def _normalize_impact(raw: str) -> str:
    """Impact comes as an icon url like ff-impact-yel.png / ff-impact-org.png / ff-impact-red.png / ff-impact-gray.png"""
    s = (raw or "").lower()
    if "ff-impact-red" in s or "impact-red" in s:
        return "High"
    if "ff-impact-org" in s or "impact-org" in s:
        return "Medium"
    if "ff-impact-gray" in s or "impact-gray" in s:
        return "Holiday"
    if "ff-impact-yel" in s or "impact-yel" in s:
        return "Low"
    if "high" in s:
        return "High"
    if "medium" in s or "moderate" in s:
        return "Medium"
    if "holiday" in s:
        return "Holiday"
    return "Low"


def _clean_value(raw: str) -> str:
    """Strip markdown image/link markup from numeric cells (Actual/Forecast/Previous)."""
    s = (raw or "").strip()
    # remove image references like ![Image 15](url) or [text](url) that pollute values
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    return s.strip()


def _parse_day_token(token: str) -> str | None:
    """Accepts 'Sun Nov 8', 'Mon Nov 9', 'Nov11 2026', 'nov11.2026'.

    Returns 'YYYY-MM-DD'. The year is taken from the token if present,
    otherwise from a provided default via _parse_day_token(..., year).
    """
    t = token.strip().lower()
    # with year: 'nov11 2026' / 'nov 11, 2026'
    m = re.match(r"([a-z]{3})\s*(\d{1,2})[.,]?\s*(\d{4})", t)
    if m:
        mon = MONTHS.get(m.group(1))
        if mon:
            return f"{m.group(3)}-{mon:02d}-{int(m.group(2)):02d}"
    # without year, e.g. 'sun nov 8' -> year unknown; default to current Tehran year
    m2 = re.match(r"(?:[a-z]{3})\s+([a-z]{3})\s+(\d{1,2})", t)
    if m2:
        mon = MONTHS.get(m2.group(1))
        if mon:
            year = datetime.now(TEHRAN).year
            return f"{year}-{mon:02d}-{int(m2.group(2)):02d}"
    return None


def _parse_pairs(text: str) -> list[dict]:
    """Split the Markdown table body into rows, returning dicts keyed by column."""
    rows: list[dict] = []
    lines = text.splitlines()

    # find the header line to know column order
    header_idx = -1
    for i, ln in enumerate(lines):
        if ln.strip().startswith("| Date"):
            header_idx = i
            break
    if header_idx < 0:
        return rows

    header_cells = [c.strip() for c in lines[header_idx].strip().strip("|").split("|")]
    col_map = {}
    for j, c in enumerate(header_cells):
        key = c.lower()
        col_map[j] = key

    # current day carried forward (a row starts with 'Sun Nov 8'; following rows omit it)
    current_day = ""
    for ln in lines[header_idx + 1:]:
        s = ln.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        first = cells[0]
        day_iso = _parse_day_token(first)
        if day_iso:
            current_day = day_iso
            # day-header row keeps the date cell at index 0 -> logical == physical
            off = 0
        else:
            if not current_day:
                continue
            # continuation row drops the date cell -> logical = physical + 1
            off = 1

        def cell(i):
            # i is the "logical" index in the header order:
            # 0=Date,1=Time,2=Currency,3=Impact,4=Detail,5=Alerts,6=DetailIcon,7=Actual,8=Forecast,9=Previous,10=Graph
            # physical index = i - 1 when the day cell is present, else i.
            idx = i - off
            return cells[idx] if 0 <= idx < len(cells) else ""

        # extract time from logical cell 1 (strip markdown link)
        time_val = cell(1)
        m_time = re.search(r"\[([^\]]+)\]", time_val)
        if m_time:
            time_val = m_time.group(1)

        row: dict = {"event_date": current_day, "title": "", "country": "", "event_time": time_val,
                     "impact": "Low", "actual": "", "forecast": "", "previous": "", "url": ""}
        row["country"] = cell(2)
        row["impact"] = _normalize_impact(cell(3))
        row["actual"] = _clean_value(cell(7))
        row["forecast"] = _clean_value(cell(8))
        row["previous"] = _clean_value(cell(9))
        detail = cell(4)
        m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", detail)
        if m:
            row["title"] = m.group(1).strip()
            row["url"] = m.group(2).strip()
        else:
            row["title"] = detail.strip()

        if row["title"]:
            rows.append(row)
    return rows


def fetch_calendar() -> list[dict]:
    try:
        text = _http_get(JINA_URL)
    except Exception as e:  # noqa: BLE001
        raise FetchError(f"calendar fetch failed: {e}") from e
    return _parse_pairs(text)


def _fetch_day(day_iso: str) -> list[dict]:
    day = day_iso.replace("-", "")
    # '2026-11-11' -> '2026-11-11' -> token 'nov11.2026'
    y, m, d = day_iso.split("-")
    mon = list(MONTHS.keys())[int(m) - 1]
    token = f"{mon}{int(d)}.{y}"
    try:
        text = _http_get(JINA_DAY.format(day=token))
    except Exception as e:  # noqa: BLE001
        raise FetchError(f"day fetch failed: {e}") from e
    return _parse_pairs(text)


# ---------------- storage / upsert ----------------

def upsert_events(con, rows: list[dict]) -> int:
    now = int(time.time())
    n = 0
    for r in rows:
        # Use a stable, unique URL key for upsert. Use the real link when
        # present; otherwise synthesize one from date+time+title+country so
        # the UNIQUE(url) upsert works uniformly.
        url = (r.get("url") or "").strip()
        if not url:
            url = "ff://" + "|".join([
                r.get("event_date", ""), r.get("event_time", ""),
                r.get("title", ""), r.get("country", ""),
            ])
        con.execute(
            """INSERT INTO news_events(title,country,event_date,event_time,impact,forecast,previous,actual,url,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(url) DO UPDATE SET
                 title=excluded.title, country=excluded.country,
                 event_date=excluded.event_date, event_time=excluded.event_time,
                 impact=excluded.impact, forecast=excluded.forecast,
                 previous=excluded.previous, actual=excluded.actual""",
            (r["title"], r["country"], r["event_date"], r["event_time"], r["impact"],
             r["forecast"], r["previous"], r["actual"], url, now),
        )
        n += 1
    return n


def update_actual(con, day_iso: str) -> int:
    """Fetch one day and update Actual values for matching rows.

    Matches by date + title + country (not time), because the weekly and
    per-day pages can report the same event at a different displayed time
    (timezone), while the title and currency are stable.
    """
    rows = _fetch_day(day_iso)
    updated = 0
    for r in rows:
        if not r.get("actual"):
            continue
        cur = con.execute(
            "SELECT id FROM news_events WHERE event_date=? AND title=? AND country=?",
            (r["event_date"], r["title"], r["country"]),
        ).fetchone()
        if cur:
            con.execute("UPDATE news_events SET actual=? WHERE id=?", (r["actual"], cur["id"]))
            updated += 1
    return updated


# ---------------- scheduler ----------------

class NewsScheduler:
    """In a background thread, for each upcoming event sleep until ~1s
    after its published time, then fetch the day and store Actual."""

    def __init__(self, con, events_path, check_every: float = 2.0):
        self.con = con
        self.events_path = events_path
        self.check_every = check_every
        self._stop = threading.Event()
        self._thread = None
        self.last_error = ""
        self.fetch_count = 0

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self._tick()
            except Exception as e:  # noqa: BLE001
                self.last_error = str(e)
            self._stop.wait(self.check_every)

    def _tick(self):
        now = datetime.now(TEHRAN)
        # find events that occur in the next few minutes and don't have Actual yet
        rows = self.con.execute(
            "SELECT id, event_date, event_time FROM news_events WHERE actual='' AND event_date<>''"
        ).fetchall()
        for r in rows:
            dt = self._parse_event_dt(r["event_date"], r["event_time"])
            if dt is None:
                continue
            delta = (dt - now).total_seconds()
            if delta < 0:
                # already past and still no actual -> try a single fetch (cheap guard)
                if -delta > 30 * 60:
                    continue  # too old, ignore
                self._maybe_fetch_day(r["event_date"])
            elif delta <= 120:
                # sleep until 1s after the event, then fetch
                wait = delta + 1.0
                if self._stop.wait(max(0.1, wait)):
                    return
                self._maybe_fetch_day(r["event_date"])

    def _maybe_fetch_day(self, day_iso: str):
        try:
            with tx(self.con):
                n = update_actual(self.con, day_iso)
                if n:
                    self.fetch_count += n
        except Exception:
            pass

    @staticmethod
    def _parse_event_dt(date_iso: str, time_str: str) -> datetime | None:
        try:
            y, m, d = (int(x) for x in date_iso.split("-"))
        except Exception:  # noqa: BLE001
            return None
        # source times are UTC; keep them UTC for an unambiguous comparison
        # against Tehran `now`
        # time strings like '1:47am' / '12:30pm' / '00:00'
        t = (time_str or "").strip().lower()
        m2 = re.match(r"(\d{1,2}):(\d{2})\s*(am|pm)?", t)
        if not m2:
            # fall back to format midnight
            return datetime(y, m, d, tzinfo=UTC)
        hh = int(m2.group(1))
        mm = int(m2.group(2))
        ampm = m2.group(3)
        if ampm == "pm" and hh != 12:
            hh += 12
        elif ampm == "am" and hh == 12:
            hh = 0
        return datetime(y, m, d, hh, mm, tzinfo=UTC)
