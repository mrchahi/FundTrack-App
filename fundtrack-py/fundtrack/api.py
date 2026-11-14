"""HTTP API for the dashboard. Listens on 127.0.0.1 only."""
from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from . import analytics
from .service import Service


def create_app(svc: Service) -> FastAPI:
    app = FastAPI(title="FundTrack", version="0.3.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],   # Vite dev server only
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def no_cache_api(request, call_next):
        """Prevent the browser from caching API responses (fresh settings/widgets)."""
        resp = await call_next(request)
        if request.url.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    def fparams(
        login: int | None = Query(None),
        symbol: str | None = Query(None),
        side: str | None = Query(None),
        source: str | None = Query(None),
        date_from: str | None = Query(None, alias="from"),
        date_to: str | None = Query(None, alias="to"),
        session: str | None = Query(None),
        range: str | None = Query(None, alias="range"),
    ) -> dict:
        return {"login": login, "symbol": symbol, "side": side, "source": source,
                "from": date_from, "to": date_to, "session": session, "range": range}

    F = Depends(fparams)

    @app.get("/api/status")
    def status():
        return svc.status()

    @app.post("/api/sync")
    def sync():
        return svc.sync()

    @app.get("/api/accounts")
    def accounts():
        return svc.accounts()

    @app.patch("/api/accounts/{login}")
    def patch_account(login: int, body: dict):
        try:
            return svc.update_account(login, body)
        except KeyError:
            raise HTTPException(404, "account not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.get("/api/settings")
    def get_settings():
        return svc.get_settings()

    @app.put("/api/settings")
    def put_settings(body: dict):
        return svc.set_settings(body)

    @app.post("/api/fx/refresh")
    def fx_refresh():
        return svc.maybe_refresh_fx(force=True)

    @app.get("/api/fx/status")
    def fx_status():
        return svc.fx_status()

    @app.get("/api/filter-options")
    def filter_options():
        return svc.filter_options()

    @app.post("/api/verify-pin")
    def verify_pin(body: dict):
        return {"ok": svc.verify_pin(str(body.get("pin") or ""))}

    # ---- goals ----
    @app.get("/api/goals")
    def goals_list():
        return svc.list_goals()

    @app.post("/api/goals")
    def goal_create(body: dict):
        try:
            return svc.create_goal(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/goals/{gid}")
    def goal_patch(gid: int, body: dict):
        try:
            return svc.update_goal(gid, body)
        except KeyError:
            raise HTTPException(404, "goal not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/goals/{gid}")
    def goal_delete(gid: int):
        svc.delete_goal(gid)
        return {"ok": True}

    @app.get("/api/goals/{gid}/plan")
    def goal_plan(gid: int):
        try:
            return svc.goal_plan(gid)
        except KeyError:
            raise HTTPException(404, "goal not found")

    # ---- missions / gamification ----
    @app.get("/api/missions/daily")
    def missions_daily(login: int | None = Query(None)):
        return svc.missions_daily(login)

    @app.get("/api/missions/daily/overrides")
    def daily_overrides_list():
        return svc.daily_mission_overrides()

    @app.put("/api/missions/daily/overrides/{key}")
    def daily_override_put(key: str, body: dict):
        return svc.set_daily_mission_override(key, body)

    @app.delete("/api/missions/daily/overrides/{key}")
    def daily_override_delete(key: str):
        return {"deleted": svc.delete_daily_mission_override(key)}

    # ---- expenses ----
    @app.get("/api/expenses")
    def expenses_list():
        return svc.list_expenses()

    @app.post("/api/expenses")
    def expense_create(body: dict):
        try:
            return svc.create_expense(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/expenses/{eid}")
    def expense_patch(eid: int, body: dict):
        try:
            return svc.update_expense(eid, body)
        except KeyError:
            raise HTTPException(404, "expense not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/expenses/{eid}")
    def expense_delete(eid: int):
        svc.delete_expense(eid)
        return {"ok": True}

    # ---- accounting: transactions ----
    @app.get("/api/transactions")
    def transactions_list(type: str | None = Query(None, alias="type"), month: str | None = Query(None)):
        if type and type not in ("in", "out", "expense"):
            raise HTTPException(400, "unknown transaction type")
        return svc.transactions(type, month)

    @app.post("/api/transactions")
    def transaction_create(body: dict):
        try:
            return svc.create_transaction(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/transactions/{tid}")
    def transaction_patch(tid: int, body: dict):
        try:
            return svc.update_transaction(tid, body)
        except KeyError:
            raise HTTPException(404, "transaction not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/transactions/{tid}")
    def transaction_delete(tid: int):
        svc.delete_transaction(tid)
        return {"ok": True}

    # ---- accounting: bank accounts ----
    @app.get("/api/bank-accounts")
    def bank_accounts_list():
        return svc.bank_accounts()

    @app.post("/api/bank-accounts")
    def bank_account_create(body: dict):
        try:
            return svc.create_bank_account(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/bank-accounts/{baid}")
    def bank_account_patch(baid: int, body: dict):
        try:
            return svc.update_bank_account(baid, body)
        except KeyError:
            raise HTTPException(404, "bank account not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/bank-accounts/{baid}")
    def bank_account_delete(baid: int):
        svc.delete_bank_account(baid)
        return {"ok": True}

    # ---- accounting: budgets ----
    @app.get("/api/budgets")
    def budgets_list():
        return svc.budgets()

    @app.post("/api/budgets")
    def budget_create(body: dict):
        try:
            return svc.create_budget(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/budgets/{bid}")
    def budget_patch(bid: int, body: dict):
        try:
            return svc.update_budget(bid, body)
        except KeyError:
            raise HTTPException(404, "budget not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/budgets/{bid}")
    def budget_delete(bid: int):
        svc.delete_budget(bid)
        return {"ok": True}

    # ---- accounting: installment payment ----
    @app.post("/api/obligations/{oid}/pay")
    def obligation_pay(oid: int, body: dict):
        try:
            return svc.pay_obligation_installment(oid, int(body.get("bank_account_id") or 0))
        except KeyError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))

    # ---- notifications ----
    @app.get("/api/notifications")
    def notifications_list(unread_only: bool = Query(False)):
        return svc.notifications(unread_only)

    @app.post("/api/notifications/seen")
    def notifications_seen(body: dict):
        ids = body.get("ids") or []
        return {"updated": svc.mark_notifications_seen([int(i) for i in ids])}

    @app.delete("/api/notifications")
    def notifications_clear():
        return {"deleted": svc.clear_notifications()}

    # ---- accounting: obligations ----
    @app.get("/api/obligations")
    def obligations_list():
        return svc.obligations()

    @app.post("/api/obligations")
    def obligation_create(body: dict):
        try:
            return svc.create_obligation(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/obligations/{oid}")
    def obligation_patch(oid: int, body: dict):
        try:
            return svc.update_obligation(oid, body)
        except KeyError:
            raise HTTPException(404, "obligation not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/obligations/{oid}")
    def obligation_delete(oid: int):
        svc.delete_obligation(oid)
        return {"ok": True}

    # ---- accounting: summary / series ----
    @app.get("/api/accounting/summary")
    def accounting_summary(month: str | None = Query(None)):
        return svc.accounting_summary(month)

    @app.get("/api/accounting/series")
    def accounting_series(months: int = Query(12, ge=1, le=24)):
        return svc.accounting_series(months)

    # ---- news / calendar ----
    @app.post("/api/news/upload")
    async def news_upload(request: Request):
        body = await request.body()
        try:
            return svc.import_news_bytes(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.get("/api/news")
    def news_list():
        return svc.news_events()

    @app.post("/api/news/fetch")
    def news_fetch(day: str | None = Query(None)):
        return svc.fetch_news(day)

    @app.get("/api/news/fetch-status")
    def news_fetch_status():
        return svc.news_fetch_status()

    @app.delete("/api/news")
    def news_clear():
        return {"deleted": svc.clear_news()}

    # ---- custom missions ----
    @app.get("/api/missions/custom")
    def custom_missions_list():
        return svc.custom_missions()

    @app.post("/api/missions/custom")
    def custom_mission_create(body: dict):
        try:
            return svc.create_custom_mission(body)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.patch("/api/missions/custom/{mid}")
    def custom_mission_patch(mid: int, body: dict):
        try:
            return svc.update_custom_mission(mid, body)
        except KeyError:
            raise HTTPException(404, "mission not found")
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.delete("/api/missions/custom/{mid}")
    def custom_mission_delete(mid: int):
        svc.delete_custom_mission(mid)
        return {"ok": True}

    # ---- finance ----
    @app.get("/api/finance/summary")
    def finance_summary(login: int | None = Query(None), month: str | None = Query(None)):
        return svc.finance_summary(login, month)

    @app.get("/api/summary")
    def summary(f: dict = F):
        rows = svc.trades(f)
        return {"stats": analytics.summary(rows), "curve": analytics.curve(rows)}

    @app.get("/api/trades")
    def trades(limit: int = Query(300, ge=1, le=5000), offset: int = Query(0, ge=0), f: dict = F):
        rows = list(reversed(svc.trades(f)))          # newest first
        return {"total": len(rows), "items": rows[offset: offset + limit]}

    @app.get("/api/breakdown")
    def breakdown(by: str = Query("hour"), f: dict = F):
        if by not in ("hour", "weekday", "session", "symbol", "side", "source"):
            raise HTTPException(400, "unknown breakdown")
        return analytics.breakdown(svc.trades(f), by)

    @app.get("/api/heatmap")
    def heatmap(f: dict = F):
        return analytics.heatmap(svc.trades(f))

    @app.get("/api/top")
    def top(n: int = Query(10, ge=1, le=100), f: dict = F):
        return analytics.top_trades(svc.trades(f), n)

    @app.get("/api/net-by-period")
    def net_by_period(period: str = Query("month", alias="period"), f: dict = F):
        return analytics.net_by_period(svc.trades(f), period)

    @app.get("/api/durations")
    def durations(f: dict = F):
        return analytics.duration_buckets(svc.trades(f))

    @app.get("/api/positions")
    def positions(login: int | None = Query(None)):
        return svc.open_positions(login)

    @app.get("/api/equity")
    def equity(login: int | None = Query(None)):
        return svc.equity(login)

    @app.get("/api/journal.csv")
    def journal_csv(f: dict = F):
        rows = svc.trades(f)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["#", "login", "symbol", "side", "volume", "open_time", "close_time",
                    "open_price", "close_price", "sl", "duration_min", "net", "commission",
                    "swap", "r", "source"])
        for i, r in enumerate(rows, 1):
            w.writerow([i, r["login"], r["symbol"], r["side"], r["volume"], r["open_local"],
                        r["close_local"], r["open_price"], r["close_price"], r["sl"],
                        r["duration_min"], r["net"], round(r["commission"] + r["fee"], 2),
                        r["swap"], r["r_price"] if r["r_price"] is not None else "", r["source"]])
        return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": "attachment; filename=fundtrack-journal.csv"})

    if getattr(sys, "frozen", False):
        dist = Path(sys._MEIPASS) / "web" / "dist"      # bundled inside the single-file exe
    else:
        dist = Path(__file__).resolve().parent.parent / "web" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            target = dist / full_path
            if full_path and target.is_file():
                return FileResponse(target)
            return FileResponse(dist / "index.html")

    return app
