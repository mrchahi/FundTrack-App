"""News / economic calendar: CSV import & storage.

Expected CSV columns (uppercase header): Title, Country, Date, Time, Impact,
Forecast, Previous, URL. Date is MM-DD-YYYY and is normalized to YYYY-MM-DD.
Rows are upserted by URL so re-uploading refreshes instead of duplicating.
"""
from __future__ import annotations

import csv
import io
import re
import time
from datetime import datetime, timezone

# The published calendar times are UTC (e.g. US Core PPI at 13:30 UTC = 8:30
# ET). We store events with a UTC epoch so the UI can sort/filter/countdown
# and convert to Tehran (or any) time correctly, independent of the client.
UTC = timezone.utc


def _norm_date(s: str) -> str:
    s = (s or "").strip()
    parts = s.split("-")
    if len(parts) == 3:
        m, d, y = parts
        try:
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        except ValueError:
            return s
    return s


def parse_csv_bytes(raw: bytes) -> list[dict]:
    text = raw.decode("utf-8-sig", "replace")
    reader = csv.DictReader(io.StringIO(text))
    out = []
    for row in reader:
        title = (row.get("Title") or "").strip()
        if not title:
            continue
        out.append({
            "title": title,
            "country": (row.get("Country") or "").strip(),
            "event_date": _norm_date(row.get("Date") or ""),
            "event_time": (row.get("Time") or "").strip(),
            "impact": (row.get("Impact") or "Low").strip(),
            "forecast": (row.get("Forecast") or "").strip(),
            "previous": (row.get("Previous") or "").strip(),
            "url": (row.get("URL") or "").strip(),
        })
    return out


def import_rows(con, rows) -> int:
    now = int(time.time())
    for r in rows:
        con.execute(
            """INSERT INTO news_events(title,country,event_date,event_time,impact,forecast,previous,url,created_at)
               VALUES(?,?,?,?,?,?,?,?,?)
               ON CONFLICT(url) DO UPDATE SET
                 title=excluded.title, country=excluded.country,
                 event_date=excluded.event_date, event_time=excluded.event_time,
                 impact=excluded.impact, forecast=excluded.forecast,
                 previous=excluded.previous""",
            (r["title"], r["country"], r["event_date"], r["event_time"],
             r["impact"], r["forecast"], r["previous"], r["url"], now),
        )
    return len(rows)


def _parse_event_utc(date_iso: str, time_str: str) -> datetime | None:
    """Parse event_date ('YYYY-MM-DD') + event_time ('8:30pm' / '00:00' / '').

    The published time is UTC; we return a UTC-aware datetime directly.
    Missing/unparseable time falls back to 00:00 UTC.
    """
    try:
        y, m, d = (int(x) for x in date_iso.split("-"))
    except (TypeError, ValueError):
        return None
    t = (time_str or "").strip().lower()
    m2 = re.match(r"(\d{1,2}):(\d{2})\s*(am|pm)?", t)
    if not m2:
        hh, mm = 0, 0
    else:
        hh = int(m2.group(1))
        mm = int(m2.group(2))
        ampm = m2.group(3)
        if ampm == "pm" and hh != 12:
            hh += 12
        elif ampm == "am" and hh == 12:
            hh = 0
    try:
        return datetime(y, m, d, hh, mm, tzinfo=UTC)
    except (ValueError, OverflowError):
        return None


def list_events(con) -> list[dict]:
    rows = [dict(r) for r in con.execute(
        "SELECT * FROM news_events ORDER BY event_date, event_time, id").fetchall()]
    for r in rows:
        utc = _parse_event_utc(r.get("event_date", ""), r.get("event_time", ""))
        r["ts"] = int(utc.timestamp()) if utc else None
    return rows


def clear_events(con) -> int:
    cur = con.execute("DELETE FROM news_events")
    return cur.rowcount


def purge_old_events(con, cutoff_iso: str) -> int:
    """Delete events whose date is before cutoff (YYYY-MM-DD). Keeps the week fresh."""
    cur = con.execute("DELETE FROM news_events WHERE event_date <> '' AND event_date < ?", (cutoff_iso,))
    return cur.rowcount
