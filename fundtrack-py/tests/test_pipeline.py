import json

from fundtrack import analytics
from fundtrack.ingest import ingest_file
from fundtrack.trades import build_trades


def test_first_sync_builds_trades(svc):
    r = svc.sync()
    assert r["events"] == 11
    assert len(svc.trades({})) == 2                              # closed trades only
    assert svc.status()["counts"]["open_positions"] == 1


def test_ea_and_manual_trades_are_separated(svc):
    svc.sync()
    rows = svc.trades({})
    assert [r["source"] for r in rows] == ["ea", "manual"]
    assert rows[0]["net"] == 19.0                                  # 20 profit - 0.5 - 0.5
    assert rows[1]["net"] == -6.0                                  # -5 - 0.5 - 0.5


def test_r_multiple_from_first_sl(svc):
    svc.sync()
    ea, manual = svc.trades({})
    assert ea["r_price"] == 2.0          # moved +20 against a 10 risk
    assert manual["r_price"] == -0.5     # sell 4030 -> 4035 is -5 price units, risk is 10 -> -0.5 R


def test_rerun_does_not_duplicate(svc):
    svc.sync()
    before = svc.status()["counts"]
    r = svc.sync()
    assert r["events"] == 0
    assert svc.status()["counts"] == before


def test_appended_events_are_picked_up(svc, events_path):
    svc.sync()
    with events_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"type": "deal", "t": 1_790_100_000, "deal": 9, "order": 9, "pos": 404, "sym": "XAUUSD",
                            "entry": 0, "side": 0, "vol": 0.1, "price": 4000, "profit": 0, "comm": 0, "swap": 0,
                            "fee": 0, "magic": 0, "comment": ""}) + "\r\n")
        f.write(json.dumps({"type": "deal", "t": 1_790_100_500, "deal": 10, "order": 10, "pos": 404, "sym": "XAUUSD",
                            "entry": 1, "side": 1, "vol": 0.1, "price": 4002, "profit": 2, "comm": 0, "swap": 0,
                            "fee": 0, "magic": 0, "comment": ""}) + "\r\n")
    svc.sync()
    assert len(svc.trades({})) == 3


def test_partial_last_line_waits(svc, events_path):
    svc.sync()
    with events_path.open("a", encoding="utf-8") as f:
        f.write('{"type": "snap", "t": 1790200000, "login": 555, "bal": 1')   # still being written
    assert svc.sync()["events"] == 0
    with events_path.open("a", encoding="utf-8") as f:
        f.write('0, "eq": 1000, "fl": 0, "margin": 0, "free": 1000}\r\n')
    assert svc.sync()["events"] == 1


def test_file_replaced_by_smaller_one_restarts(svc, events_path):
    svc.sync()
    events_path.write_text(json.dumps({"type": "meta", "t": 1, "login": 777, "name": "New", "server": "S",
                                       "cur": "EUR", "tz": 0, "symbol": "EURUSD", "period": "x"}) + "\n")
    svc.sync()
    assert any(a["login"] == 777 for a in svc.accounts())


def test_session_labels_follow_local_markets():
    # 2026-11-09 14:30 UTC: London (08-17 local, winter GMT) and New York (08-17 local, EST) are both open
    ts = 1_794_239_400
    labels = analytics.session_label(ts)
    assert "London" in labels and "New York" in labels
    assert "Sydney" not in labels


def test_tehran_time_is_utc_plus_three_thirty():
    dt = analytics.to_tehran(1_790_000_000)
    assert dt.utcoffset().total_seconds() == 3.5 * 3600


def test_breakdown_by_hour_uses_tehran_hours(svc):
    svc.sync()
    rows = svc.trades({})
    hours = analytics.breakdown(rows, "hour")
    assert all(0 <= h["key"] <= 23 for h in hours)
    assert sum(h["trades"] for h in hours) == 2


def test_summary_numbers(svc):
    svc.sync()
    s = analytics.summary(svc.trades({}))
    assert s["trades"] == 2 and s["wins"] == 1 and s["losses"] == 1
    assert s["win_rate"] == 50.0
    assert s["profit_factor"] == round(19 / 6, 2)
    assert s["max_drawdown"] == 0.0 or s["max_drawdown"] >= 0


def test_net_by_period_and_durations(svc):
    svc.sync()
    rows = svc.trades({})
    months = analytics.net_by_period(rows, "month")
    assert sum(m["trades"] for m in months) == 2
    assert sum(m["net"] for m in months) == round(19 - 6, 2)
    dur = analytics.duration_buckets(rows)
    assert sum(d["trades"] for d in dur) == 2


def test_filter_options(svc):
    svc.sync()
    opts = svc.filter_options()
    assert opts["symbols"] == ["XAUUSD"]
    assert set(opts["sides"]) == {"buy", "sell"}
    assert set(opts["sources"]) == {"ea", "manual"}
    assert opts["magics"] == [2026]
    assert opts["first_trade"] and opts["last_trade"]
