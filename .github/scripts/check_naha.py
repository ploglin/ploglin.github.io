#!/usr/bin/env python3
"""Watch TableCheck for a cancellation at 焼肉 琉球の牛 那覇 (yakiniku-naha).

Target: 2026-08-27, 2 adults + 1 infant (5 yrs and under), any slot 19:00-19:45.
Pushes to ntfy.sh only when the set of open target slots changes, so a slot that
stays open does not re-ping every 15 minutes.
"""
import base64
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SHOP = "yakiniku-naha"
DATE = "2026-08-27"
WANT = ["19:00", "19:15", "19:30", "19:45"]
ADULT, CHILD, BABY = 2, 0, 1  # 5 yrs and under goes in the "baby" field
JST = timezone(timedelta(hours=9))

NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")
STATE_FILE = os.environ.get("STATE_FILE", "state.json")
BOOK_URL = "https://www.tablecheck.com/zh-TW/shops/%s/reserve" % SHOP


def fetch_open_slots():
    url = "https://www.tablecheck.com/zh-TW/shops/%s/available/timetable?%s" % (
        SHOP,
        urllib.parse.urlencode({
            "reservation[start_date]": DATE,
            "reservation[num_people_adult]": ADULT,
            "reservation[num_people_child]": CHILD,
            "reservation[num_people_baby]": BABY,
        }),
    )
    req = urllib.request.Request(url, headers={
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    slots = data.get("data", {}).get("slots", {}).get(DATE)
    if not slots:
        raise RuntimeError("no slot data returned for %s" % DATE)
    return sorted(
        datetime.fromtimestamp(int(e), JST).strftime("%H:%M")
        for e, v in slots.items() if v.get("available")
    )


def encode_header(value):
    """HTTP headers are latin-1 only; ntfy accepts RFC 2047 encoded-words."""
    try:
        value.encode("latin-1")
        return value
    except UnicodeEncodeError:
        return "=?UTF-8?B?%s?=" % base64.b64encode(value.encode("utf-8")).decode()


def notify(title, body, priority, tags):
    if not NTFY_TOPIC:
        print("!! NTFY_TOPIC unset, skipping push")
        return False
    req = urllib.request.Request(
        "https://ntfy.sh/" + NTFY_TOPIC,
        data=body.encode("utf-8"),
        headers={
            "Title": encode_header(title),
            "Priority": priority,
            "Tags": tags,
            "Click": BOOK_URL,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print("push sent (%s)" % r.status)
    return True


def main():
    # Stop watching once the reservation date has passed (JST).
    if datetime.now(JST).strftime("%Y-%m-%d") > DATE:
        print("past %s, nothing to watch" % DATE)
        return 0

    try:
        open_slots = fetch_open_slots()
    except Exception as exc:  # noqa: BLE001 - surface any failure, keep exit 0
        print("ERROR: %s" % exc)
        return 1

    hits = [t for t in WANT if t in open_slots]
    print("date=%s open=%s" % (DATE, ", ".join(open_slots) or "(none)"))
    print("target hits: %s" % (", ".join(hits) or "none"))

    prev = []
    try:
        with open(STATE_FILE, encoding="utf-8") as fh:
            prev = json.load(fh).get("hits", [])
    except (OSError, ValueError):
        print("no previous state (will notify if anything is open)")

    if hits and hits != prev:
        sent = notify(
            "8/27 那覇燒肉有位了！",
            "%s 空出：%s\n2大人+1幼兒(5歲以下)\n當日全部可訂：%s"
            % (DATE, "、".join(hits), "、".join(open_slots)),
            "urgent",
            "meat_on_bone,tada",
        )
        if not sent:
            # Don't record a hit we failed to announce, or the next run would
            # see an unchanged state and stay silent forever.
            print("state not saved; will retry the alert next run")
            return 1
    elif prev and not hits:
        print("slots closed again since last run")

    with open(STATE_FILE, "w", encoding="utf-8") as fh:
        json.dump({"hits": hits, "open": open_slots}, fh)
    return 0


if __name__ == "__main__":
    sys.exit(main())
