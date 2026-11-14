"""Statistics and breakdowns over closed trades. Times are shown in Tehran time."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from .config import SESSIONS, TEHRAN

WEEKDAYS_FA = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]

PERIODS = {"day": "day", "d": "day", "week": "week", "w": "week",
           "month": "month", "m": "month", "year": "year", "y": "year"}


def to_tehran(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(TEHRAN)


def sessions_at(ts: int) -> list[str]:
    """Sessions open at this UTC instant (weekdays only, in each market's own time zone)."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    active = []
    for name, (zone, start, end) in SESSIONS.items():
        local = dt.astimezone(ZoneInfo(zone))
        if local.weekday() < 5 and start <= local.hour < end:
            active.append(name)
    return active


def session_label(ts: int) -> str:
    s = sessions_at(ts)
    return " + ".join(s) if s else "Off-hours"


def _row_dict(r) -> dict:
    return {k: r[k] for k in r.keys()}


def _date_range_bounds(f: dict) -> tuple[str | None, str | None]:
    """Returns (from, to) ISO dates in Tehran time. Explicit from/to win over a range shortcut."""
    if f.get("from") or f.get("to"):
        return f.get("from") or None, f.get("to") or None
    rng = PERIODS.get(str(f.get("range") or ""))
    if not rng:
        return None, None
    now = datetime.now(TEHRAN)
    if rng == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif rng == "week":
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif rng == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start.date().isoformat(), now.date().isoformat()


def filtered_trades(con, f: dict) -> list[dict]:
    """f: login, symbol, side, source, from, to (Tehran dates YYYY-MM-DD), range, session, open_only."""
    q = "SELECT * FROM trades WHERE is_open = 0"
    args: list = []
    if f.get("login"):
        q += " AND login = ?"
        args.append(int(f["login"]))
    if f.get("symbol"):
        q += " AND symbol = ?"
        args.append(f["symbol"])
    if f.get("side") in ("buy", "sell"):
        q += " AND side = ?"
        args.append(f["side"])
    if f.get("source") in ("ea", "manual"):
        q += " AND source = ?"
        args.append(f["source"])
    q += " ORDER BY close_t"
    rows = [_row_dict(r) for r in con.execute(q, args).fetchall()]

    from_iso, to_iso = _date_range_bounds(f)
    out = []
    for r in rows:
        local = to_tehran(r["close_t"])
        r["close_local"] = local.isoformat()
        r["open_local"] = to_tehran(r["open_t"]).isoformat()
        r["duration_min"] = round((r["close_t"] - r["open_t"]) / 60, 1)
        r["session"] = session_label(r["open_t"])
        if from_iso and local.date().isoformat() < from_iso:
            continue
        if to_iso and local.date().isoformat() > to_iso:
            continue
        if f.get("session") and r["session"] != f["session"]:
            continue
        out.append(r)
    return out


def _stats(rows: list[dict]) -> dict:
    n = len(rows)
    nets = [r["net"] for r in rows]
    wins = [x for x in nets if x > 0]
    losses = [x for x in nets if x < 0]
    gp, gl = sum(wins), -sum(losses)
    win_rate = len(wins) / n if n else 0.0
    avg_win = gp / len(wins) if wins else 0.0
    avg_loss = gl / len(losses) if losses else 0.0
    rs = [r["r_price"] for r in rows if r["r_price"] is not None]
    durs = [r["duration_min"] for r in rows]

    best_streak = worst_streak = cur_w = cur_l = 0
    for x in nets:
        if x > 0:
            cur_w, cur_l = cur_w + 1, 0
        elif x < 0:
            cur_l, cur_w = cur_l + 1, 0
        best_streak, worst_streak = max(best_streak, cur_w), max(worst_streak, cur_l)

    peak = eq = max_dd = 0.0
    for x in nets:
        eq += x
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)

    durs_sorted = sorted(durs)
    median_dur = durs_sorted[len(durs_sorted) // 2] if durs_sorted else 0.0

    return {
        "trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate * 100, 2),
        "net": round(sum(nets), 2),
        "gross_profit": round(gp, 2),
        "gross_loss": round(gl, 2),
        "profit_factor": round(gp / gl, 2) if gl else None,
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "expectancy": round(win_rate * avg_win - (1 - win_rate) * avg_loss, 2) if n else 0.0,
        "avg_r_price": round(sum(rs) / len(rs), 3) if rs else None,
        "max_win_streak": best_streak,
        "max_loss_streak": worst_streak,
        "max_drawdown": round(max_dd, 2),
        "avg_duration_min": round(sum(durs) / n, 1) if n else 0.0,
        "median_duration_min": round(median_dur, 1),
        "best": round(max(nets), 2) if nets else 0.0,
        "worst": round(min(nets), 2) if nets else 0.0,
        "commission": round(sum(r["commission"] + r["fee"] for r in rows), 2),
        "swap": round(sum(r["swap"] for r in rows), 2),
    }


def summary(rows: list[dict]) -> dict:
    return _stats(rows)


def curve(rows: list[dict]) -> list[dict]:
    out, eq = [], 0.0
    for r in rows:
        eq += r["net"]
        out.append({"t": r["close_t"], "local": r["close_local"], "net": r["net"], "cum": round(eq, 2)})
    return out


def net_by_period(rows: list[dict], period: str = "month") -> list[dict]:
    """Net PnL, trades, wins per day/week/month/year bucket (Tehran time)."""
    period = PERIODS.get(period, "month")
    buckets: dict = defaultdict(list)
    for r in rows:
        d = to_tehran(r["close_t"])
        if period == "day":
            key = d.date().isoformat()
        elif period == "week":
            iso = d.date().isocalendar()
            key = f"{iso.year}-W{iso.week:02d}"
        elif period == "year":
            key = str(d.year)
        else:
            key = f"{d.year:04d}-{d.month:02d}"
        buckets[key].append(r)
    out = []
    for key in sorted(buckets):
        grp = buckets[key]
        nets = [r["net"] for r in grp]
        wins = sum(1 for x in nets if x > 0)
        out.append({
            "period": key, "label": key,
            "net": round(sum(nets), 2), "trades": len(nets),
            "wins": wins, "losses": len(nets) - wins,
            "win_rate": round(wins / len(nets) * 100, 1) if nets else 0,
        })
    return out


def duration_buckets(rows: list[dict]) -> list[dict]:
    edges = [("0-15m", 0, 15), ("15m-1h", 15, 60), ("1-4h", 60, 240),
             ("4-12h", 240, 720), ("12-24h", 720, 1440), (">24h", 1440, None)]
    out = []
    for label, lo, hi in edges:
        grp = [r for r in rows if lo <= r["duration_min"] < (hi if hi else float("inf"))]
        if not grp:
            continue
        nets = [r["net"] for r in grp]
        wins = sum(1 for x in nets if x > 0)
        out.append({"label": label, "trades": len(grp), "wins": wins,
                    "win_rate": round(wins / len(grp) * 100, 1),
                    "net": round(sum(nets), 2)})
    return out


def breakdown(rows: list[dict], by: str) -> list[dict]:
    groups: dict = defaultdict(list)
    for r in rows:
        if by == "hour":
            key = to_tehran(r["close_t"]).hour
        elif by == "weekday":
            key = to_tehran(r["close_t"]).weekday()
        elif by == "session":
            key = r["session"]
        elif by == "symbol":
            key = r["symbol"]
        elif by == "side":
            key = r["side"]
        elif by == "source":
            key = r["source"]
        else:
            raise ValueError(by)
        groups[key].append(r)
    out = []
    for key, grp in groups.items():
        s = _stats(grp)
        label = key
        if by == "weekday":
            label = WEEKDAYS_FA[key]
        if by == "hour":
            label = f"{key:02d}:00"
        out.append({"key": key, "label": label, **s})
    if by in ("hour", "weekday"):
        out.sort(key=lambda x: x["key"])
    else:
        out.sort(key=lambda x: x["net"], reverse=True)
    return out


def top_trades(rows: list[dict], n: int = 10) -> dict:
    ordered = sorted(rows, key=lambda r: r["net"])
    return {"best": list(reversed(ordered[-n:])), "worst": ordered[:n]}


def heatmap(rows: list[dict]) -> dict:
    """Net profit and trade count per (weekday, hour) in Tehran time."""
    cells: dict = defaultdict(list)
    for r in rows:
        d = to_tehran(r["close_t"])
        cells[(d.weekday(), d.hour)].append(r["net"])
    out = []
    for (wd, hr), nets in sorted(cells.items()):
        out.append({"weekday": wd, "hour": hr, "net": round(sum(nets), 2), "trades": len(nets),
                    "win_rate": round(sum(1 for x in nets if x > 0) / len(nets) * 100, 1)})
    return {"weekdays": WEEKDAYS_FA, "cells": out}


def filter_options(con) -> dict:
    """Distinct values for filters, plus the overall date span."""
    def distinct(col):
        return [r[0] for r in con.execute(f"SELECT DISTINCT {col} FROM trades WHERE is_open=0 ORDER BY {col}").fetchall()]

    row = con.execute("SELECT MIN(close_t), MAX(close_t) FROM trades WHERE is_open=0").fetchone()
    return {
        "symbols": distinct("symbol"),
        "sides": distinct("side"),
        "sources": distinct("source"),
        "magics": [r[0] for r in con.execute(
            "SELECT DISTINCT magic FROM trades WHERE is_open=0 AND magic>0 ORDER BY magic").fetchall()],
        "first_trade": row[0] if row else None,
        "last_trade": row[1] if row else None,
    }
