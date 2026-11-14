from fastapi.testclient import TestClient

from fundtrack.api import create_app


def test_api_roundtrip(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    assert c.get("/api/status").json()["counts"]["trades"] == 3      # two closed + one open
    s = c.get("/api/summary").json()
    assert s["stats"]["trades"] == 2
    t = c.get("/api/trades?source=ea").json()
    assert t["total"] == 1 and t["items"][0]["source"] == "ea"
    assert c.get("/api/breakdown?by=session").status_code == 200
    assert c.get("/api/breakdown?by=bogus").status_code == 400
    assert c.get("/api/positions").json()[0]["ticket"] == 303

    # new endpoints
    assert c.get("/api/filter-options").json()["symbols"] == ["XAUUSD"]
    assert c.get("/api/net-by-period?period=month").json()[0]["trades"] == 2
    assert c.get("/api/durations").json()
    assert c.get("/api/heatmap").json()["weekdays"]
    assert c.get("/api/journal.csv").status_code == 200


def test_account_patch_and_settings(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    r = c.patch("/api/accounts/555", json={"usd_toman": 60000, "note": "main", "archived": False})
    assert r.status_code == 200
    assert r.json()["usd_toman"] == 60000
    assert c.get("/api/accounts").json()[0]["note"] == "main"

    assert c.put("/api/settings", json={"show_toman": True, "default_range": "week"}).json()["show_toman"] is True
    s = c.get("/api/settings").json()
    assert s["show_toman"] is True and s["default_range"] == "week"

    assert c.patch("/api/accounts/999999", json={"note": "x"}).status_code == 404


def test_extended_settings_and_pin(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    assert c.put("/api/settings", json={
        "theme": "aurora", "accent": "sky", "lang": "en",
        "base_currency": "IRT", "security_pin": "1234",
    }).status_code == 200
    s = c.get("/api/settings").json()
    assert s["theme"] == "aurora" and s["accent"] == "sky" and s["lang"] == "en"
    assert s["base_currency"] == "IRT" and s["pin_set"] is True
    assert "pin_hash" not in s
    assert c.post("/api/verify-pin", json={"pin": "1234"}).json()["ok"] is True
    assert c.post("/api/verify-pin", json={"pin": "0000"}).json()["ok"] is False
    assert c.put("/api/settings", json={"security_pin": ""}).status_code == 200
    assert c.get("/api/settings").json()["pin_set"] is False


def test_goals_crud_and_plan(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    g = c.post("/api/goals", json={
        "name": "گوشی", "kind": "item", "item_name": "Phone", "currency": "IRT",
        "target_amount": 30000000, "saved_amount": 5000000,
        "monthly_income": 3000000, "start_date": "2026-07-23", "target_date": "2027-01-23",
    }).json()
    assert g["id"] > 0
    assert g["status"] == "archived"
    plan = c.get(f"/api/goals/{g['id']}/plan").json()
    assert plan["suggested"]["remaining"] == 25000000
    assert plan["suggested"]["required_monthly_to_target"] is not None
    assert plan["roadmap"]
    act = c.patch(f"/api/goals/{g['id']}", json={"status": "active"}).json()
    assert act["status"] == "active" and act["activated_at"] is not None
    assert c.delete(f"/api/goals/{g['id']}").status_code == 200
    assert c.get("/api/goals").json() == []


def test_missions_and_finance(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    m = c.get("/api/missions/daily").json()
    assert len(m["missions"]) == 10
    assert m["totals"]["level"] >= 1
    e = c.post("/api/expenses", json={"name": "اجاره", "amount": 500, "currency": "USD"}).json()
    assert e["id"] > 0
    fin = c.get("/api/finance/summary?month=2026-11").json()
    assert fin["expenses"]["total"] == 500
    assert fin["stats"]["trades"] >= 0
    assert c.patch(f"/api/expenses/{e['id']}", json={"amount": 600}).json()["amount"] == 600
    assert c.delete(f"/api/expenses/{e['id']}").status_code == 200


def test_range_filtering(svc):
    svc.sync()
    c = TestClient(create_app(svc))
    # all trades are in the same period -> summary unchanged by an 'all'/year range
    s_all = c.get("/api/summary?range=year").json()["stats"]
    assert s_all["trades"] == 2
    # an impossible narrow range returns nothing
    s_none = c.get("/api/summary?from=2030-01-01&to=2030-01-02").json()["stats"]
    assert s_none["trades"] == 0
