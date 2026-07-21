"""Publish daily public notices to Matrix rooms.

This is a functional demo publisher. It deliberately sends normal Matrix room
events: do not put private content or an end-to-end encrypted access token in
the JSON content file. Keep the bot access token only in the server environment.

Required environment variables:
  SIC_MATRIX_HOMESERVER=https://matrix-client.matrix.org
  SIC_NOTICE_ACCESS_TOKEN=...
  SIC_NOTICE_DEVOTION_ROOM_ID=!...
  SIC_NOTICE_HYMN_ROOM_ID=!...
  SIC_NOTICE_VERSE_ROOM_ID=!...

Run once (recommended from Task Scheduler / cron):
  python server/matrix_notices.py --content server/daily-notices.json

Or keep the process alive and publish once at the chosen local server time:
  python server/matrix_notices.py --daemon --time 07:00
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

CATEGORIES = (
    ("devotion", "每日圣经灵修", "SIC_NOTICE_DEVOTION_ROOM_ID"),
    ("hymn", "赞美诗歌", "SIC_NOTICE_HYMN_ROOM_ID"),
    ("verse", "每日金句", "SIC_NOTICE_VERSE_ROOM_ID"),
)


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_content(path: Path) -> dict[str, Any]:
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Content file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON content file: {exc}") from exc
    if not isinstance(content, dict):
        raise RuntimeError("Content JSON must be an object")
    return content


def daily_item(content: dict[str, Any], category: str, today: str) -> dict[str, Any]:
    entries = content.get(category, [])
    if not isinstance(entries, list) or not entries:
        raise RuntimeError(f"No entries configured for {category}")
    dated = next(
        (
            item
            for item in entries
            if isinstance(item, dict) and item.get("date") == today
        ),
        None,
    )
    selected = dated or entries[date.today().toordinal() % len(entries)]
    if not isinstance(selected, dict):
        raise RuntimeError(f"Invalid {category} entry")
    title = selected.get("title")
    body = selected.get("body")
    if not isinstance(title, str) or not title.strip() or not isinstance(body, str) or not body.strip():
        raise RuntimeError(f"{category} entry requires non-empty title and body")
    return selected


def format_notice(label: str, item: dict[str, Any]) -> str:
    parts = [f"【{label}】", item["title"].strip(), "", item["body"].strip()]
    reference = item.get("reference")
    if isinstance(reference, str) and reference.strip():
        parts.extend(["", f"经文/来源：{reference.strip()}"])
    audio_url = item.get("audio_url")
    if isinstance(audio_url, str) and audio_url.strip():
        parts.extend(["", f"播放：{audio_url.strip()}"])
    return "\n".join(parts)


def send_text(homeserver: str, token: str, room_id: str, body: str) -> None:
    transaction_id = str(uuid.uuid4())
    endpoint = (
        f"{homeserver.rstrip('/')}/_matrix/client/v3/rooms/"
        f"{quote(room_id, safe='')}/send/m.room.message/{quote(transaction_id, safe='')}"
    )
    payload = json.dumps({"msgtype": "m.text", "body": body}).encode("utf-8")
    request = Request(
        endpoint,
        data=payload,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"Matrix returned HTTP {response.status}")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Matrix send failed for {room_id}: HTTP {exc.code} {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Matrix server unavailable: {exc.reason}") from exc


def publish(content_path: Path, today: str) -> None:
    homeserver = env("SIC_MATRIX_HOMESERVER")
    token = env("SIC_NOTICE_ACCESS_TOKEN")
    content = load_content(content_path)
    for category, label, room_var in CATEGORIES:
        room_id = env(room_var)
        item = daily_item(content, category, today)
        send_text(homeserver, token, room_id, format_notice(label, item))
        print(f"Published {category} to {room_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish daily Matrix notices")
    parser.add_argument(
        "--content",
        default="server/daily-notices.json",
        help="JSON source file (default: server/daily-notices.json)",
    )
    parser.add_argument("--date", default="", help="ISO date; defaults to today")
    parser.add_argument("--daemon", action="store_true", help="Run every day at --time")
    parser.add_argument("--time", default="07:00", help="Local HH:MM for --daemon (default: 07:00)")
    args = parser.parse_args()
    content_path = Path(args.content)
    if not args.daemon:
        publish(content_path, args.date or date.today().isoformat())
        return 0

    if len(args.time) != 5 or args.time[2] != ":" or not args.time.replace(":", "").isdigit():
        raise RuntimeError("--time must be HH:MM")
    last_sent = ""
    while True:
        now = time.localtime()
        today = time.strftime("%Y-%m-%d", now)
        if time.strftime("%H:%M", now) == args.time and last_sent != today:
            publish(content_path, today)
            last_sent = today
        time.sleep(20)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
