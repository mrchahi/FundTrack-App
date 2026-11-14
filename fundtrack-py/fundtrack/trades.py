"""Builds one trade per position from its deals. Recomputed from deals, so it is always consistent."""
from __future__ import annotations

from collections import defaultdict

from .db import tx

EPS = 1e-9


def build_trades(con) -> int:
    rows = con.execute(
        """SELECT login, deal, t, position_id, symbol, entry, side, volume, price, profit,
                  commission, swap, fee, magic
           FROM deals WHERE side IN (0,1) AND position_id > 0 ORDER BY t, deal"""
    ).fetchall()
    groups = defaultdict(list)
    for r in rows:
        groups[(r["login"], r["position_id"])].append(r)

    seen = {
        (r["login"], r["ticket"]): r
        for r in con.execute("SELECT login, ticket, first_sl FROM position_seen").fetchall()
    }

    out = []
    for (login, pos), ds in groups.items():
        ins = [d for d in ds if d["entry"] == 0]
        outs = [d for d in ds if d["entry"] in (1, 3)]
        if not ins:                       # opened before the import start: not a complete trade
            continue
        vin = sum(d["volume"] for d in ins)
        vout = sum(d["volume"] for d in outs)
        side = "buy" if ins[0]["side"] == 0 else "sell"
        open_px = sum(d["price"] * d["volume"] for d in ins) / vin if vin > EPS else ins[0]["price"]
        is_open = vout < vin - EPS
        close_px = 0.0
        close_t = 0
        if outs and vout > EPS:
            close_px = sum(d["price"] * d["volume"] for d in outs) / vout
            close_t = max(d["t"] for d in outs)
        gross = sum(d["profit"] for d in ds)
        comm = sum(d["commission"] for d in ds)
        swap = sum(d["swap"] for d in ds)
        fee = sum(d["fee"] for d in ds)
        net = gross + comm + swap + fee
        magic = ins[0]["magic"]
        sl = seen[(login, pos)]["first_sl"] if (login, pos) in seen else 0.0
        r_price = None
        if sl and abs(open_px - sl) > EPS and not is_open and close_px:
            risk_unit = abs(open_px - sl)
            move = (close_px - open_px) if side == "buy" else (open_px - close_px)
            r_price = round(move / risk_unit, 4)
        out.append((
            login, pos, ins[0]["symbol"], side, vin,
            ins[0]["t"], close_t, round(open_px, 5), round(close_px, 5), round(sl, 5), 0.0,
            round(gross, 2), round(comm, 2), round(swap, 2), round(fee, 2), round(net, 2),
            r_price, magic, "ea" if magic else "manual", 1 if is_open else 0,
        ))

    with tx(con):
        con.execute("DELETE FROM trades")
        con.executemany(
            """INSERT INTO trades(login,position_id,symbol,side,volume,open_t,close_t,open_price,close_price,
                                  sl,tp,gross,commission,swap,fee,net,r_price,magic,source,is_open)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            out,
        )
    return len(out)
