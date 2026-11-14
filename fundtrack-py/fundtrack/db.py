"""SQLite storage. Raw facts only; trades are derived from deals."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta_state (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS accounts (
    login INTEGER PRIMARY KEY,
    name TEXT, server TEXT, currency TEXT, symbol TEXT,
    first_seen INTEGER, last_seen INTEGER, tz_seconds INTEGER,
    usd_toman REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
    scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (scope, key)
);
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'money',
    item_name TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    target_amount REAL NOT NULL,
    saved_amount REAL NOT NULL DEFAULT 0,
    monthly_income REAL NOT NULL DEFAULT 0,
    start_date TEXT,
    target_date TEXT,
    account_login INTEGER,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER,
    archived_at INTEGER,
    activated_at INTEGER
);
CREATE TABLE IF NOT EXISTS snapshots (
    login INTEGER NOT NULL, t INTEGER NOT NULL,
    balance REAL, equity REAL, floating REAL, margin REAL, free_margin REAL,
    PRIMARY KEY (login, t)
);
CREATE TABLE IF NOT EXISTS deals (
    login INTEGER NOT NULL, deal INTEGER NOT NULL,
    t INTEGER NOT NULL, order_id INTEGER, position_id INTEGER,
    symbol TEXT, entry INTEGER, side INTEGER, volume REAL, price REAL,
    profit REAL, commission REAL, swap REAL, fee REAL, magic INTEGER, comment TEXT,
    PRIMARY KEY (login, deal)
);
CREATE INDEX IF NOT EXISTS deals_pos ON deals(login, position_id);
CREATE TABLE IF NOT EXISTS position_seen (
    login INTEGER NOT NULL, ticket INTEGER NOT NULL,
    symbol TEXT, side INTEGER, first_sl REAL, first_open REAL, first_seen INTEGER,
    PRIMARY KEY (login, ticket)
);
CREATE TABLE IF NOT EXISTS open_positions (
    login INTEGER NOT NULL, ticket INTEGER NOT NULL, t INTEGER,
    symbol TEXT, side INTEGER, volume REAL, open_price REAL, sl REAL, tp REAL,
    profit REAL, magic INTEGER, open_time INTEGER,
    PRIMARY KEY (login, ticket)
);
CREATE TABLE IF NOT EXISTS trades (
    login INTEGER NOT NULL, position_id INTEGER NOT NULL,
    symbol TEXT, side TEXT, volume REAL,
    open_t INTEGER, close_t INTEGER,
    open_price REAL, close_price REAL, sl REAL, tp REAL,
    gross REAL, commission REAL, swap REAL, fee REAL, net REAL,
    r_price REAL, magic INTEGER, source TEXT, is_open INTEGER,
    PRIMARY KEY (login, position_id)
);
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    note TEXT NOT NULL DEFAULT '',
    recurring INTEGER NOT NULL DEFAULT 0,
    day_of_month INTEGER,
    last_generated TEXT,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    category TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    account_login INTEGER,
    bank_account_id INTEGER,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'bank',
    currency TEXT NOT NULL DEFAULT 'USD',
    balance REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'due',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    ref_type TEXT,
    ref_id INTEGER,
    due_date TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS badges (
    kind TEXT PRIMARY KEY,
    earned_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    limit_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS news_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL DEFAULT '',
    impact TEXT NOT NULL DEFAULT 'Low',
    forecast TEXT NOT NULL DEFAULT '',
    previous TEXT NOT NULL DEFAULT '',
    actual TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    created_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS news_url ON news_events(url);
CREATE INDEX IF NOT EXISTS transactions_day ON transactions(created_at);
CREATE TABLE IF NOT EXISTS obligations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'debt',
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    period TEXT NOT NULL DEFAULT 'monthly',
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    total_installments INTEGER,
    paid_installments INTEGER NOT NULL DEFAULT 0,
    installment_amount REAL,
    created_at INTEGER
);
CREATE TABLE IF NOT EXISTS missions_custom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    ref_id INTEGER,
    metric TEXT NOT NULL DEFAULT 'earn',
    target REAL NOT NULL,
    xp INTEGER NOT NULL DEFAULT 10,
    stars INTEGER NOT NULL DEFAULT 10,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER
);
"""

MISSION_OVERRIDE_DDL = """CREATE TABLE IF NOT EXISTS missions_daily_override (
    key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    target REAL,
    stars INTEGER,
    updated_at INTEGER
);
"""

GOALS_DDL = """CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'money',
    item_name TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    target_amount REAL NOT NULL,
    saved_amount REAL NOT NULL DEFAULT 0,
    monthly_income REAL NOT NULL DEFAULT 0,
    start_date TEXT,
    target_date TEXT,
    account_login INTEGER,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER,
    archived_at INTEGER,
    activated_at INTEGER
);
"""


def _ensure_columns(con: sqlite3.Connection) -> None:
    """Add columns introduced after the first schema version (existing databases)."""
    cols = {r[1] for r in con.execute("PRAGMA table_info(accounts)").fetchall()}
    for name, ddl in (
        ("usd_toman", "ALTER TABLE accounts ADD COLUMN usd_toman REAL NOT NULL DEFAULT 0"),
        ("note", "ALTER TABLE accounts ADD COLUMN note TEXT NOT NULL DEFAULT ''"),
        ("archived", "ALTER TABLE accounts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"),
    ):
        if name not in cols:
            con.execute(ddl)

    tcols = {r[1] for r in con.execute("PRAGMA table_info(transactions)").fetchall()}
    if "bank_account_id" not in tcols:
        con.execute("ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER")

    mcols = {r[1] for r in con.execute("PRAGMA table_info(missions_custom)").fetchall()}
    if "stars" not in mcols:
        con.execute("ALTER TABLE missions_custom ADD COLUMN stars INTEGER NOT NULL DEFAULT 10")

    ocols = {r[1] for r in con.execute("PRAGMA table_info(obligations)").fetchall()}
    for name, ddl in (
        ("total_installments", "ALTER TABLE obligations ADD COLUMN total_installments INTEGER"),
        ("paid_installments", "ALTER TABLE obligations ADD COLUMN paid_installments INTEGER NOT NULL DEFAULT 0"),
        ("installment_amount", "ALTER TABLE obligations ADD COLUMN installment_amount REAL"),
    ):
        if name not in ocols:
            con.execute(ddl)

    ncols = {r[1] for r in con.execute("PRAGMA table_info(news_events)").fetchall()}
    if "actual" not in ncols:
        con.execute("ALTER TABLE news_events ADD COLUMN actual TEXT NOT NULL DEFAULT ''")

    bcols = {r[1] for r in con.execute("PRAGMA table_info(budgets)").fetchall()}
    for name, ddl in (
        ("source_type", "ALTER TABLE budgets ADD COLUMN source_type TEXT NOT NULL DEFAULT 'fixed'"),
        ("account_login", "ALTER TABLE budgets ADD COLUMN account_login INTEGER"),
        ("bank_account_id", "ALTER TABLE budgets ADD COLUMN bank_account_id INTEGER"),
        ("pct", "ALTER TABLE budgets ADD COLUMN pct REAL"),
    ):
        if name not in bcols:
            con.execute(ddl)

    ecols = {r[1] for r in con.execute("PRAGMA table_info(expenses)").fetchall()}
    for name, ddl in (
        ("recurring", "ALTER TABLE expenses ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0"),
        ("day_of_month", "ALTER TABLE expenses ADD COLUMN day_of_month INTEGER"),
        ("last_generated", "ALTER TABLE expenses ADD COLUMN last_generated TEXT"),
    ):
        if name not in ecols:
            con.execute(ddl)

    gcols = {r[1] for r in con.execute("PRAGMA table_info(goals)").fetchall()}
    # جدول قدیمی اهداف (پیش از مدل کالا/پولی) → بازسازی خاموش
    if "start_balance" in gcols:
        con.execute("DROP TABLE IF EXISTS goals")
        con.executescript(GOALS_DDL)
        return
    for name, ddl in (
        ("kind", "ALTER TABLE goals ADD COLUMN kind TEXT NOT NULL DEFAULT 'money'"),
        ("item_name", "ALTER TABLE goals ADD COLUMN item_name TEXT NOT NULL DEFAULT ''"),
        ("currency", "ALTER TABLE goals ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"),
        ("target_amount", "ALTER TABLE goals ADD COLUMN target_amount REAL NOT NULL DEFAULT 0"),
        ("saved_amount", "ALTER TABLE goals ADD COLUMN saved_amount REAL NOT NULL DEFAULT 0"),
        ("monthly_income", "ALTER TABLE goals ADD COLUMN monthly_income REAL NOT NULL DEFAULT 0"),
        ("status", "ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'"),
        ("archived_at", "ALTER TABLE goals ADD COLUMN archived_at INTEGER"),
        ("activated_at", "ALTER TABLE goals ADD COLUMN activated_at INTEGER"),
        ("budget_category", "ALTER TABLE goals ADD COLUMN budget_category TEXT"),
        ("priority", "ALTER TABLE goals ADD COLUMN priority INTEGER NOT NULL DEFAULT 999"),
        ("allocation_pct", "ALTER TABLE goals ADD COLUMN allocation_pct REAL NOT NULL DEFAULT 0"),
    ):
        if name not in gcols:
            con.execute(ddl)


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=30, check_same_thread=False)   # the API uses the connection from its worker threads; Service.lock serialises access
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    con.executescript(MISSION_OVERRIDE_DDL)
    _ensure_columns(con)
    return con


@contextmanager
def tx(con: sqlite3.Connection):
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise


def get_state(con: sqlite3.Connection, key: str, default: str = "") -> str:
    row = con.execute("SELECT v FROM meta_state WHERE k=?", (key,)).fetchone()
    return row["v"] if row else default


def set_state(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        "INSERT INTO meta_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
        (key, value),
    )


def get_setting(con: sqlite3.Connection, scope: str, key: str, default: str = "") -> str:
    row = con.execute("SELECT value FROM settings WHERE scope=? AND key=?", (scope, key)).fetchone()
    return row["value"] if row else default


def set_setting(con: sqlite3.Connection, scope: str, key: str, value: str) -> None:
    con.execute(
        "INSERT INTO settings(scope,key,value) VALUES(?,?,?) "
        "ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value",
        (scope, key, value),
    )
