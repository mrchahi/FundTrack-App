"""Goal planning math: income/savings KPIs, roadmap and progress tracking.

A goal is anything with a price (money target, a phone, a bouquet, ...).
Planning is income-based: how much to save per month, how long it takes,
and whether the target date is reachable.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta

MONTH_DAYS = 30.44


def _parse(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return datetime.strptime(str(s), "%Y-%m-%d").date()
    except ValueError:
        return None


def months_between(a: date | None, b: date | None) -> float:
    if not a or not b:
        return 0.0
    return max(0.0, (b - a).days / MONTH_DAYS)


def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    day = min(d.day, max(1, (date(y, m + 1, 1) - timedelta(days=1)).day))
    return date(y, m, day)


def plan_goal(goal: dict, current_saved: float | None = None, today: date | None = None,
              weekly_budget: float | None = None) -> dict:
    today = today or date.today()
    target = float(goal.get("target_amount") or 0)
    saved = float(current_saved if current_saved is not None else goal.get("saved_amount") or 0)
    monthly = float(goal.get("monthly_income") or 0)
    start = _parse(goal.get("start_date"))
    target_date = _parse(goal.get("target_date"))

    # if a shared weekly goal-budget is defined and this goal has an allocation
    # percentage, its allocated weekly/monthly saving becomes the plan's input.
    allocation_pct = float(goal.get("allocation_pct") or 0)
    if weekly_budget and weekly_budget > 0 and allocation_pct > 0:
        allocated_weekly = weekly_budget * (allocation_pct / 100.0)
        allocated_monthly = allocated_weekly * (MONTH_DAYS / 7.0)
        monthly = allocated_monthly

    remaining = max(0.0, target - saved)
    months_to_target = months_between(today, target_date) if target_date else None

    # auto-suggest a monthly saving when the user didn't set one: based on
    # remaining time to target, else a 12-month horizon, else 10% of target.
    required_monthly = None
    if months_to_target and months_to_target > 0 and remaining > 0:
        required_monthly = remaining / months_to_target
    if monthly <= 0:
        monthly = required_monthly if required_monthly is not None else (remaining / 12 if remaining > 0 else 0)

    months_by_income = None
    if monthly > 0 and remaining > 0:
        months_by_income = math.ceil(remaining / monthly)
        # clamp to keep the completion date within the Date range (and UI sane)
        months_by_income = min(months_by_income, 6000)
    estimated_completion = add_months(today, months_by_income) if months_by_income else None

    warnings: list[str] = []
    if target <= 0:
        warnings.append("target_zero")
    if target_date and target_date <= today:
        warnings.append("target_date_past")

    feasible = True
    if months_to_target is not None and months_by_income is not None and months_by_income > months_to_target:
        feasible = False
        warnings.append("unreachable_by_target")

    roadmap = []
    if monthly > 0 and remaining > 0:
        eq = saved
        n = months_by_income or 1
        for i in range(1, n + 1):
            end_eq = min(target, eq + monthly)
            roadmap.append({
                "month": i,
                "start_saved": round(eq, 2),
                "end_saved": round(end_eq, 2),
                "added": round(end_eq - eq, 2),
                "total_pct": round(end_eq / target * 100, 1) if target else 0,
            })
            eq = end_eq
            if eq >= target:
                break

    progress_pct = 0.0
    if target > 0:
        progress_pct = min(100.0, max(0.0, saved / target * 100))

    status = {
        "current_saved": round(saved, 2),
        "remaining": round(remaining, 2),
        "progress_pct": round(progress_pct, 1),
        "elapsed_months": round(months_between(start, today), 1) if start else 0.0,
        "remaining_months": round(months_to_target, 1) if months_to_target is not None else None,
        "estimated_completion": estimated_completion.isoformat() if estimated_completion else None,
    }

    return {
        "params": {
            "kind": goal.get("kind", "money"),
            "item_name": goal.get("item_name", ""),
            "currency": goal.get("currency", "USD"),
            "target_amount": target,
            "saved_amount": round(saved, 2),
            "monthly_income": monthly,
            "start_date": goal.get("start_date"),
            "target_date": goal.get("target_date"),
        },
        "suggested": {
            "remaining": round(remaining, 2),
            "months_by_income": months_by_income,
            "required_monthly_to_target": round(required_monthly, 2) if required_monthly is not None else None,
            "required_weekly": round(required_monthly / 4.345, 2) if required_monthly is not None else None,
            "estimated_completion": estimated_completion.isoformat() if estimated_completion else None,
            "feasible": feasible,
            "warnings": warnings,
        },
        "roadmap": roadmap,
        "status": status,
    }
