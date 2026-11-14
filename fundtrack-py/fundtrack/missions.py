"""Daily missions & gamification, derived from real closed trades."""
from __future__ import annotations

import math
import time
from collections import defaultdict
from datetime import date, datetime, timezone

from .config import TEHRAN
from .analytics import session_label, to_tehran

MISSIONS = [
    {"key": "trades", "metric": "trades", "target": 5, "stars": 20},
    {"key": "wins", "metric": "wins", "target": 3, "stars": 20},
    {"key": "profit", "metric": "net", "target": 25, "stars": 30},
    {"key": "avg_r", "metric": "avg_r", "target": 0.75, "stars": 25},
    {"key": "london", "metric": "london", "target": 2, "stars": 20},
    {"key": "positive", "metric": "positive", "target": 1, "stars": 25},
    {"key": "winrate", "metric": "winrate", "target": 60, "stars": 30, "min_trades": 5},
    {"key": "best", "metric": "best", "target": 15, "stars": 20},
    {"key": "sl_respected", "metric": "sl_respected", "target": 1, "stars": 30},
    {"key": "rr", "metric": "rr", "target": 2.0, "stars": 35},
]

WEEK_STAR_GOAL = 150
MONTH_STAR_GOAL = 600
TIER_THRESHOLDS = [100, 300, 600, 1000]
BADGE_THRESHOLDS = [("tier1", 100), ("tier2", 300), ("tier3", 600), ("tier4", 1000)]


def _rows_for_login(con, login: int | None) -> list[dict]:
    q = "SELECT close_t, net, r_price, sl FROM trades WHERE is_open=0"
    args: tuple = ()
    if login:
        q += " AND login=?"
        args = (login,)
    rows = con.execute(q + " ORDER BY close_t", args).fetchall()
    out = []
    for r in rows:
        ts = r["close_t"]
        out.append({
            "day": to_tehran(ts).date(),
            "net": r["net"], "r_price": r["r_price"],
            "has_sl": r["sl"] is not None,
            "session": session_label(ts),
        })
    return out


def _day_stats(rows) -> dict:
    d = {"trades": 0, "wins": 0, "losses": 0, "net": 0.0, "rs": [],
         "london": 0, "best": None, "winrate": 0.0, "avg_r": None,
         "sl_all": False}
    for r in rows:
        d["trades"] += 1
        n = r["net"]
        d["net"] += n
        if n > 0:
            d["wins"] += 1
        elif n < 0:
            d["losses"] += 1
        rp = r["r_price"]
        if rp is not None and rp >= 0:
            d["rs"].append(rp)
        if "London" in r["session"]:
            d["london"] += 1
        d["best"] = n if d["best"] is None else max(d["best"], n)
    if d["trades"]:
        d["winrate"] = d["wins"] / d["trades"] * 100
        d["sl_all"] = all(r["has_sl"] for r in rows)
    if d["rs"]:
        d["avg_r"] = sum(d["rs"]) / len(d["rs"])
    return d


def _metric_value(metric, stats):
    if metric == "trades":
        return stats["trades"]
    if metric == "wins":
        return stats["wins"]
    if metric == "net":
        return round(stats["net"], 2)
    if metric in ("avg_r", "rr"):
        return round(stats["avg_r"], 2) if stats["avg_r"] is not None else None
    if metric == "london":
        return stats["london"]
    if metric == "positive":
        return 1 if stats["net"] > 0 else 0
    if metric == "winrate":
        return round(stats["winrate"], 1)
    if metric == "best":
        return round(stats["best"], 2) if stats["best"] is not None else None
    if metric == "sl_respected":
        return 1 if stats["sl_all"] else 0
    return None


def load_daily_overrides(con) -> dict[str, dict]:
    """Return {key: {enabled, target, stars}} for overridden daily missions."""
    out = {}
    for r in con.execute("SELECT * FROM missions_daily_override").fetchall():
        out[r["key"]] = {
            "enabled": bool(r["enabled"]),
            "target": r["target"],
            "stars": r["stars"],
        }
    return out


def set_daily_override(con, key: str, enabled: int | None = None, target: float | None = None, stars: int | None = None) -> int:
    existing = con.execute("SELECT * FROM missions_daily_override WHERE key=?", (key,)).fetchone()
    if existing is None:
        con.execute(
            "INSERT INTO missions_daily_override(key, enabled, target, stars, updated_at) VALUES(?,?,?,?,?)",
            (key, 1 if enabled is None else enabled, target, stars, int(time.time())),
        )
        return 1
    if enabled is not None:
        con.execute("UPDATE missions_daily_override SET enabled=?, updated_at=? WHERE key=?", (enabled, int(time.time()), key))
    if target is not None:
        con.execute("UPDATE missions_daily_override SET target=?, updated_at=? WHERE key=?", (target, int(time.time()), key))
    if stars is not None:
        con.execute("UPDATE missions_daily_override SET stars=?, updated_at=? WHERE key=?", (stars, int(time.time()), key))
    return 1


def delete_daily_override(con, key: str) -> int:
    return con.execute("DELETE FROM missions_daily_override WHERE key=?", (key,)).rowcount


def eval_missions(stats, overrides: dict[str, dict] | None = None) -> list[dict]:
    overrides = overrides or {}
    out = []
    for m in MISSIONS:
        ov = overrides.get(m["key"])
        if ov is not None and not ov.get("enabled", True):
            continue
        target = ov.get("target") if ov and ov.get("target") is not None else m["target"]
        stars = ov.get("stars") if ov and ov.get("stars") is not None else m["stars"]
        cur = _metric_value(m["metric"], stats)
        done = cur is not None and cur >= target
        if m.get("min_trades") and stats["trades"] < m["min_trades"]:
            done = False
        progress = 0
        if cur is not None and target > 0:
            progress = min(100, int(cur / target * 100))
        state = "done" if done else ("active" if progress > 0 else "todo")
        out.append({
            "key": m["key"], "metric": m["metric"], "target": target,
            "stars": stars, "xp": stars,
            "current": cur, "done": done, "progress": progress, "state": state,
        })
    return out


def _star_goal() -> tuple[int, int]:
    return WEEK_STAR_GOAL, MONTH_STAR_GOAL


def _tier(total_stars: int) -> dict:
    level = sum(1 for t in TIER_THRESHOLDS if total_stars >= t) + 1
    return {"level": level, "level_name": f"lvl.{level}"}


def _sync_badges(con, total_stars: int) -> list[dict]:
    """Persist earned badges (first-earned date) and return them with details."""
    now = int(time.time())
    for key, thr in BADGE_THRESHOLDS:
        if total_stars >= thr:
            con.execute(
                "INSERT INTO badges(kind, earned_at) VALUES(?, ?) ON CONFLICT(kind) DO NOTHING",
                (key, now),
            )
    rows = {r["kind"]: r["earned_at"] for r in con.execute("SELECT * FROM badges").fetchall()}
    out = []
    for key, thr in BADGE_THRESHOLDS:
        if total_stars >= thr:
            out.append({"key": key, "threshold": thr, "earned_at": rows.get(key, now)})
    return out


def _goal_cadence_missions(con, login: int, overrides: dict[str, dict], today_stats: dict | None = None) -> list[dict]:
    """Turn active goals into daily saving missions, scored against today's net profit."""
    from .goals import plan_goal
    from .db import get_setting
    try:
        weekly_budget = float(get_setting(con, "global", "goal_budget_weekly", "0"))
    except (ValueError, TypeError):
        weekly_budget = 0.0

    # today's realized net profit (in USD) is the "savings" contribution toward the goal
    today_net_usd = 0.0
    if today_stats:
        today_net_usd = today_stats.get("net", 0.0) or 0.0

    # account USD→Toman rate, used to convert the USD profit into IRT goals
    usd_toman = 0.0
    if login:
        acc = con.execute("SELECT usd_toman FROM accounts WHERE login=?", (login,)).fetchone()
        if acc and acc["usd_toman"]:
            usd_toman = float(acc["usd_toman"])

    rows = con.execute(
        "SELECT * FROM goals WHERE status='active' ORDER BY id"
    ).fetchall()
    out = []
    for row in rows:
        g = dict(row)
        try:
            plan = plan_goal(g, today=datetime.now(TEHRAN).date(), weekly_budget=weekly_budget)
        except Exception:  # noqa: BLE001
            continue
        s = plan["suggested"]
        if s["required_weekly"] is None and s["required_monthly_to_target"] is None:
            continue
        monthly = s["required_monthly_to_target"] or s["required_weekly"] * 4.345
        weekly = s["required_weekly"] or monthly / 4.345
        goal_currency = (g.get("currency") or "USD")
        # convert today's profit into the goal's currency
        if goal_currency == "IRT" and usd_toman:
            today_net = today_net_usd * usd_toman
        else:
            today_net = today_net_usd
        # only the daily cadence is surfaced as a daily mission
        cadences = [
            ("goal_daily_" + str(g["id"]), "روزانه", weekly / 7),
        ]
        for key, label, target in cadences:
            ov = overrides.get(key)
            if ov is not None and not ov.get("enabled", True):
                continue
            tgt = ov.get("target") if ov and ov.get("target") is not None else round(float(target), 0)
            stars = ov.get("stars") if ov and ov.get("stars") is not None else 20
            done = today_net >= tgt
            progress = min(100, int(today_net / tgt * 100)) if tgt > 0 else 0
            state = "done" if done else ("active" if progress > 0 else "todo")
            out.append({
                "key": key, "metric": "goal_save", "target": tgt,
                "stars": stars, "xp": stars,
                "current": round(today_net, 2), "done": done, "progress": progress, "state": state,
                "title": f"پس‌انداز هدف «{g['name']}» — {label}",
            })
    return out


def gamification(con, login: int | None, day: date | None = None, include_goals: bool = True) -> dict:
    rows = _rows_for_login(con, login)
    by_day: dict = defaultdict(list)
    for r in rows:
        by_day[r["day"]].append(r)

    day = day or datetime.now(TEHRAN).date()
    today_stats = _day_stats(by_day.get(day, []))
    overrides = load_daily_overrides(con)
    today_missions = eval_missions(today_stats, overrides)

    # merge cadence KPIs from active goals as goal missions
    if include_goals and login:
        goal_missions = _goal_cadence_missions(con, login, overrides, today_stats)
        existing_keys = {m["key"] for m in today_missions}
        for g in goal_missions:
            if g["key"] not in existing_keys:
                today_missions.append(g)

    today_stars = sum(m["stars"] for m in today_missions if m["done"])
    today_xp = today_stars
    today_done = sum(1 for m in today_missions if m["done"])

    month_start = day.replace(day=1)
    week_start = day.fromordinal(day.toordinal() - day.weekday())

    total_stars = 0
    week_stars = 0
    month_stars = 0
    days_active = 0
    missions_done_total = 0
    for d, rs in by_day.items():
        st = _day_stats(rs)
        ms = eval_missions(st, overrides)
        done = [m for m in ms if m["done"]]
        day_stars = sum(m["stars"] for m in done)
        total_stars += day_stars
        if d >= week_start:
            week_stars += day_stars
        if d >= month_start:
            month_stars += day_stars
        missions_done_total += len(done)
        days_active += 1

    tier = _tier(total_stars)
    badges = _sync_badges(con, total_stars)
    week_goal, month_goal = _star_goal()
    stars_bar = min(5, today_done // 2 + (1 if today_stars >= 30 else 0))

    return {
        "date": day.isoformat(),
        "login": login,
        "missions": today_missions,
        "totals": {
            "today_xp": today_xp,
            "today_stars": today_stars,
            "today_done": today_done,
            "today_total": len(MISSIONS),
            "week_stars": week_stars,
            "week_goal": week_goal,
            "month_stars": month_stars,
            "month_goal": month_goal,
            "total_stars": total_stars,
            "week_xp": week_stars,
            "total_xp": total_stars,
            "level": tier["level"],
            "level_name": tier["level_name"],
            "badges": badges,
            "days_active": days_active,
            "missions_done_total": missions_done_total,
            "stars": stars_bar,
        },
    }
