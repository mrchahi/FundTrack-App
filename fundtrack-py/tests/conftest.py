import json
from pathlib import Path

import pytest

from fundtrack.service import Service


def make_events(path: Path) -> None:
    """A small account: 2 trades (one manual), a position snapshot, equity history and an open trade."""
    base = 1_790_000_000   # a UTC timestamp
    lines = [
        {"type": "meta", "t": base, "login": 555, "name": "Test", "server": "Demo", "cur": "USD",
         "tz": 3 * 3600, "symbol": "XAUUSD", "period": "PERIOD_M1"},
        {"type": "snap", "t": base + 10, "login": 555, "bal": 1000, "eq": 1000, "fl": 0, "margin": 0, "free": 1000},
        # trade 1: buy at 4000, SL 3990, closed at 4020 (+2R), EA trade (magic 2026)
        {"type": "positions", "t": base + 60, "items": [
            {"ticket": 101, "sym": "XAUUSD", "side": 0, "vol": 0.1, "open": 4000, "sl": 3990, "tp": 4020,
             "profit": 0, "magic": 2026, "time": base + 50}]},
        {"type": "deal", "t": base + 50, "deal": 1, "order": 1, "pos": 101, "sym": "XAUUSD", "entry": 0, "side": 0,
         "vol": 0.1, "price": 4000, "profit": 0, "comm": -0.5, "swap": 0, "fee": 0, "magic": 2026, "comment": ""},
        {"type": "deal", "t": base + 3600, "deal": 2, "order": 2, "pos": 101, "sym": "XAUUSD", "entry": 1, "side": 1,
         "vol": 0.1, "price": 4020, "profit": 20, "comm": -0.5, "swap": 0, "fee": 0, "magic": 2026, "comment": ""},
        # trade 2: manual sell at 4030, SL 4040, closed at 4035 (-0.5R)
        {"type": "positions", "t": base + 7200, "items": [
            {"ticket": 202, "sym": "XAUUSD", "side": 1, "vol": 0.1, "open": 4030, "sl": 4040, "tp": 0,
             "profit": 0, "magic": 0, "time": base + 7000}]},
        {"type": "deal", "t": base + 7000, "deal": 3, "order": 3, "pos": 202, "sym": "XAUUSD", "entry": 0, "side": 1,
         "vol": 0.1, "price": 4030, "profit": 0, "comm": -0.5, "swap": 0, "fee": 0, "magic": 0, "comment": ""},
        {"type": "deal", "t": base + 9000, "deal": 4, "order": 4, "pos": 202, "sym": "XAUUSD", "entry": 1, "side": 0,
         "vol": 0.1, "price": 4035, "profit": -5, "comm": -0.5, "swap": 0, "fee": 0, "magic": 0, "comment": ""},
        # trade 3: still open
        {"type": "positions", "t": base + 9100, "items": [
            {"ticket": 303, "sym": "XAUUSD", "side": 0, "vol": 0.05, "open": 4010, "sl": 4000, "tp": 4030,
             "profit": 4.5, "magic": 2026, "time": base + 9050}]},
        {"type": "deal", "t": base + 9050, "deal": 5, "order": 5, "pos": 303, "sym": "XAUUSD", "entry": 0, "side": 0,
         "vol": 0.05, "price": 4010, "profit": 0, "comm": -0.2, "swap": 0, "fee": 0, "magic": 2026, "comment": ""},
        {"type": "snap", "t": base + 9200, "login": 555, "bal": 1014.8, "eq": 1019.3, "fl": 4.5, "margin": 50, "free": 969},
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for ev in lines:
            f.write(json.dumps(ev) + "\r\n")


@pytest.fixture
def events_path(tmp_path):
    p = tmp_path / "common" / "FundTrack" / "events.jsonl"
    make_events(p)
    return p


@pytest.fixture
def svc(tmp_path, events_path):
    s = Service(db_path=tmp_path / "data" / "t.sqlite3", events_path=events_path)
    yield s
    s.con.close()
