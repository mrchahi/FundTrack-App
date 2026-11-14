"""Reads the JSON lines the EA writes and stores them. Reading is incremental (byte offset)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from .db import get_state, set_state, tx

log = logging.getLogger("fundtrack.ingest")


def _int(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _float(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _current_login(con) -> int:
    return _int(get_state(con, "current_login", "0"))


def apply_event(con, ev: dict) -> None:
    """Store one event. Events without a login use the last account seen in the file."""
    kind = ev.get("type")
    if kind == "meta":
        login = _int(ev.get("login"))
        if not login:
            return
        con.execute(
            """INSERT INTO accounts(login,name,server,currency,symbol,first_seen,last_seen,tz_seconds)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(login) DO UPDATE SET name=excluded.name, server=excluded.server,
               currency=excluded.currency, symbol=excluded.symbol, last_seen=excluded.last_seen,
               tz_seconds=excluded.tz_seconds""",
            (login, ev.get("name", ""), ev.get("server", ""), ev.get("cur", ""), ev.get("symbol", ""),
             _int(ev.get("t")), _int(ev.get("t")), _int(ev.get("tz"))),
        )
        set_state(con, "current_login", str(login))
        return

    if kind == "snap":
        login = _int(ev.get("login")) or _current_login(con)
        if not login:
            return
        t = _int(ev.get("t"))
        con.execute(
            """INSERT INTO snapshots(login,t,balance,equity,floating,margin,free_margin)
               VALUES(?,?,?,?,?,?,?) ON CONFLICT(login,t) DO NOTHING""",
            (login, t, _float(ev.get("bal")), _float(ev.get("eq")), _float(ev.get("fl")),
             _float(ev.get("margin")), _float(ev.get("free"))),
        )
        con.execute("UPDATE accounts SET last_seen=? WHERE login=?", (t, login))
        set_state(con, "current_login", str(login))
        return

    if kind == "positions":
        login = _current_login(con)
        if not login:
            return
        items = ev.get("items") or []
        tickets = []
        for it in items:
            tk = _int(it.get("ticket"))
            if not tk:
                continue
            tickets.append(tk)
            con.execute(
                """INSERT INTO open_positions(login,ticket,t,symbol,side,volume,open_price,sl,tp,profit,magic,open_time)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(login,ticket) DO UPDATE SET t=excluded.t, symbol=excluded.symbol, side=excluded.side,
                   volume=excluded.volume, open_price=excluded.open_price, sl=excluded.sl, tp=excluded.tp,
                   profit=excluded.profit, magic=excluded.magic, open_time=excluded.open_time""",
                (login, tk, _int(ev.get("t")), it.get("sym", ""), _int(it.get("side")), _float(it.get("vol")),
                 _float(it.get("open")), _float(it.get("sl")), _float(it.get("tp")), _float(it.get("profit")),
                 _int(it.get("magic")), _int(it.get("time"))),
            )
            # the first SL seen for a position is its initial risk (the deal does not carry SL)
            con.execute(
                """INSERT INTO position_seen(login,ticket,symbol,side,first_sl,first_open,first_seen)
                   VALUES(?,?,?,?,?,?,?) ON CONFLICT(login,ticket) DO NOTHING""",
                (login, tk, it.get("sym", ""), _int(it.get("side")), _float(it.get("sl")),
                 _float(it.get("open")), _int(ev.get("t"))),
            )
        # the positions line is the complete list of open positions for this account
        if tickets:
            marks = ",".join("?" * len(tickets))
            con.execute(f"DELETE FROM open_positions WHERE login=? AND ticket NOT IN ({marks})", (login, *tickets))
        else:
            con.execute("DELETE FROM open_positions WHERE login=?", (login,))
        return

    if kind == "deal":
        login = _current_login(con)
        if not login:
            return
        con.execute(
            """INSERT INTO deals(login,deal,t,order_id,position_id,symbol,entry,side,volume,price,profit,
                                 commission,swap,fee,magic,comment)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(login,deal) DO NOTHING""",
            (login, _int(ev.get("deal")), _int(ev.get("t")), _int(ev.get("order")), _int(ev.get("pos")),
             ev.get("sym", ""), _int(ev.get("entry")), _int(ev.get("side")), _float(ev.get("vol")),
             _float(ev.get("price")), _float(ev.get("profit")), _float(ev.get("comm")), _float(ev.get("swap")),
             _float(ev.get("fee")), _int(ev.get("magic")), ev.get("comment", "")),
        )
        return




def ingest_file(con, path: Path) -> int:
    """Process the lines added since the last run. Returns the number of events applied."""
    if not path.exists():
        return 0
    size = path.stat().st_size
    offset = _int(get_state(con, "ingest_offset", "0"))
    if size < offset:                      # the file was reset or replaced: start again
        log.warning("events file is smaller than the last offset; reading from the start")
        offset = 0
    if size == offset:
        return 0
    applied = 0
    with path.open("rb") as f:
        f.seek(offset)
        chunk = f.read()
    # only complete lines are handled; a line still being written waits for the next run
    end = chunk.rfind(b"\n")
    if end < 0:
        return 0
    body = chunk[: end + 1]
    with tx(con):
        for raw in body.splitlines():
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                log.warning("skipping a bad line")
                continue
            apply_event(con, ev)
            applied += 1
        set_state(con, "ingest_offset", str(offset + end + 1))
    return applied
