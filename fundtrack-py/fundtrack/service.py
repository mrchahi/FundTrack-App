"""Glue: open the database, run ingest and trade building, answer queries."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
import urllib.request

from . import accounting, analytics, finances, goals, missions, news, news_fetch
from .config import db_file, events_file
from .db import connect, get_setting, set_setting
from .ingest import ingest_file
from .trades import build_trades

log = logging.getLogger("fundtrack.service")


class Service:
    def __init__(self, db_path=None, events_path=None):
        self.db_path = db_path or db_file()
        self.events_path = events_path or events_file()
        self.lock = threading.RLock()
        self.con = connect(self.db_path)
        self._stop = threading.Event()
        self.last_error = ""
        self._news_scheduler = news_fetch.NewsScheduler(self.con, self.events_path)

    def sync(self) -> dict:
        with self.lock:
            applied = ingest_file(self.con, self.events_path)
            if applied:
                built = build_trades(self.con)
            else:
                built = None
            recurring = accounting.process_recurring(self.con)
            due_notifs = accounting.generate_due_notifications(self.con)
            if recurring or due_notifs:
                self.con.commit()
            return {"events": applied, "trades_rebuilt": built,
                    "recurring_generated": recurring, "notifications_created": due_notifs}

    _FETCH_USD_URL = "https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/popular.json"
    _FX_INTERVAL_SEC = 8 * 3600   # 3 times a day

    def fetch_usd_toman(self) -> float | None:
        """Fetch the open-market USD->Toman rate from the free Iran Market API."""
        try:
            req = urllib.request.Request(
                self._FETCH_USD_URL,
                headers={"User-Agent": "Mozilla/5.0 (FundTrack/0.3)"},
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                payload = json.loads(r.read().decode("utf-8", "ignore"))
            items = payload.get("data") or []
            for it in items:
                if it.get("symbol") == "USD_IRR_FREE":
                    price = float(it.get("price") or 0)
                    if price > 0 and it.get("currency") == "IRT":
                        return price
            return None
        except Exception as e:  # noqa: BLE001
            log.warning("fetch_usd_toman failed: %s", e)
            return None

    def maybe_refresh_fx(self, force: bool = False) -> dict:
        """Refresh the USD rate at most every 8 hours; apply to all active accounts."""
        with self.lock:
            if not force and get_setting(self.con, "global", "fx_auto", "1") != "1":
                return {"skipped": True, "rate": None}
            last = float(get_setting(self.con, "global", "fx_last_update", "0"))
            now = time.time()
            if not force and now - last < self._FX_INTERVAL_SEC:
                return {"skipped": True, "rate": None}
            rate = self.fetch_usd_toman()
            if rate is None:
                return {"skipped": False, "rate": None, "error": "fetch failed"}
            set_setting(self.con, "global", "fx_last_update", str(int(now)))
            set_setting(self.con, "global", "fx_rate", str(rate))
            self.con.execute("UPDATE accounts SET usd_toman=? WHERE archived=0", (rate,))
            self.con.commit()
            return {"skipped": False, "rate": rate}

    def fx_status(self) -> dict:
        with self.lock:
            return {
                "rate": get_setting(self.con, "global", "fx_rate", ""),
                "last_update": int(get_setting(self.con, "global", "fx_last_update", "0") or 0),
                "auto": get_setting(self.con, "global", "fx_auto", "1") == "1",
            }

    def start_background(self, interval: float = 5.0) -> None:
        def loop():
            while not self._stop.is_set():
                try:
                    self.sync()
                    self.maybe_notify_news()
                    self.maybe_refresh_fx()
                    self.last_error = ""
                except Exception as e:           # keep the server alive; show the error in the UI
                    self.last_error = str(e)
                    log.exception("sync failed")
                self._stop.wait(interval)
        threading.Thread(target=loop, daemon=True).start()
        self._news_scheduler.start()

    def stop(self) -> None:
        self._stop.set()
        self._news_scheduler.stop()

    # ---- queries ----
    def accounts(self) -> list[dict]:
        with self.lock:
            rows = [dict(r) for r in self.con.execute("SELECT * FROM accounts ORDER BY archived, login").fetchall()]
            for a in rows:
                a["usd_toman"] = float(a.get("usd_toman") or 0)
                a["archived"] = int(a.get("archived") or 0)
                a["note"] = a.get("note") or ""
            return rows

    def update_account(self, login: int, fields: dict) -> dict:
        allowed = {"name", "note", "usd_toman", "archived"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            raise ValueError("no updatable fields")
        sets = ", ".join(f"{k}=?" for k in updates)
        with self.lock:
            self.con.execute(f"UPDATE accounts SET {sets} WHERE login=?", (*updates.values(), login))
            self.con.commit()
        row = self.con.execute("SELECT * FROM accounts WHERE login=?", (login,)).fetchone()
        if row is None:
            raise KeyError(login)
        return dict(row)

    @staticmethod
    def _pin_hash(pin: str) -> str:
        return hashlib.sha256(pin.encode("utf-8")).hexdigest()

    def get_settings(self) -> dict:
        with self.lock:
            pin_set = get_setting(self.con, "security", "pin_hash", "") != ""
            try:
                news_watch = json.loads(get_setting(self.con, "global", "news_watch", "[]"))
                if not isinstance(news_watch, list):
                    news_watch = []
            except (ValueError, TypeError):
                news_watch = []
            try:
                news_lead_minutes = int(get_setting(self.con, "global", "news_lead_minutes", "15"))
            except (ValueError, TypeError):
                news_lead_minutes = 15
            try:
                bg_blur = float(get_setting(self.con, "global", "bg_blur", "0.5"))
            except (ValueError, TypeError):
                bg_blur = 0.5
            try:
                bg_brightness = float(get_setting(self.con, "global", "bg_brightness", "0"))
            except (ValueError, TypeError):
                bg_brightness = 0.0
            try:
                card_blur = float(get_setting(self.con, "global", "card_blur", "0.6"))
            except (ValueError, TypeError):
                card_blur = 0.6
            try:
                goal_budget_weekly = float(get_setting(self.con, "global", "goal_budget_weekly", "0"))
            except (ValueError, TypeError):
                goal_budget_weekly = 0.0
            try:
                card_contrast = float(get_setting(self.con, "global", "card_contrast", "0.5"))
            except (ValueError, TypeError):
                card_contrast = 0.5
            return {
                "currency": get_setting(self.con, "global", "currency", "USD"),
                "base_currency": get_setting(self.con, "global", "base_currency", "USD"),
                "show_toman": get_setting(self.con, "global", "show_toman", "0") == "1",
                "default_range": get_setting(self.con, "global", "default_range", "all"),
                "theme": get_setting(self.con, "global", "theme", "obsidian"),
                "accent": get_setting(self.con, "global", "accent", "indigo"),
                "glass_intensity": float(get_setting(self.con, "global", "glass_intensity", "0.66")),
                "matte_intensity": float(get_setting(self.con, "global", "matte_intensity", "0.5")),
                "lang": get_setting(self.con, "global", "lang", "fa"),
                "pin_set": pin_set,
                "news_watch": news_watch,
                "news_lead_minutes": news_lead_minutes,
                "bg_image": get_setting(self.con, "global", "bg_image", "none"),
                "bg_blur": bg_blur,
                "bg_brightness": bg_brightness,
                "card_blur": card_blur,
                "card_contrast": card_contrast,
                "goal_budget_weekly": goal_budget_weekly,
                "acct_ref_account": get_setting(self.con, "global", "acct_ref_account", ""),
                "acct_trade_account": get_setting(self.con, "global", "acct_trade_account", ""),
                "fx_rate": get_setting(self.con, "global", "fx_rate", ""),
                "fx_last_update": get_setting(self.con, "global", "fx_last_update", "0"),
                "fx_auto": get_setting(self.con, "global", "fx_auto", "1") == "1",
            }

    def set_settings(self, patch: dict) -> dict:
        with self.lock:
            if "currency" in patch:
                set_setting(self.con, "global", "currency", str(patch["currency"]))
            if "base_currency" in patch and patch["base_currency"] in ("USD", "IRT"):
                set_setting(self.con, "global", "base_currency", str(patch["base_currency"]))
            if "show_toman" in patch:
                set_setting(self.con, "global", "show_toman", "1" if patch["show_toman"] else "0")
            if "default_range" in patch:
                set_setting(self.con, "global", "default_range", str(patch["default_range"]))
            if "theme" in patch and patch["theme"] in ("obsidian", "aurora", "midnight", "frosted-light", "cyberpunk"):
                set_setting(self.con, "global", "theme", str(patch["theme"]))
            if "accent" in patch and patch["accent"] in (
                "indigo", "violet", "sky", "cyan", "teal",
                "emerald", "lime", "amber", "orange", "rose", "pink",
            ):
                set_setting(self.con, "global", "accent", str(patch["accent"]))
            if "glass_intensity" in patch:
                v = float(patch["glass_intensity"])
                if not (0 <= v <= 1):
                    raise ValueError("glass_intensity must be between 0 and 1")
                set_setting(self.con, "global", "glass_intensity", str(v))
            if "matte_intensity" in patch:
                v = float(patch["matte_intensity"])
                if not (0 <= v <= 1):
                    raise ValueError("matte_intensity must be between 0 and 1")
                set_setting(self.con, "global", "matte_intensity", str(v))
            if "lang" in patch and patch["lang"] in ("fa", "en"):
                set_setting(self.con, "global", "lang", str(patch["lang"]))
            if "news_watch" in patch:
                watch = patch["news_watch"]
                if not isinstance(watch, list):
                    raise ValueError("news_watch must be a list of titles")
                set_setting(self.con, "global", "news_watch", json.dumps([str(w).strip() for w in watch if str(w).strip()]))
            if "news_lead_minutes" in patch:
                try:
                    lead = int(patch["news_lead_minutes"])
                except (ValueError, TypeError):
                    raise ValueError("news_lead_minutes must be an integer")
                if lead < 1 or lead > 1440:
                    raise ValueError("news_lead_minutes must be between 1 and 1440")
                set_setting(self.con, "global", "news_lead_minutes", str(lead))
            if "bg_image" in patch:
                set_setting(self.con, "global", "bg_image", str(patch["bg_image"] or "none"))
            if "bg_blur" in patch:
                try:
                    v = float(patch["bg_blur"])
                except (ValueError, TypeError):
                    raise ValueError("bg_blur must be a number")
                if not (0 <= v <= 1):
                    raise ValueError("bg_blur must be between 0 and 1")
                set_setting(self.con, "global", "bg_blur", str(v))
            if "bg_brightness" in patch:
                try:
                    v = float(patch["bg_brightness"])
                except (ValueError, TypeError):
                    raise ValueError("bg_brightness must be a number")
                if not (-100 <= v <= 100):
                    raise ValueError("bg_brightness must be between -100 and 100")
                set_setting(self.con, "global", "bg_brightness", str(v))
            if "card_blur" in patch:
                try:
                    v = float(patch["card_blur"])
                except (ValueError, TypeError):
                    raise ValueError("card_blur must be a number")
                if not (0 <= v <= 1):
                    raise ValueError("card_blur must be between 0 and 1")
                set_setting(self.con, "global", "card_blur", str(v))
            if "card_contrast" in patch:
                try:
                    v = float(patch["card_contrast"])
                except (ValueError, TypeError):
                    raise ValueError("card_contrast must be a number")
                if not (0 <= v <= 1):
                    raise ValueError("card_contrast must be between 0 and 1")
                set_setting(self.con, "global", "card_contrast", str(v))
            if "goal_budget_weekly" in patch:
                try:
                    v = float(patch["goal_budget_weekly"])
                except (ValueError, TypeError):
                    raise ValueError("goal_budget_weekly must be a number")
                if v < 0:
                    raise ValueError("goal_budget_weekly must be >= 0")
                set_setting(self.con, "global", "goal_budget_weekly", str(v))
            for key in ("acct_ref_account", "acct_trade_account"):
                if key in patch:
                    set_setting(self.con, "global", key, str(patch[key] or ""))
            if "fx_auto" in patch:
                set_setting(self.con, "global", "fx_auto", "1" if patch["fx_auto"] else "0")
            if "security_pin" in patch:
                pin = str(patch["security_pin"] or "")
                if pin:
                    if len(pin) < 4:
                        raise ValueError("PIN must be at least 4 characters")
                    set_setting(self.con, "security", "pin_hash", self._pin_hash(pin))
                else:
                    set_setting(self.con, "security", "pin_hash", "")
            self.con.commit()
        return self.get_settings()

    def verify_pin(self, pin: str) -> bool:
        with self.lock:
            expected = get_setting(self.con, "security", "pin_hash", "")
            return bool(expected) and self._pin_hash(pin) == expected

    # ---- goals ----
    GOAL_FIELDS = {"name", "kind", "item_name", "currency", "target_amount", "saved_amount",
                    "monthly_income", "start_date", "target_date", "account_login", "note", "budget_category",
                    "priority", "allocation_pct"}

    def list_goals(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.con.execute(
                "SELECT * FROM goals ORDER BY created_at DESC, id DESC").fetchall()]

    def create_goal(self, body: dict) -> dict:
        fields = {k: v for k, v in body.items() if k in self.GOAL_FIELDS}
        if not fields.get("name") or not fields.get("target_amount"):
            raise ValueError("name and target_amount are required")
        with self.lock:
            cur = self.con.execute(
                """INSERT INTO goals(name,kind,item_name,currency,target_amount,saved_amount,
                   monthly_income,start_date,target_date,account_login,note,budget_category,status,created_at,archived_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (fields.get("name"), fields.get("kind", "money"), fields.get("item_name", ""),
                 fields.get("currency", "USD"), fields.get("target_amount"), fields.get("saved_amount", 0),
                 fields.get("monthly_income", 0), fields.get("start_date"), fields.get("target_date"),
                 fields.get("account_login"), fields.get("note", ""), fields.get("budget_category"),
                 "archived", int(time.time()), int(time.time())),
            )
            self.con.commit()
            gid = cur.lastrowid
        row = self.con.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone()
        return dict(row)

    def update_goal(self, gid: int, patch: dict) -> dict:
        updates = {k: v for k, v in patch.items() if k in self.GOAL_FIELDS}
        now = int(time.time())
        if "status" in patch:
            st = patch["status"]
            updates["status"] = st
            if st == "active":
                updates["activated_at"] = now
            elif st == "archived":
                updates["archived_at"] = now
        if not updates:
            raise ValueError("no updatable fields")
        sets = ", ".join(f"{k}=?" for k in updates)
        with self.lock:
            self.con.execute(f"UPDATE goals SET {sets} WHERE id=?", (*updates.values(), gid))
            self.con.commit()
        row = self.con.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone()
        if row is None:
            raise KeyError(gid)
        return dict(row)

    def delete_goal(self, gid: int) -> None:
        with self.lock:
            self.con.execute("DELETE FROM goals WHERE id=?", (gid,))
            self.con.commit()

    def goal_plan(self, gid: int) -> dict:
        with self.lock:
            row = self.con.execute("SELECT * FROM goals WHERE id=?", (gid,)).fetchone()
            if row is None:
                raise KeyError(gid)
            goal = dict(row)
            current_saved = None
            if goal.get("status") == "active" and goal.get("account_login"):
                snap = self.con.execute(
                    "SELECT balance FROM snapshots WHERE login=? ORDER BY t DESC LIMIT 1",
                    (goal["account_login"],)).fetchone()
                if snap:
                    current_saved = snap["balance"]
            try:
                weekly_budget = float(get_setting(self.con, "global", "goal_budget_weekly", "0"))
            except (ValueError, TypeError):
                weekly_budget = 0.0
            return goals.plan_goal(goal, current_saved=current_saved, weekly_budget=weekly_budget)

    # ---- missions / gamification ----
    def daily_mission_overrides(self) -> list[dict]:
        with self.lock:
            rows = [dict(r) for r in self.con.execute("SELECT * FROM missions_daily_override ORDER BY key").fetchall()]
            for r in rows:
                r["enabled"] = bool(r["enabled"])
            return rows

    def set_daily_mission_override(self, key: str, body: dict) -> dict:
        with self.lock:
            enabled = body.get("enabled")
            target = body.get("target")
            stars = body.get("stars")
            missions.set_daily_override(self.con, key, enabled, target, stars)
            self.con.commit()
            return {"ok": True, "key": key}

    def delete_daily_mission_override(self, key: str) -> int:
        with self.lock:
            n = missions.delete_daily_override(self.con, key)
            self.con.commit()
            return n

    def missions_daily(self, login: int | None = None) -> dict:
        with self.lock:
            base = missions.gamification(self.con, login)
            self.con.commit()          # persist newly earned badges
            customs = accounting.eval_custom_missions(self.con)
            if customs:
                base["missions"] = base["missions"] + customs
                tl = base["totals"]
                tl["today_total"] += len(customs)
                done = sum(1 for c in customs if c["done"])
                stars = sum(c.get("stars", c["xp"]) for c in customs if c["done"])
                tl["today_done"] += done
                tl["today_stars"] = tl.get("today_stars", 0) + stars
                tl["today_xp"] = tl["today_stars"]
                tl["stars"] = min(5, tl["today_done"] // 2 + (1 if tl["today_stars"] >= 30 else 0))
            return base

    # ---- expenses ----
    EXPENSE_FIELDS = {"name", "amount", "currency", "note", "recurring", "day_of_month"}

    def list_expenses(self) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.con.execute("SELECT * FROM expenses ORDER BY id").fetchall()]

    def create_expense(self, body: dict) -> dict:
        fields = {k: v for k, v in body.items() if k in self.EXPENSE_FIELDS}
        if not fields.get("name") or not fields.get("amount"):
            raise ValueError("name and amount are required")
        with self.lock:
            cur = self.con.execute(
                "INSERT INTO expenses(name,amount,currency,note,recurring,day_of_month,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (fields["name"], float(fields["amount"]), fields.get("currency", "USD"),
                 fields.get("note", ""), int(fields.get("recurring", 0)),
                 fields.get("day_of_month"), int(time.time())),
            )
            self.con.commit()
            gid = cur.lastrowid
        row = self.con.execute("SELECT * FROM expenses WHERE id=?", (gid,)).fetchone()
        return dict(row)

    def update_expense(self, eid: int, patch: dict) -> dict:
        updates = {k: v for k, v in patch.items() if k in self.EXPENSE_FIELDS}
        if not updates:
            raise ValueError("no updatable fields")
        if "recurring" in updates:
            updates["recurring"] = int(1 if updates["recurring"] else 0)
        if "day_of_month" in updates:
            updates["day_of_month"] = int(updates["day_of_month"]) if updates["day_of_month"] else None
        sets = ", ".join(f"{k}=?" for k in updates)
        with self.lock:
            self.con.execute(f"UPDATE expenses SET {sets} WHERE id=?", (*updates.values(), eid))
            self.con.commit()
        row = self.con.execute("SELECT * FROM expenses WHERE id=?", (eid,)).fetchone()
        if row is None:
            raise KeyError(eid)
        return dict(row)

    def delete_expense(self, eid: int) -> None:
        with self.lock:
            self.con.execute("DELETE FROM expenses WHERE id=?", (eid,))
            self.con.commit()

    # ---- accounting: transactions ----
    def transactions(self, txn_type: str | None = None, month: str | None = None) -> list[dict]:
        with self.lock:
            return accounting.txn_list(self.con, txn_type, month)

    def create_transaction(self, body: dict) -> dict:
        with self.lock:
            try:
                row = accounting.create_txn(self.con, body)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def update_transaction(self, tid: int, patch: dict) -> dict:
        with self.lock:
            try:
                row = accounting.update_txn(self.con, tid, patch)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def delete_transaction(self, tid: int) -> None:
        with self.lock:
            accounting.delete_txn(self.con, tid)
            self.con.commit()

    # ---- accounting: bank accounts ----
    def bank_accounts(self) -> list[dict]:
        with self.lock:
            return accounting.bank_accounts(self.con)

    def create_bank_account(self, body: dict) -> dict:
        with self.lock:
            try:
                row = accounting.create_bank_account(self.con, body)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def update_bank_account(self, baid: int, patch: dict) -> dict:
        with self.lock:
            try:
                row = accounting.update_bank_account(self.con, baid, patch)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def delete_bank_account(self, baid: int) -> None:
        with self.lock:
            accounting.delete_bank_account(self.con, baid)
            self.con.commit()

    # ---- accounting: budgets ----
    def budgets(self) -> list[dict]:
        with self.lock:
            return accounting.budgets(self.con)

    def create_budget(self, body: dict) -> dict:
        with self.lock:
            try:
                row = accounting.create_budget(self.con, body)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def update_budget(self, bid: int, patch: dict) -> dict:
        with self.lock:
            try:
                row = accounting.update_budget(self.con, bid, patch)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def delete_budget(self, bid: int) -> None:
        with self.lock:
            accounting.delete_budget(self.con, bid)
            self.con.commit()

    # ---- accounting: installment payment ----
    def pay_obligation_installment(self, oid: int, bank_account_id: int) -> dict:
        with self.lock:
            try:
                row = accounting.pay_installment(self.con, oid, bank_account_id)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    # ---- notifications ----
    def notifications(self, unread_only: bool = False) -> list[dict]:
        with self.lock:
            return accounting.notifications(self.con, unread_only)

    def mark_notifications_seen(self, ids: list[int]) -> int:
        with self.lock:
            n = accounting.mark_notifications_seen(self.con, ids)
            self.con.commit()
            return n

    # ---- accounting: obligations ----
    def obligations(self) -> dict:
        with self.lock:
            return accounting.obligations_summary(self.con)

    def create_obligation(self, body: dict) -> dict:
        with self.lock:
            try:
                row = accounting.create_obligation(self.con, body)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def update_obligation(self, oid: int, patch: dict) -> dict:
        with self.lock:
            try:
                row = accounting.update_obligation(self.con, oid, patch)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def delete_obligation(self, oid: int) -> None:
        with self.lock:
            accounting.delete_obligation(self.con, oid)
            self.con.commit()

    # ---- accounting: summary / series ----
    def accounting_summary(self, month: str | None = None) -> dict:
        with self.lock:
            return accounting.month_summary(self.con, month)

    def accounting_series(self, months: int = 12) -> list[dict]:
        with self.lock:
            return accounting.monthly_series(self.con, months)

    # ---- news / calendar ----
    def import_news_bytes(self, raw: bytes) -> dict:
        with self.lock:
            rows = news.parse_csv_bytes(raw)
            if not rows:
                raise ValueError("no valid rows found in CSV")
            n = 0
            for r in rows:
                news.import_rows(self.con, [r])
                n += 1
            self.con.commit()
            return {"imported": n, "rows": len(rows)}

    def news_events(self) -> list[dict]:
        with self.lock:
            return news.list_events(self.con)

    def clear_news(self) -> int:
        with self.lock:
            n = news.clear_events(self.con)
            self.con.commit()
            return n

    def fetch_news(self, day: str | None = None) -> dict:
        """Pull the ForexFactory calendar (via r.jina.ai) and import it.
        If day is given, only that day is fetched (used by the scheduler)."""
        with self.lock:
            try:
                if day:
                    rows = news_fetch._fetch_day(day)
                else:
                    rows = news_fetch.fetch_calendar()
                if not rows:
                    return {"imported": 0, "rows": 0, "error": None}
                n = news_fetch.upsert_events(self.con, rows)
                if not day:
                    # keep only the current week: drop anything before this week's Monday
                    today = datetime.now(TEHRAN).date()
                    monday = today - timedelta(days=today.weekday())
                    news.purge_old_events(self.con, monday.isoformat())
                self.con.commit()
                return {"imported": n, "rows": len(rows), "error": None}
            except news_fetch.FetchError as e:
                return {"imported": 0, "rows": 0, "error": str(e)}
            except Exception as e:  # noqa: BLE001
                return {"imported": 0, "rows": 0, "error": str(e)}

    def news_fetch_status(self) -> dict:
        with self.lock:
            return {
                "scheduler_running": self._news_scheduler._thread is not None and self._news_scheduler._thread.is_alive(),
                "last_error": self._news_scheduler.last_error,
                "fetch_count": self._news_scheduler.fetch_count,
            }

    def maybe_notify_news(self, lead_minutes: int | None = None) -> int:
        """Create a notification for watched upcoming news events within `lead_minutes`.

        Only events whose title contains one of the watched titles/patterns are
        notified. One notification per event (deduped by ref_id)."""
        with self.lock:
            if lead_minutes is None:
                try:
                    lead_minutes = int(get_setting(self.con, "global", "news_lead_minutes", "15"))
                except (ValueError, TypeError):
                    lead_minutes = 15
            try:
                watch = json.loads(get_setting(self.con, "global", "news_watch", "[]"))
            except (ValueError, TypeError):
                watch = []
            patterns = [str(w).strip().lower() for w in watch if str(w).strip()]
            if not patterns:
                return 0
            now = int(time.time())
            created = 0
            for ev in news.list_events(self.con):
                ts = ev.get("ts")
                if not ts or ev.get("impact") == "Holiday":
                    continue
                remaining = ts - now
                if not (0 <= remaining <= lead_minutes * 60):
                    continue
                title = (ev.get("title") or "").strip()
                low = title.lower()
                if not any(p in low for p in patterns):
                    continue
                dup = self.con.execute(
                    "SELECT id FROM notifications WHERE ref_type='news' AND ref_id=?", (ev["id"],)
                ).fetchone()
                if dup:
                    continue
                self.con.execute(
                    """INSERT INTO notifications(kind,title,body,ref_type,ref_id,due_date,seen,created_at)
                       VALUES('news',?,?, 'news',?,?,0,?)""",
                    (title, f"{ev.get('country','')} · {ev.get('event_time','')}",
                     ev["id"], ev.get("event_date"), now),
                )
                created += 1
            if created:
                self.con.commit()
            return created

    def clear_notifications(self) -> int:
        with self.lock:
            cur = self.con.execute("DELETE FROM notifications")
            self.con.commit()
            return cur.rowcount

    # ---- custom missions ----
    def custom_missions(self) -> list[dict]:
        with self.lock:
            return accounting.custom_missions(self.con)

    def create_custom_mission(self, body: dict) -> dict:
        with self.lock:
            try:
                row = accounting.create_custom_mission(self.con, body)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def update_custom_mission(self, mid: int, patch: dict) -> dict:
        with self.lock:
            try:
                row = accounting.update_custom_mission(self.con, mid, patch)
                self.con.commit()
                return row
            except Exception:
                self.con.rollback()
                raise

    def delete_custom_mission(self, mid: int) -> None:
        with self.lock:
            accounting.delete_custom_mission(self.con, mid)
            self.con.commit()

    # ---- finance ----
    def finance_summary(self, login: int | None = None, month: str | None = None) -> dict:
        with self.lock:
            if not month:
                now = datetime.now(tz=timezone.utc).astimezone()
                month = now.strftime("%Y-%m")
            return finances.month_summary(self.con, login, month)

    def trades(self, f: dict) -> list[dict]:
        with self.lock:
            return analytics.filtered_trades(self.con, f)

    def open_positions(self, login: int | None = None) -> list[dict]:
        with self.lock:
            if login:
                rows = self.con.execute("SELECT * FROM open_positions WHERE login=? ORDER BY open_time", (login,)).fetchall()
            else:
                rows = self.con.execute("SELECT * FROM open_positions ORDER BY login, open_time").fetchall()
            return [dict(r) for r in rows]

    def equity(self, login: int | None, limit: int = 5000) -> list[dict]:
        with self.lock:
            q = "SELECT login, t, balance, equity, floating FROM snapshots"
            args: tuple = ()
            if login:
                q += " WHERE login=?"
                args = (login,)
            q += " ORDER BY t DESC LIMIT ?"
            rows = self.con.execute(q, (*args, limit)).fetchall()
            return [dict(r) for r in reversed(rows)]

    def filter_options(self) -> dict:
        with self.lock:
            return analytics.filter_options(self.con)

    def status(self) -> dict:
        with self.lock:
            counts = {
                t: self.con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                for t in ("accounts", "deals", "trades", "snapshots", "open_positions")
            }
        return {
            "events_file": str(self.events_path),
            "events_file_exists": self.events_path.exists(),
            "db_file": str(self.db_path),
            "counts": counts,
            "last_error": self.last_error,
            "server_time": int(time.time()),
        }
