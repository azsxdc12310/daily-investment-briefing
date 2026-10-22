#!/usr/bin/env python3
"""Fetch official TWSE/TPEx daily closing quotes for the site's fixed Taiwan trackers."""
import json
import math
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TRACKED = {
    "0050", "00635U", "00935", "2308", "2330", "2345", "2374",
    "2727", "2885", "2890", "2891", "3293", "6669", "3105",
}
SOURCES = [
    ("TWSE", "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
    ("TPEx", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"),
]


def num(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("＋", "+").replace("－", "-")
    if text in ("", "--", "---", "-", "X0.00"):
        return None
    try:
        result = float(text)
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def roc_date(value):
    raw = str(value or "").strip().replace("/", "").replace("-", "")
    if len(raw) == 7 and raw[:3].isdigit():
        return f"{int(raw[:3]) + 1911:04d}-{raw[3:5]}-{raw[5:7]}"
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return None


def first(row, *keys):
    for key in keys:
        if key in row and str(row[key]).strip():
            return row[key]
    return None


def normalize(row, market):
    symbol = str(first(row, "Code", "SecuritiesCompanyCode", "SecuritiesCode") or "").strip()
    if symbol not in TRACKED:
        return None
    price = num(first(row, "ClosingPrice", "Close"))
    if price is None or price <= 0:
        return None
    change = num(first(row, "Change", "ChangePrice"))
    previous = price - change if change is not None else None
    date = roc_date(first(row, "Date", "TradeDate", "資料日期"))
    return {
        "symbol": symbol,
        "market": "TW",
        "price": price,
        "percent_change": ((price - previous) / previous * 100) if previous and previous > 0 else None,
        "open": num(first(row, "OpeningPrice", "Open")),
        "high": num(first(row, "HighestPrice", "High")),
        "low": num(first(row, "LowestPrice", "Low")),
        "previous_close": previous if previous and previous > 0 else None,
        "volume": num(first(row, "TradeVolume", "TradingShares", "成交股數")),
        "quote_date": date,
        "timestamp": f"{date}T13:30:00+08:00" if date else None,
        "market_open": False,
        "source": f"{market}（官方盤後收盤）",
    }


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "daily-investment-briefing/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8-sig"))
    if not isinstance(data, list):
        raise ValueError(f"Unexpected response from {url}")
    return data


quotes = {}
errors = []
for market, url in SOURCES:
    try:
        for row in fetch(url):
            quote = normalize(row, market)
            if quote:
                quotes[quote["symbol"]] = quote
    except Exception as exc:
        errors.append(f"{market}: {exc}")

if not quotes:
    raise SystemExit("No tracked official quotes received; refusing to replace the published data. " + " | ".join(errors))

payload = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "markets": ["TWSE", "TPEx"],
    "quotes": sorted(quotes.values(), key=lambda quote: quote["symbol"]),
    "missing_symbols": sorted(TRACKED - quotes.keys()),
    "source_urls": [url for _, url in SOURCES],
}
target = Path("data/tw-quotes.json")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Saved {len(quotes)} tracked quotes; missing {len(payload['missing_symbols'])}.")
if errors:
    print("Warnings: " + " | ".join(errors))
