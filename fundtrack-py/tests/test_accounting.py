"""Tests for the personal-accounting module: transactions, obligations,
monthly summary/series, and custom missions (built from goals/expenses)."""
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from fundtrack.api import create_app
from fundtrack.config import TEHRAN


def _month():
    return datetime.now(TEHRAN).strftime("%Y-%m")


def test_transactions_crud_and_month_filter(svc):
    svc.sync()
    c = TestClient(create_app(svc))

    t_in = c.post("/api/transactions", json={
        "txn_type": "in", "amount": 250, "currency": "USD", "category": "سود", "note": "deposit",
    }).json()
    assert t_in["id"] > 0
    t_out = c.post("/api/transactions", json={"txn_type": "out", "amount": 50, "currency": "USD"}).json()
    t_exp = c.post("/api/transactions", json={"txn_type": "expense", "amount": 30, "currency": "USD"}).json()

    lst = c.get("/api/transactions").json()
    assert len(lst) == 3
    assert c.get("/api/transactions?type=in").json()[0]["id"] == t_in["id"]
    assert c.get(f"/api/transactions?month={_month()}").json()  # today's month contains them
    assert c.get("/api/transactions?month=2020-01").json() == []

    assert c.patch(f"/api/transactions/{t_out['id']}", json={"amount": 60}).json()["amount"] == 60
    assert c.patch("/api/transactions/999999", json={"amount": 1}).status_code == 404
    assert c.post("/api/transactions", json={"txn_type": "bogus", "amount": 1}).status_code == 400
    assert c.post("/api/transactions", json={"txn_type": "in", "amount": -5}).status_code == 400

    assert c.delete(f"/api/transactions/{t_exp['id']}").status_code == 200
    assert len(c.get("/api/transactions").json()) == 2


def test_irt_conversion_uses_account_rate(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    c.patch("/api/accounts/555", json={"usd_toman": 60000})
    c.post("/api/transactions", json={"txn_type": "expense", "amount": 6_000_000, "currency": "IRT"}).json()
    sm = c.get("/api/accounting/summary").json()
    assert sm["expense"] == 100.0          # 6,000,000 IRT / 60,000
    assert sm["expense_items"] == 100.0


def test_obligations_crud_and_summary(svc):
    svc.sync()
    c = TestClient(create_app(svc))

    loan = c.post("/api/obligations", json={
        "kind": "loan", "title": "وام مسکن", "amount": 5000, "currency": "USD",
        "period": "monthly", "due_date": "2026-11-20", "note": "",
    }).json()
    assert loan["id"] > 0
    debt = c.post("/api/obligations", json={
        "kind": "debt", "title": "قرض", "amount": 200, "period": "daily", "due_date": "2026-11-10",
    }).json()
    claim = c.post("/api/obligations", json={
        "kind": "claim", "title": "طلب از علی", "amount": 300, "period": "yearly", "due_date": "2027-01-01",
    }).json()

    assert c.post("/api/obligations", json={"kind": "x", "title": "t", "amount": 1}).status_code == 400
    assert c.post("/api/obligations", json={"kind": "loan", "title": "", "amount": 1}).status_code == 400
    assert c.patch("/api/obligations/999999", json={"status": "closed"}).status_code == 404

    summ = c.get("/api/obligations").json()
    assert summ["count"] == 3
    assert summ["by_kind"] == {"loan": 1, "debt": 1, "claim": 1}
    assert summ["total_open"] == 5500.0
    assert summ["upcoming"][0]["title"] == "قرض"      # earliest due date

    assert c.patch(f"/api/obligations/{loan['id']}", json={"status": "closed"}).json()["status"] == "closed"
    assert c.get("/api/obligations").json()["count"] == 2
    assert c.delete(f"/api/obligations/{debt['id']}").status_code == 200


def test_accounting_summary_and_series(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    c.post("/api/transactions", json={"txn_type": "in", "amount": 500, "currency": "USD"}).json()
    c.post("/api/transactions", json={"txn_type": "expense", "amount": 120, "currency": "USD"}).json()
    c.post("/api/transactions", json={"txn_type": "out", "amount": 80, "currency": "USD"}).json()

    sm = c.get("/api/accounting/summary").json()
    assert sm["month"] == _month()
    assert sm["income"] == 500
    assert sm["expense"] == 200           # expense + out
    assert sm["withdrawals"] == 80
    assert sm["net"] == 300

    series = c.get("/api/accounting/series?months=12").json()
    assert len(series) == 12
    assert series[-1]["month"] == _month()
    assert series[-1]["income"] == 500 and series[-1]["expense"] == 200


def test_custom_missions_eval_and_merged_daily(svc):
    svc.sync()
    c = TestClient(create_app(svc))

    g = c.post("/api/goals", json={
        "name": "گوشی", "kind": "item", "target_amount": 1000, "currency": "USD",
    }).json()
    e = c.post("/api/expenses", json={"name": "اجاره", "amount": 600, "currency": "USD"}).json()

    # mission from a goal: earn $200 today
    m_goal = c.post("/api/missions/custom", json={
        "title": "", "source": "goal", "ref_id": g["id"], "metric": "earn", "target": 200, "xp": 20,
    }).json()
    assert "هدف" in m_goal["title"]          # auto-title from goal name
    # mission from an expense: keep daily spending under $100
    m_exp = c.post("/api/missions/custom", json={
        "source": "expense", "ref_id": e["id"], "metric": "limit", "target": 100,
    }).json()
    assert "هزینه" in m_exp["title"]
    # manual mission
    m_man = c.post("/api/missions/custom", json={
        "title": "تمرکز", "source": "manual", "metric": "earn", "target": 50,
    }).json()
    assert m_man["id"] > 0

    assert c.post("/api/missions/custom", json={"source": "goal", "metric": "bad"}).status_code == 400
    assert c.post("/api/missions/custom", json={"source": "manual", "metric": "earn", "target": 0}).status_code == 400
    assert c.patch("/api/missions/custom/999999", json={"active": False}).status_code == 404

    # no transactions yet -> earn-missions not done; the spending-cap is done (0 spent)
    daily0 = c.get("/api/missions/daily").json()
    custom0 = [m for m in daily0["missions"] if m["key"].startswith("custom_")]
    assert len(custom0) == 3
    assert all(not m["done"] for m in custom0 if m["metric"] == "earn")
    assert all(m["done"] for m in custom0 if m["metric"] == "limit")
    assert daily0["totals"]["today_total"] == 10 + 3

    # deposit $250 and spend $60 today -> both goal & expense missions complete
    c.post("/api/transactions", json={"txn_type": "in", "amount": 250, "currency": "USD"}).json()
    c.post("/api/transactions", json={"txn_type": "expense", "amount": 60, "currency": "USD"}).json()
    daily1 = c.get("/api/missions/daily").json()
    custom1 = {m["key"]: m for m in daily1["missions"] if m["key"].startswith("custom_")}
    assert custom1[f"custom_{m_goal['id']}"]["done"] is True
    assert custom1[f"custom_{m_goal['id']}"]["current"] == 250
    assert custom1[f"custom_{m_exp['id']}"]["done"] is True
    assert custom1[f"custom_{m_exp['id']}"]["current"] == 60
    assert custom1[f"custom_{m_man['id']}"]["done"] is True
    tl = daily1["totals"]
    assert tl["today_done"] >= 3
    assert tl["today_stars"] >= m_goal["stars"] + m_exp["stars"] + m_man["stars"]

    # disabling removes it from the daily list
    c.patch(f"/api/missions/custom/{m_man['id']}", json={"active": False})
    daily2 = c.get("/api/missions/daily").json()
    custom2 = [m for m in daily2["missions"] if m["key"].startswith("custom_")]
    assert len(custom2) == 2

    assert c.delete(f"/api/missions/custom/{m_goal['id']}").status_code == 200
    assert len(c.get("/api/missions/custom").json()) == 2


def test_bank_accounts_crud(svc):
    c = TestClient(create_app(svc))
    ba = c.post("/api/bank-accounts", json={
        "name": "حساب اصلی", "kind": "bank", "currency": "IRT", "balance": 10_000_000,
    }).json()
    assert ba["id"] > 0 and ba["balance"] == 10_000_000.0
    assert c.patch(f"/api/bank-accounts/{ba['id']}", json={"balance": 20_000_000}).json()["balance"] == 20_000_000.0
    assert c.post("/api/bank-accounts", json={"name": "x", "kind": "bad"}).status_code == 400
    assert c.patch("/api/bank-accounts/999999", json={"balance": 1}).status_code == 404
    assert c.delete(f"/api/bank-accounts/{ba['id']}").status_code == 200


def test_installment_pay_strict_and_close(svc):
    c = TestClient(create_app(svc))
    ba = c.post("/api/bank-accounts", json={"name": "USD", "currency": "USD", "balance": 300}).json()
    obl = c.post("/api/obligations", json={
        "kind": "loan", "title": "وام", "amount": 600, "currency": "USD",
        "total_installments": 3, "installment_amount": 200,
    }).json()
    assert obl["paid_installments"] == 0 and obl["installment_amount"] == 200.0

    # unknown bank on an open obligation -> 404
    assert c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": 999999}).status_code == 404

    # first payment ok: 300 -> 100, paid=1, remaining 400
    r1 = c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": ba["id"]})
    assert r1.status_code == 200 and r1.json()["paid_installments"] == 1
    assert c.get(f"/api/bank-accounts").json()[0]["balance"] == 100.0

    # second payment must FAIL (needs 200 > 100)
    r2 = c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": ba["id"]})
    assert r2.status_code == 400

    # top up and finish -> closed
    c.patch(f"/api/bank-accounts/{ba['id']}", json={"balance": 500})
    c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": ba["id"]})
    r3 = c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": ba["id"]})
    assert r3.status_code == 200
    assert r3.json()["status"] == "closed" and r3.json()["paid_installments"] == 3
    # paying a closed obligation -> 400
    assert c.post(f"/api/obligations/{obl['id']}/pay", json={"bank_account_id": ba["id"]}).status_code == 400

    # unknown obligation -> 404
    assert c.post("/api/obligations/999999/pay", json={"bank_account_id": ba["id"]}).status_code == 404


def test_recurring_expense_and_notifications(svc):
    c = TestClient(create_app(svc))
    today = datetime.now(TEHRAN).date()

    # recurring expense due today -> sync generates an expense transaction
    c.post("/api/expenses", json={
        "name": "قبض", "amount": 100, "currency": "USD", "recurring": 1, "day_of_month": today.day,
    })
    c.post("/api/sync")
    txns = c.get("/api/transactions?type=expense").json()
    assert any(t["category"] == "هزینه ثابت" and t["note"] == "قبض" for t in txns)

    # obligation due within 3 days -> notification created
    obl = c.post("/api/obligations", json={
        "kind": "debt", "title": "قرض", "amount": 100, "currency": "USD",
        "due_date": (today + timedelta(days=2)).isoformat(),
    }).json()
    c.post("/api/sync")
    notifs = c.get("/api/notifications").json()
    assert any(n["ref_type"] == "obligation" and n["ref_id"] == obl["id"] for n in notifs)

    unread = c.get("/api/notifications?unread_only=true").json()
    assert unread
    c.post("/api/notifications/seen", json={"ids": [n["id"] for n in unread]})
    assert c.get("/api/notifications?unread_only=true").json() == []


def test_budgets_crud_and_summary(svc):
    c = TestClient(create_app(svc))
    b = c.post("/api/budgets", json={"category": "معیشت", "limit": 500, "currency": "USD"}).json()
    assert b["id"] > 0
    assert c.post("/api/budgets", json={"category": "معیشت", "limit": 100}).status_code == 400   # duplicate

    c.post("/api/transactions", json={"txn_type": "expense", "amount": 200, "currency": "USD", "category": "معیشت"}).json()
    sm = c.get("/api/accounting/summary").json()
    bg = [x for x in sm["budgets"] if x["category"] == "معیشت"]
    assert bg and bg[0]["spent"] == 200 and bg[0]["percent"] == 40 and bg[0]["warn"] is False
    assert sm["budget_remaining"] == 300

    assert c.patch(f"/api/budgets/{b['id']}", json={"limit": 150}).json()["limit"] == 150
    assert c.patch("/api/budgets/999999", json={"limit": 100}).status_code == 404
    assert c.delete(f"/api/budgets/{b['id']}").status_code == 200


def test_news_import_upsert_and_clear(svc):
    c = TestClient(create_app(svc))
    csv_text = (
        "Title,Country,Date,Time,Impact,Forecast,Previous,URL\n"
        "CPI y/y,CNY,11-09-2026,1:30am,High,0.8%,0.9%,https://x/1\n"
        "PPI,CNY,11-10-2026,5:00am,Low,,,https://x/2\n"
    )
    r = c.post("/api/news/upload", content=csv_text.encode(), headers={"Content-Type": "text/csv"})
    assert r.status_code == 200 and r.json()["imported"] == 2
    events = c.get("/api/news").json()
    assert len(events) == 2
    assert events[0]["event_date"] == "2026-11-09"
    assert events[0]["impact"] == "High"
    # re-upload refreshes instead of duplicating
    c.post("/api/news/upload", content=csv_text.encode(), headers={"Content-Type": "text/csv"})
    assert len(c.get("/api/news").json()) == 2
    assert c.get("/api/news").json()[0]["forecast"] == "0.8%"
    assert c.delete("/api/news").json()["deleted"] == 2
    assert c.get("/api/news").json() == []
