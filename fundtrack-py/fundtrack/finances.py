"""Personal accounting: fixed monthly expenses, budget and goal allocation."""
from __future__ import annotations

from datetime import datetime, timezone

from .config import TEHRAN


def month_bounds(month_iso: str):
    """'YYYY-MM' -> (start_ts, end_ts) in Tehran time."""
    y, m = int(month_iso[:4]), int(month_iso[5:7])
    start = datetime(y, m, 1, tzinfo=TEHRAN)
    next_y = y + (m // 12)
    next_m = m % 12 + 1
    end = datetime(next_y, next_m, 1, tzinfo=TEHRAN)
    return int(start.timestamp()), int(end.timestamp())


def month_summary(con, login: int | None, month_iso: str, goals_rows=None, expense_rows=None) -> dict:
    start_ts, end_ts = month_bounds(month_iso)
    q = "SELECT net FROM trades WHERE is_open=0 AND close_t >= ? AND close_t < ?"
    args: list = [start_ts, end_ts]
    if login:
        q += " AND login=?"
        args.append(login)
    nets = [r["net"] for r in con.execute(q, args).fetchall()]
    net = sum(nets)
    gross_profit = sum(x for x in nets if x > 0)
    gross_loss = -sum(x for x in nets if x < 0)
    wins = sum(1 for x in nets if x > 0)
    trades_count = len(nets)

    exp = expense_rows if expense_rows is not None else [dict(r) for r in con.execute("SELECT * FROM expenses").fetchall()]
    expenses_total = sum(float(e["amount"]) for e in exp)
    covered = net >= expenses_total if expenses_total > 0 else True
    surplus = net - expenses_total

    goals = goals_rows if goals_rows is not None else [dict(r) for r in con.execute(
        "SELECT * FROM goals WHERE status IN ('active','archived') ORDER BY status='active' DESC, target_date ASC").fetchall()]

    # prioritization: active first, then nearest target date, then smallest remaining
    def prio(g):
        remaining = max(0.0, float(g.get("target_amount") or 0) - float(g.get("saved_amount") or 0))
        tdate = g.get("target_date") or "9999"
        return (0 if g.get("status") == "active" else 1, tdate, remaining)

    ordered = sorted(goals, key=prio)
    alloc = surplus
    goal_alloc = []
    for g in ordered:
        remaining = max(0.0, float(g.get("target_amount") or 0) - float(g.get("saved_amount") or 0))
        amount = 0.0
        reason = None
        if alloc > 0 and remaining > 0:
            amount = min(remaining, alloc)
            alloc -= amount
            reason = "nearest" if g.get("status") == "active" else "priority"
        goal_alloc.append({
            "id": g["id"], "name": g["name"], "status": g.get("status"),
            "remaining": round(remaining, 2), "allocated": round(amount, 2),
            "reason": reason,
            "progress_pct": round(min(100, (float(g.get("saved_amount") or 0) / float(g.get("target_amount") or 1) * 100)), 1),
        })

    return {
        "month": month_iso,
        "login": login,
        "stats": {
            "trades": trades_count,
            "wins": wins,
            "net": round(net, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
        },
        "expenses": {
            "total": round(expenses_total, 2),
            "covered": covered,
            "items": [{**e, "amount": round(float(e["amount"]), 2)} for e in exp],
            "surplus": round(surplus, 2),
        },
        "allocation": goal_alloc,
    }
