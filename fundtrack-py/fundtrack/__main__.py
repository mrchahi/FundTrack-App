"""python -m fundtrack  -> starts the local server, keeps reading the EA's events, opens the dashboard."""
from __future__ import annotations

import argparse
import logging
import threading
import webbrowser

import uvicorn

from .api import create_app
from .service import Service


def main() -> None:
    ap = argparse.ArgumentParser(prog="fundtrack")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--interval", type=float, default=5.0, help="seconds between reads of the EA file")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    svc = Service()
    svc.sync()                                   # first read before the window opens
    svc.start_background(args.interval)
    url = f"http://127.0.0.1:{args.port}"
    print("FundTrack running at", url)
    print("Reading:", svc.events_path)
    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(create_app(svc), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
