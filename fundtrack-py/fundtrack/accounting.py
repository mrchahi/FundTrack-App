"""Personal accounting: manual transactions (in/out/expense), obligations
(loans / debts / receivables) and custom daily missions built from goals
and expenses. All aggregates are computed in USD; IRT amounts are converted
using the linked account's usd_toman rate (or the first active account's)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta

from .config import TEHRAN
from .finances import month_bounds
from .goals import add_months

TXN_TYPES = ("in", "out", "expense")
OBLIGATION_KINDS = ("loan", "debt", "claim")
OBLIGATION_PERIODS = ("daily", "monthly", "yearly")
MISSION_METRICS = ("earn", "limit")
MISSION_SOURCES = ("manual", "goal", "expense")

TXN_FIELDS = {"txn_type", "amount", "currency", "category", "note", "account_login", "bank_account_id"}
OBL_FIELDS = {"kind", "title", "amount", "currency", "period", "due_date", "note", "status",
              "total_installments", "paid_installments", "installment_amount"}
BA_FIELDS = {"name", "kind", "currency", "balance", "note", "archived"}
MISSION_FIELDS = {"title", "source", "ref_id", "metric", "target", "xp", "stars", "active"}
BA_KINDS = ("bank", "cash", "wallet")
BUDGET_FIELDS = {"category", "limit", "currency", "source_type", "account_login", "bank_account_id", "pct"}


# ---------------------------------------------------------------- currency

def _account_rate(con, account_login: int | None) -> float:
    """usd_toman rate for a linked account, else the first active account's."""
    if account_login:
        row = con.execute("SELECT usd_toman FROM accounts WHERE login=? AND archived=0", (account_login,)).fetchone()
        if row and float(row["usd_toman"]) > 0:
            return float(row["usd_toman"])
    row = con.execute(
        "SELECT usd_toman FROM accounts WHERE archived=0 AND usd_toman > 0 ORDER BY login LIMIT 1",
    ).fetchone()
    return float(row["usd_toman"]) if row else 0.0


def to_usd(con, amount: float, currency: str, account_login: int | None = None) -> float | None:
    """Convert to USD. Returns None when an IRT amount cannot be converted."""
    if currency == "USD":
        return float(amount)
    rate = _account_rate(con, account_login)
    if rate <= 0:
        return None
    return float(amount) / rate


# ---------------------------------------------------------------- transactions

def txn_list(con, txn_type: str | None = None, month: str | None = None) -> list[dict]:
    q = "SELECT * FROM transactions"
    where: list[str] = []
    args: list = []
    if txn_type:
        where.append("txn_type=?")
        args.append(txn_type)
    if month:
        start_ts, end_ts = month_bounds(month)
        where.append("created_at >= ? AND created_at < ?")
        args += [start_ts, end_ts]
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY created_at DESC, id DESC"
    rows = [dict(r) for r in con.execute(q, args).fetchall()]
    for r in rows:
        r["amount"] = float(r["amount"])
        r["account_login"] = r.get("account_login")
        r["currency"] = r.get("currency") or "USD"
    return rows


def create_txn(con, body: dict) -> dict:
    fields = {k: v for k, v in body.items() if k in TXN_FIELDS}
    txn_type = fields.get("txn_type")
    if txn_type not in TXN_TYPES:
        raise ValueError("txn_type must be one of in/out/expense")
    amount = fields.get("amount")
    if amount is None or float(amount) <= 0:
        raise ValueError("amount must be positive")
    currency = fields.get("currency", "USD")
    if currency not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    created_at = int(body.get("created_at") or time.time())
    cur = con.execute(
        """INSERT INTO transactions(txn_type,amount,currency,category,note,account_login,bank_account_id,created_at)
           VALUES(?,?,?,?,?,?,?,?)""",
        (txn_type, float(amount), currency, fields.get("category", ""),
         fields.get("note", ""), fields.get("account_login"), fields.get("bank_account_id"), created_at),
    )
    row = con.execute("SELECT * FROM transactions WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def update_txn(con, tid: int, patch: dict) -> dict:
    updates = {k: v for k, v in patch.items() if k in TXN_FIELDS}
    if "txn_type" in updates and updates["txn_type"] not in TXN_TYPES:
        raise ValueError("txn_type must be one of in/out/expense")
    if "amount" in updates:
        if updates["amount"] is None or float(updates["amount"]) <= 0:
            raise ValueError("amount must be positive")
        updates["amount"] = float(updates["amount"])
    if "currency" in updates and updates["currency"] not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    if not updates:
        raise ValueError("no updatable fields")
    sets = ", ".join(f"{k}=?" for k in updates)
    con.execute(f"UPDATE transactions SET {sets} WHERE id=?", (*updates.values(), tid))
    row = con.execute("SELECT * FROM transactions WHERE id=?", (tid,)).fetchone()
    if row is None:
        raise KeyError(tid)
    return dict(row)


def delete_txn(con, tid: int) -> None:
    con.execute("DELETE FROM transactions WHERE id=?", (tid,))


# ---------------------------------------------------------------- obligations

def obligation_list(con) -> list[dict]:
    rows = [dict(r) for r in con.execute("SELECT * FROM obligations ORDER BY status='open' DESC, due_date ASC, id DESC").fetchall()]
    for r in rows:
        r["amount"] = float(r["amount"])
        r["kind"] = r.get("kind") or "debt"
        r["period"] = r.get("period") or "monthly"
        r["currency"] = r.get("currency") or "USD"
        r["status"] = r.get("status") or "open"
    return rows


def create_obligation(con, body: dict) -> dict:
    fields = {k: v for k, v in body.items() if k in OBL_FIELDS}
    kind = fields.get("kind", "debt")
    if kind not in OBLIGATION_KINDS:
        raise ValueError("kind must be one of loan/debt/claim")
    if not fields.get("title"):
        raise ValueError("title is required")
    amount = fields.get("amount")
    if amount is None or float(amount) <= 0:
        raise ValueError("amount must be positive")
    period = fields.get("period", "monthly")
    if period not in OBLIGATION_PERIODS:
        raise ValueError("period must be one of daily/monthly/yearly")
    currency = fields.get("currency", "USD")
    if currency not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    status = fields.get("status", "open")
    if status not in ("open", "closed"):
        raise ValueError("status must be open or closed")
    total_inst = fields.get("total_installments")
    paid_inst = int(fields.get("paid_installments") or 0)
    inst_amount = fields.get("installment_amount")
    if total_inst is not None:
        if int(total_inst) < paid_inst:
            raise ValueError("paid_installments cannot exceed total_installments")
        if inst_amount is None:
            total_inst = int(total_inst)
            inst_amount = round(float(amount) / total_inst, 2) if total_inst > 0 else 0.0
    cur = con.execute(
        """INSERT INTO obligations(kind,title,amount,currency,period,due_date,note,status,
           total_installments,paid_installments,installment_amount,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (kind, fields["title"], float(amount), currency, period, fields.get("due_date"),
         fields.get("note", ""), status, total_inst, paid_inst, inst_amount, int(time.time())),
    )
    row = con.execute("SELECT * FROM obligations WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def update_obligation(con, oid: int, patch: dict) -> dict:
    updates = {k: v for k, v in patch.items() if k in OBL_FIELDS}
    if "kind" in updates and updates["kind"] not in OBLIGATION_KINDS:
        raise ValueError("kind must be one of loan/debt/claim")
    if "period" in updates and updates["period"] not in OBLIGATION_PERIODS:
        raise ValueError("period must be one of daily/monthly/yearly")
    if "currency" in updates and updates["currency"] not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    if "status" in updates and updates["status"] not in ("open", "closed"):
        raise ValueError("status must be open or closed")
    if "amount" in updates:
        if updates["amount"] is None or float(updates["amount"]) <= 0:
            raise ValueError("amount must be positive")
        updates["amount"] = float(updates["amount"])
    if "total_installments" in updates and updates["total_installments"] is not None:
        updates["total_installments"] = int(updates["total_installments"])
        if updates["total_installments"] < int(updates.get("paid_installments", 0) or 0):
            raise ValueError("paid_installments cannot exceed total_installments")
    if "paid_installments" in updates:
        updates["paid_installments"] = int(updates["paid_installments"] or 0)
    if "installment_amount" in updates and updates["installment_amount"] is not None:
        updates["installment_amount"] = float(updates["installment_amount"])
    if not updates:
        raise ValueError("no updatable fields")
    sets = ", ".join(f"{k}=?" for k in updates)
    con.execute(f"UPDATE obligations SET {sets} WHERE id=?", (*updates.values(), oid))
    row = con.execute("SELECT * FROM obligations WHERE id=?", (oid,)).fetchone()
    if row is None:
        raise KeyError(oid)
    return dict(row)


def delete_obligation(con, oid: int) -> None:
    con.execute("DELETE FROM obligations WHERE id=?", (oid,))


def next_due(due_date: str | None, period: str) -> str | None:
    """Advance a due date by the obligation's period."""
    if not due_date:
        return None
    try:
        d = datetime.strptime(str(due_date), "%Y-%m-%d").date()
    except ValueError:
        return None
    if period == "daily":
        return (d + timedelta(days=1)).isoformat()
    if period == "yearly":
        return add_months(d, 12)
    return add_months(d, 1)


def obligations_summary(con) -> dict:
    items = obligation_list(con)
    open_items = [o for o in items if o["status"] == "open"]
    today = datetime.now(TEHRAN).date()
    total_open = 0.0
    for o in open_items:
        usd = to_usd(con, o["amount"], o["currency"])
        if usd is not None:
            total_open += usd
    upcoming = [o for o in open_items if o.get("due_date")]
    upcoming.sort(key=lambda o: o["due_date"])
    return {
        "total_open": round(total_open, 2),
        "count": len(open_items),
        "by_kind": {
            kind: sum(1 for o in open_items if o["kind"] == kind) for kind in OBLIGATION_KINDS
        },
        "upcoming": [o for o in upcoming if o["due_date"] <= (today + timedelta(days=30)).isoformat()][:5],
        "items": items,
    }


# ---------------------------------------------------------------- accounting summary

def month_summary(con, month: str | None = None) -> dict:
    if not month:
        month = datetime.now(TEHRAN).strftime("%Y-%m")
    txns = txn_list(con, month=month)
    income = expense = out = 0.0
    for t in txns:
        usd = to_usd(con, t["amount"], t["currency"], t.get("account_login"))
        if usd is None:
            continue
        if t["txn_type"] == "in":
            income += usd
        elif t["txn_type"] == "out":
            out += usd
        else:
            expense += usd
    total_expense = expense + out

    # category budgets: spent per category (expense transactions only)
    spent_by_cat: dict = {}
    for t in txns:
        if t["txn_type"] == "expense":
            usd = to_usd(con, t["amount"], t["currency"], t.get("account_login"))
            if usd is None:
                continue
            cat = t.get("category") or "سایر"
            spent_by_cat[cat] = spent_by_cat.get(cat, 0.0) + usd
    budgets_out = []
    overall_limit = 0.0
    for b in con.execute("SELECT * FROM budgets ORDER BY category").fetchall():
        raw_lim = _budget_limit(con, dict(b))
        lim = to_usd(con, raw_lim, b["currency"] or "USD")
        if lim is None:
            continue
        overall_limit += lim
        spent = round(spent_by_cat.get(b["category"], 0.0), 2)
        pct = round(spent / lim * 100, 1) if lim > 0 else 0.0
        budgets_out.append({
            "id": b["id"], "category": b["category"],
            "limit": round(lim, 2), "spent": spent,
            "percent": min(100.0, pct), "warn": pct >= 80.0,
        })

    return {
        "month": month,
        "income": round(income, 2),
        "expense": round(total_expense, 2),
        "expense_items": round(expense, 2),
        "withdrawals": round(out, 2),
        "net": round(income - total_expense, 2),
        "transactions": txns,
        "budgets": budgets_out,
        "budget_total_limit": round(overall_limit, 2),
        "budget_remaining": round(max(0.0, overall_limit - expense), 2),
    }


def monthly_series(con, months: int = 12) -> list[dict]:
    end = datetime.now(TEHRAN).date().replace(day=1)
    out = []
    for i in range(months - 1, -1, -1):
        y = end.year
        m = end.month - i
        while m < 1:
            m += 12
            y -= 1
        iso = f"{y:04d}-{m:02d}"
        sm = month_summary(con, iso)
        out.append({
            "month": iso,
            "income": sm["income"],
            "expense": sm["expense"],
            "net": sm["net"],
        })
    return out


# ---------------------------------------------------------------- custom missions

def custom_missions(con) -> list[dict]:
    rows = [dict(r) for r in con.execute(
        "SELECT * FROM missions_custom ORDER BY active DESC, id DESC").fetchall()]
    for r in rows:
        r["target"] = float(r["target"])
        r["xp"] = int(r.get("xp") or 10)
        r["stars"] = int(r.get("stars") or 10)
        r["active"] = int(r.get("active") or 0)
        r["metric"] = r.get("metric") or "earn"
        r["source"] = r.get("source") or "manual"
    return rows


def create_custom_mission(con, body: dict) -> dict:
    fields = {k: v for k, v in body.items() if k in MISSION_FIELDS}
    source = fields.get("source", "manual")
    if source not in MISSION_SOURCES:
        raise ValueError("source must be one of manual/goal/expense")
    metric = fields.get("metric", "earn")
    if metric not in MISSION_METRICS:
        raise ValueError("metric must be earn or limit")
    target = fields.get("target")
    if target is None or float(target) <= 0:
        raise ValueError("target must be positive")
    ref_id = fields.get("ref_id")
    title = fields.get("title", "")
    # auto-fill a title from the referenced goal / expense when missing
    if not title and source in ("goal", "expense") and ref_id:
        if source == "goal":
            g = con.execute("SELECT name FROM goals WHERE id=?", (ref_id,)).fetchone()
            if g:
                title = "هدف: " + g["name"]
        else:
            e = con.execute("SELECT name FROM expenses WHERE id=?", (ref_id,)).fetchone()
            if e:
                title = "هزینه: " + e["name"]
    if not title:
        raise ValueError("title is required")
    cur = con.execute(
        """INSERT INTO missions_custom(title,source,ref_id,metric,target,xp,stars,active,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (title, source, ref_id, metric, float(target), int(fields.get("xp") or 10),
         int(fields.get("stars") or 10), int(fields.get("active", 1)), int(time.time())),
    )
    row = con.execute("SELECT * FROM missions_custom WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def update_custom_mission(con, mid: int, patch: dict) -> dict:
    updates = {k: v for k, v in patch.items() if k in MISSION_FIELDS}
    if "source" in updates and updates["source"] not in MISSION_SOURCES:
        raise ValueError("source must be one of manual/goal/expense")
    if "metric" in updates and updates["metric"] not in MISSION_METRICS:
        raise ValueError("metric must be earn or limit")
    if "target" in updates:
        if updates["target"] is None or float(updates["target"]) <= 0:
            raise ValueError("target must be positive")
        updates["target"] = float(updates["target"])
    if "xp" in updates:
        updates["xp"] = int(updates["xp"] or 0)
    if "stars" in updates:
        updates["stars"] = int(updates["stars"] or 0)
    if "active" in updates:
        updates["active"] = int(1 if updates["active"] else 0)
    if not updates:
        raise ValueError("no updatable fields")
    sets = ", ".join(f"{k}=?" for k in updates)
    con.execute(f"UPDATE missions_custom SET {sets} WHERE id=?", (*updates.values(), mid))
    row = con.execute("SELECT * FROM missions_custom WHERE id=?", (mid,)).fetchone()
    if row is None:
        raise KeyError(mid)
    return dict(row)


def delete_custom_mission(con, mid: int) -> None:
    con.execute("DELETE FROM missions_custom WHERE id=?", (mid,))


def eval_custom_missions(con, day=None) -> list[dict]:
    """Evaluate active custom missions against today's transactions."""
    day = day or datetime.now(TEHRAN).date()
    start_dt = datetime.combine(day, datetime.min.time(), tzinfo=TEHRAN)
    end_dt = start_dt + timedelta(days=1)
    start_ts, end_ts = int(start_dt.timestamp()), int(end_dt.timestamp())

    txns = [dict(r) for r in con.execute(
        "SELECT * FROM transactions WHERE created_at >= ? AND created_at < ?",
        (start_ts, end_ts)).fetchall()]
    today_in = 0.0
    today_expense = 0.0
    for t in txns:
        usd = to_usd(con, t["amount"], t["currency"], t.get("account_login"))
        if usd is None:
            continue
        if t["txn_type"] == "in":
            today_in += usd
        elif t["txn_type"] == "expense":
            today_expense += usd

    out = []
    for m in custom_missions(con):
        if not m["active"]:
            continue
        metric = m["metric"]
        if metric == "earn":
            cur = today_in
            done = cur >= m["target"]
        else:
            cur = today_expense
            done = cur <= m["target"]
        progress = 0
        if m["target"] > 0:
            progress = min(100, int(cur / m["target"] * 100))
        state = "done" if done else ("active" if progress > 0 else "todo")
        desc = ""
        if m["source"] == "goal" and m.get("ref_id"):
            g = con.execute("SELECT name FROM goals WHERE id=?", (m["ref_id"],)).fetchone()
            if g:
                desc = f"برای رسیدن به هدف «{g['name']}»، امروز حداقل {m['target']:g} واریز کن"
        elif m["source"] == "expense" and m.get("ref_id"):
            e = con.execute("SELECT name FROM expenses WHERE id=?", (m["ref_id"],)).fetchone()
            if e:
                desc = f"خرج امروز را زیر سقف «{e['name']}» نگه دار"
        out.append({
            "key": f"custom_{m['id']}",
            "id": m["id"],
            "title": m["title"],
            "desc": desc,
            "source": m["source"],
            "ref_id": m.get("ref_id"),
            "metric": metric,
            "target": m["target"],
            "xp": m["xp"],
            "stars": m["stars"],
            "current": round(cur, 2),
            "done": done,
            "state": state,
            "progress": progress,
        })
    return out


# ---------------------------------------------------------------- bank accounts

def bank_accounts(con) -> list[dict]:
    rows = [dict(r) for r in con.execute("SELECT * FROM bank_accounts ORDER BY archived, id").fetchall()]
    for r in rows:
        r["balance"] = float(r["balance"] or 0)
        r["currency"] = r.get("currency") or "USD"
        r["kind"] = r.get("kind") or "bank"
        r["archived"] = int(r.get("archived") or 0)
    return rows


def create_bank_account(con, body: dict) -> dict:
    fields = {k: v for k, v in body.items() if k in BA_FIELDS}
    if not fields.get("name"):
        raise ValueError("name is required")
    kind = fields.get("kind", "bank")
    if kind not in BA_KINDS:
        raise ValueError("kind must be one of bank/cash/wallet")
    currency = fields.get("currency", "USD")
    if currency not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    cur = con.execute(
        """INSERT INTO bank_accounts(name,kind,currency,balance,note,archived,created_at)
           VALUES(?,?,?,?,?,?,?)""",
        (fields["name"], kind, currency, float(fields.get("balance") or 0),
         fields.get("note", ""), int(fields.get("archived", 0)), int(time.time())),
    )
    row = con.execute("SELECT * FROM bank_accounts WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def update_bank_account(con, baid: int, patch: dict) -> dict:
    updates = {k: v for k, v in patch.items() if k in BA_FIELDS}
    if "kind" in updates and updates["kind"] not in BA_KINDS:
        raise ValueError("kind must be one of bank/cash/wallet")
    if "currency" in updates and updates["currency"] not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    if "balance" in updates:
        updates["balance"] = float(updates["balance"] or 0)
    if "archived" in updates:
        updates["archived"] = int(1 if updates["archived"] else 0)
    if not updates:
        raise ValueError("no updatable fields")
    sets = ", ".join(f"{k}=?" for k in updates)
    con.execute(f"UPDATE bank_accounts SET {sets} WHERE id=?", (*updates.values(), baid))
    row = con.execute("SELECT * FROM bank_accounts WHERE id=?", (baid,)).fetchone()
    if row is None:
        raise KeyError(baid)
    return dict(row)


def delete_bank_account(con, baid: int) -> None:
    con.execute("DELETE FROM bank_accounts WHERE id=?", (baid,))


# ---------------------------------------------------------------- budgets

def _account_balance(con, b: dict) -> float | None:
    """Current balance of the referenced account (bank record or MT5 snapshot)."""
    if b.get("bank_account_id"):
        r = con.execute("SELECT balance FROM bank_accounts WHERE id=?", (b["bank_account_id"],)).fetchone()
        return float(r["balance"]) if r else None
    if b.get("account_login"):
        r = con.execute(
            "SELECT balance FROM snapshots WHERE login=? ORDER BY t DESC LIMIT 1",
            (b["account_login"],)).fetchone()
        return float(r["balance"]) if r else None
    return None


def _budget_limit(con, b: dict) -> float | None:
    """Resolve a budget's limit in its own currency."""
    if b.get("source_type") == "percent":
        bal = _account_balance(con, b)
        pct = float(b.get("pct") or 0)
        if bal is None or pct <= 0:
            return 0.0
        return round(bal * pct / 100.0, 2)
    return float(b.get("limit_amount") or 0)


def _normalize_budget(con, row: dict) -> dict:
    row["limit"] = float(_budget_limit(con, row))
    row["currency"] = row.get("currency") or "USD"
    return row


def budgets(con) -> list[dict]:
    rows = [dict(r) for r in con.execute("SELECT * FROM budgets ORDER BY category").fetchall()]
    return [_normalize_budget(con, r) for r in rows]


def create_budget(con, body: dict) -> dict:
    fields = {k: v for k, v in body.items() if k in BUDGET_FIELDS}
    cat = fields.get("category")
    if not cat:
        raise ValueError("category is required")
    source_type = fields.get("source_type", "fixed")
    if source_type not in ("fixed", "percent"):
        raise ValueError("source_type must be fixed or percent")
    if source_type == "percent":
        pct = fields.get("pct")
        if pct is None or float(pct) <= 0:
            raise ValueError("pct must be positive")
        if not fields.get("bank_account_id") and not fields.get("account_login"):
            raise ValueError("برای بودجه درصدی، یک حساب انتخاب کنید")
        limit = 0.0
    else:
        limit = fields.get("limit")
        if limit is None or float(limit) <= 0:
            raise ValueError("limit must be positive")
        limit = float(limit)
        pct = None
    currency = fields.get("currency", "USD")
    if currency not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    if con.execute("SELECT id FROM budgets WHERE category=?", (cat,)).fetchone():
        raise ValueError("این دسته از قبل بودجه دارد")
    cur = con.execute(
        """INSERT INTO budgets(category,limit_amount,currency,source_type,account_login,bank_account_id,pct,created_at)
           VALUES(?,?,?,?,?,?,?,?)""",
        (cat, limit, currency, source_type, fields.get("account_login"),
         fields.get("bank_account_id"), pct, int(time.time())),
    )
    row = con.execute("SELECT * FROM budgets WHERE id=?", (cur.lastrowid,)).fetchone()
    return _normalize_budget(con, dict(row))


def update_budget(con, bid: int, patch: dict) -> dict:
    updates = {k: v for k, v in patch.items() if k in BUDGET_FIELDS}
    source_type = updates.get("source_type", patch.get("source_type"))
    if source_type is not None and source_type not in ("fixed", "percent"):
        raise ValueError("source_type must be fixed or percent")
    if source_type == "percent":
        updates["limit"] = 0.0
        updates["source_type"] = "percent"
        if "pct" not in updates:
            cur = con.execute("SELECT pct FROM budgets WHERE id=?", (bid,)).fetchone()
            updates["pct"] = cur["pct"] if cur else None
        if not updates.get("bank_account_id") and not updates.get("account_login"):
            cur = con.execute("SELECT bank_account_id, account_login FROM budgets WHERE id=?", (bid,)).fetchone()
            updates.setdefault("bank_account_id", cur["bank_account_id"] if cur else None)
            updates.setdefault("account_login", cur["account_login"] if cur else None)
    elif "limit" in updates:
        if updates["limit"] is None or float(updates["limit"]) <= 0:
            raise ValueError("limit must be positive")
        updates["limit"] = float(updates["limit"])
        updates["source_type"] = "fixed"
    if "currency" in updates and updates["currency"] not in ("USD", "IRT"):
        raise ValueError("currency must be USD or IRT")
    if "category" in updates:
        cat = updates["category"]
        other = con.execute("SELECT id FROM budgets WHERE category=? AND id<>?", (cat, bid)).fetchone()
        if other:
            raise ValueError("این دسته از قبل بودجه دارد")
    if not updates:
        raise ValueError("no updatable fields")
    col_map = {"limit": "limit_amount"}
    sets = ", ".join(f"{col_map.get(k, k)}=?" for k in updates)
    con.execute(f"UPDATE budgets SET {sets} WHERE id=?", (*updates.values(), bid))
    row = con.execute("SELECT * FROM budgets WHERE id=?", (bid,)).fetchone()
    if row is None:
        raise KeyError(bid)
    return _normalize_budget(con, dict(row))


def delete_budget(con, bid: int) -> None:
    con.execute("DELETE FROM budgets WHERE id=?", (bid,))


# ---------------------------------------------------------------- installment payment

def pay_installment(con, oid: int, bank_account_id: int) -> dict:
    ob = con.execute("SELECT * FROM obligations WHERE id=?", (oid,)).fetchone()
    if ob is None:
        raise KeyError(oid)
    ob = dict(ob)
    if ob.get("status") != "open":
        raise ValueError("این تعهد بسته است")
    inst = float(ob.get("installment_amount") or 0)
    if inst <= 0:
        raise ValueError("این تعهد قسط‌بندی نشده است")
    paid = int(ob.get("paid_installments") or 0)
    total = ob.get("total_installments")
    if total is not None and paid >= int(total):
        raise ValueError("همه اقساط پرداخت شده‌اند")

    ba = con.execute("SELECT * FROM bank_accounts WHERE id=?", (bank_account_id,)).fetchone()
    if ba is None:
        raise KeyError(bank_account_id)
    ba = dict(ba)

    ob_cur = ob.get("currency") or "USD"
    ba_cur = ba.get("currency") or "USD"
    if ob_cur == ba_cur:
        needed = inst
    elif ob_cur == "USD" and ba_cur == "IRT":
        rate = _account_rate(con, None)
        if rate <= 0:
            raise ValueError("برای تبدیل IRT به USD نرخ تومان لازم است")
        needed = round(inst * rate, 0)
    elif ob_cur == "IRT" and ba_cur == "USD":
        rate = _account_rate(con, None)
        if rate <= 0:
            raise ValueError("برای تبدیل IRT به USD نرخ تومان لازم است")
        needed = round(inst / rate, 2)
    else:
        raise ValueError("ارزهای پشتیبانی‌نشده")

    bal = float(ba.get("balance") or 0)
    if bal < needed:
        raise ValueError(f"موجودی کافی نیست (لازم: {needed:,.2f} {ba_cur})")

    # deduct from bank account
    con.execute("UPDATE bank_accounts SET balance=? WHERE id=?", (round(bal - needed, 2), bank_account_id))
    # record an outflow transaction
    con.execute(
        """INSERT INTO transactions(txn_type,amount,currency,category,note,bank_account_id,created_at)
           VALUES('out',?,?,'قسط وام',?,?,?)""",
        (needed, ba_cur, f"پرداخت قسط: {ob['title']}", bank_account_id, int(time.time())),
    )
    # advance installments
    new_paid = paid + 1
    remaining = max(0.0, float(ob.get("amount") or 0) - inst)
    closed = remaining <= 0.01 or (total is not None and new_paid >= int(total))
    status = "closed" if closed else "open"
    con.execute(
        "UPDATE obligations SET amount=?, paid_installments=?, status=? WHERE id=?",
        (round(remaining, 2), new_paid, status, oid),
    )
    row = con.execute("SELECT * FROM obligations WHERE id=?", (oid,)).fetchone()
    return dict(row)


# ---------------------------------------------------------------- recurring expenses & notifications

def process_recurring(con, today=None) -> int:
    today = today or datetime.now(TEHRAN).date()
    month_iso = today.strftime("%Y-%m")
    created = 0
    for e in con.execute(
        "SELECT * FROM expenses WHERE recurring=1 AND day_of_month IS NOT NULL"
    ).fetchall():
        dom = int(e["day_of_month"])
        if today.day < dom:
            continue
        if (e["last_generated"] or "") == month_iso:
            continue
        con.execute(
            """INSERT INTO transactions(txn_type,amount,currency,category,note,created_at)
               VALUES('expense',?,?,'هزینه ثابت',?,?)""",
            (float(e["amount"]), e["currency"] or "USD", e["name"], int(time.time())),
        )
        con.execute("UPDATE expenses SET last_generated=? WHERE id=?", (month_iso, e["id"]))
        created += 1
    return created


def _next_dom(d: date, dom: int) -> date:
    import calendar
    last = calendar.monthrange(d.year, d.month)[1]
    cand = d.replace(day=min(dom, last))
    if cand < d:
        ny, nm = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
        last2 = calendar.monthrange(ny, nm)[1]
        cand = date(ny, nm, min(dom, last2))
    return cand


def generate_due_notifications(con, today=None) -> int:
    today = today or datetime.now(TEHRAN).date()
    end = today + timedelta(days=3)
    count = 0

    for o in con.execute(
        "SELECT * FROM obligations WHERE status='open' AND due_date IS NOT NULL"
    ).fetchall():
        try:
            d = datetime.strptime(str(o["due_date"]), "%Y-%m-%d").date()
        except ValueError:
            continue
        if today <= d <= end:
            exists = con.execute(
                "SELECT id FROM notifications WHERE ref_type='obligation' AND ref_id=? AND seen=0",
                (o["id"],),
            ).fetchone()
            if not exists:
                con.execute(
                    """INSERT INTO notifications(kind,title,body,ref_type,ref_id,due_date,created_at)
                       VALUES('due',?,?,?,?,?,?)""",
                    (f"سررسید: {o['title']}", f"{(d - today).days} روز باقی مانده",
                     "obligation", o["id"], o["due_date"], int(time.time())),
                )
                count += 1

    for e in con.execute(
        "SELECT * FROM expenses WHERE recurring=1 AND day_of_month IS NOT NULL"
    ).fetchall():
        cand = _next_dom(today, int(e["day_of_month"]))
        if cand <= end:
            exists = con.execute(
                "SELECT id FROM notifications WHERE ref_type='expense' AND ref_id=? AND seen=0",
                (e["id"],),
            ).fetchone()
            if not exists:
                con.execute(
                    """INSERT INTO notifications(kind,title,body,ref_type,ref_id,due_date,created_at)
                       VALUES('due',?,?,?,?,?,?)""",
                    (f"هزینه ثابت: {e['name']}", f"{(cand - today).days} روز باقی مانده",
                     "expense", e["id"], cand.isoformat(), int(time.time())),
                )
                count += 1
    return count


def notifications(con, unread_only: bool = False) -> list[dict]:
    q = "SELECT * FROM notifications"
    if unread_only:
        q += " WHERE seen=0"
    q += " ORDER BY created_at DESC, id DESC"
    rows = [dict(r) for r in con.execute(q).fetchall()]
    today = datetime.now(TEHRAN).date()
    for r in rows:
        r["seen"] = int(r.get("seen") or 0)
        days_left = None
        if r.get("due_date"):
            try:
                days_left = (datetime.strptime(str(r["due_date"]), "%Y-%m-%d").date() - today).days
            except ValueError:
                days_left = None
        r["days_left"] = days_left
    return rows


def mark_notifications_seen(con, ids: list[int]) -> int:
    if not ids:
        return 0
    placeholders = ",".join("?" for _ in ids)
    cur = con.execute(f"UPDATE notifications SET seen=1 WHERE id IN ({placeholders})", ids)
    return cur.rowcount
