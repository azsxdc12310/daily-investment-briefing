#!/usr/bin/env python3
"""Fetch Taiwan stock headlines from GDELT for the public homepage feed."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from time import sleep

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "tw-hot-news.json"
QUERY = '(台股 OR 台灣股市 OR 台灣加權指數 OR TAIEX OR Taiwan stocks OR TSMC OR MediaTek OR Foxconn OR 台積電 OR 聯發科 OR 鴻海) sourcecountry:taiwan'


def main() -> None:
    params = urlencode({
        "query": QUERY,
        "mode": "artlist",
        "format": "json",
        "timespan": "24h",
        "maxrecords": "12",
        "sort": "hybridrel",
    })
    request = Request(
        "https://api.gdeltproject.org/api/v2/doc/doc?" + params,
        headers={"User-Agent": "DailyInvestmentBriefing/1.0"},
    )
    payload = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
            break
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
            retry_after = error.headers.get("Retry-After", "")
            try:
                delay = max(15, min(90, int(retry_after)))
            except ValueError:
                delay = 15 * (attempt + 1)
            sleep(delay)
    if payload is None:
        raise RuntimeError("GDELT request did not return data")

    raw_articles = payload.get("articles")
    if not isinstance(raw_articles, list):
        raise RuntimeError("GDELT response did not contain an articles list")

    articles = []
    seen_urls: set[str] = set()
    for item in raw_articles:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()[:240]
        url = str(item.get("url") or "").strip()
        if not title or not url.startswith(("https://", "http://")):
            continue
        try:
            parts = urlsplit(url)
            scheme = parts.scheme.lower()
            host = (parts.hostname or "").lower()
            port = parts.port
            keep_port = port and not (scheme == "https" and port == 443) and not (scheme == "http" and port == 80)
            netloc = host + (f":{port}" if keep_port else "")
            canonical_url = urlunsplit((scheme, netloc, parts.path, parts.query, ""))
        except ValueError:
            continue
        if not host or canonical_url in seen_urls:
            continue
        seen_urls.add(canonical_url)
        seen_date = str(item.get("seendate") or "")
        collected_at = None
        try:
            collected_at = datetime.strptime(seen_date, "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            ).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
        articles.append({
            "title": title,
            "url": canonical_url,
            "source": str(item.get("domain") or "新聞來源")[:100],
            "collected_at": collected_at,
        })
        if len(articles) >= 12:
            break

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    summary = (
        f"近 24 小時從台灣媒體來源整理 {len(articles)} 則台股新聞，"
        "依 GDELT 混合相關度排序（包含來源受歡迎度）。點開原文核對發布日期與內容。"
        if articles else
        "近 24 小時暫時沒有找到符合條件的台股新聞；可查看最新公司公告。"
    )
    result = {
        "source": "GDELT",
        "summary": summary,
        "updated_at": now,
        "period_hours": 24,
        "articles": articles,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
