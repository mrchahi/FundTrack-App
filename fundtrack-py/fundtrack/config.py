"""Paths and time zones. Nothing here needs the user to type anything."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")   # UTC+3:30, no DST since 2022
UTC = ZoneInfo("UTC")

# Market sessions in their own local time zones, so summer/winter changes are handled by tzdata.
SESSIONS = {
    "Sydney": ("Australia/Sydney", 7, 16),
    "Tokyo": ("Asia/Tokyo", 9, 15),
    "London": ("Europe/London", 8, 17),
    "New York": ("America/New_York", 8, 17),
}


def common_files_dir() -> Path:
    """MetaTrader 'Common\\Files' folder, where the EA writes its events."""
    env = os.environ.get("FUNDTRACK_COMMON")
    if env:
        return Path(env)
    if sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
        return Path(appdata) / "MetaQuotes" / "Terminal" / "Common" / "Files"
    return Path.home() / ".fundtrack" / "common"


def events_file() -> Path:
    return common_files_dir() / "FundTrack" / "events.jsonl"


def data_dir() -> Path:
    env = os.environ.get("FUNDTRACK_DATA")
    if env:
        return Path(env)
    return Path.home() / ".fundtrack" / "data"


def db_file() -> Path:
    return data_dir() / "fundtrack.sqlite3"
