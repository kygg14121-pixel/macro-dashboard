from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import json
import re
import asyncio
import time
from pathlib import Path
from dotenv import load_dotenv

# ── 로컬 개발용 .env 로드 (Railway는 Variables 탭에서 주입 → override=False)
for _env_candidate in [
    Path(__file__).parent / ".env",          # backend/.env
    Path(__file__).parent.parent / ".env",   # 루트 .env
]:
    if _env_candidate.exists():
        load_dotenv(_env_candidate, override=False)
        break


def _env(key: str) -> str:
    """항상 os.environ에서 직접 읽어 Railway 주입 타이밍 문제를 방지."""
    return os.environ.get(key, "").strip()


app = FastAPI(title="Macro Dashboard API")

ALLOWED_ORIGINS = [
    "https://macro-dashboard-nu-ten.vercel.app",
    "https://macro-dashboard-production-3422.up.railway.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health — 각 키 설정 여부 + 앞 4자리 힌트
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    def key_status(val: str):
        return {"set": bool(val), "hint": val[:4] + "****" if val else ""}

    return {
        "status": "ok",
        "env": {
            "FRED_API_KEY":          key_status(_env("FRED_API_KEY")),
            "ALPHA_VANTAGE_API_KEY": key_status(_env("ALPHA_VANTAGE_API_KEY")),
            "NEWS_API_KEY":          key_status(_env("NEWS_API_KEY")),
            "ANTHROPIC_API_KEY":     key_status(_env("ANTHROPIC_API_KEY")),
        },
    }


@app.get("/debug/env")
async def debug_env():
    """Railway에서 실제로 주입된 환경변수 키 목록 확인용 (값은 숨김)"""
    all_keys = sorted(os.environ.keys())
    app_keys = {
        "FRED_API_KEY":          bool(_env("FRED_API_KEY")),
        "ALPHA_VANTAGE_API_KEY": bool(_env("ALPHA_VANTAGE_API_KEY")),
        "NEWS_API_KEY":          bool(_env("NEWS_API_KEY")),
        "ANTHROPIC_API_KEY":     bool(_env("ANTHROPIC_API_KEY")),
    }
    return {
        "app_keys_found": app_keys,
        "all_env_keys": all_keys,
        "total_env_count": len(all_keys),
    }


@app.get("/debug/copper")
async def debug_copper():
    """구리 데이터 소스 실시간 진단 — 각 심볼·엔드포인트 응답 확인용."""
    av_key = _env("ALPHA_VANTAGE_API_KEY")
    if not av_key:
        return {"error": "ALPHA_VANTAGE_API_KEY not set"}

    results = {}

    # 1) TIME_SERIES_DAILY: CPER
    for sym in ("CPER", "JJC"):
        url = (
            f"https://www.alphavantage.co/query"
            f"?function=TIME_SERIES_DAILY&symbol={sym}&outputsize=compact&apikey={av_key}"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
        data = resp.json()
        ts = data.get("Time Series (Daily)", {})
        dates = sorted(ts.keys(), reverse=True)[:2]
        results[f"TIME_SERIES_DAILY_{sym}"] = {
            "status": resp.status_code,
            "rate_limited": _av_is_rate_limited(data),
            "latest_dates": dates,
            "latest_close": float(ts[dates[0]]["4. close"]) if dates else None,
            "keys_in_response": list(data.keys()),
        }
        await asyncio.sleep(13)  # AV 무료 키 5 req/min 제한

    # 2) COPPER function (daily interval)
    url = f"https://www.alphavantage.co/query?function=COPPER&interval=daily&apikey={av_key}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    entries = data.get("data", [])[:3]
    results["COPPER_daily"] = {
        "status": resp.status_code,
        "rate_limited": _av_is_rate_limited(data),
        "latest_entries": entries,
        "keys_in_response": list(data.keys()),
    }

    return results


# ---------------------------------------------------------------------------
# FRED
# ---------------------------------------------------------------------------

@app.get("/api/fred/{series_id}")
async def get_fred_series(series_id: str, limit: int = 60):
    fred_key = _env("FRED_API_KEY")
    if not fred_key:
        # 500 대신 빈 데이터 반환 — 프론트가 "데이터 없음" 으로 표시
        return {"series_id": series_id, "data": [], "error": "FRED_API_KEY not configured"}

    url = (
        "https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={fred_key}&file_type=json"
        f"&sort_order=desc&limit={limit}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"FRED: {resp.text[:200]}")
        data = resp.json()

    observations = [
        {"date": o["date"], "value": o["value"]}
        for o in reversed(data.get("observations", []))
        if o["value"] != "."
    ]
    return {"series_id": series_id, "data": observations}


# ---------------------------------------------------------------------------
# Alpha Vantage — helpers
# ---------------------------------------------------------------------------

def _av_is_rate_limited(data: dict) -> bool:
    return any(k in data for k in ("Information", "Note", "Error Message"))


async def _av_commodity(symbol: str, limit: int = 60) -> dict:
    url = (
        f"https://www.alphavantage.co/query"
        f"?function={symbol}&interval=daily&apikey={_env('ALPHA_VANTAGE_API_KEY')}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    if _av_is_rate_limited(data):
        return {"current": None, "history": [], "rate_limited": True}
    entries = [e for e in data.get("data", [])[:limit] if e.get("value") not in (None, ".", "")]
    return {
        "current": float(entries[0]["value"]) if entries else None,
        "history": [{"date": e["date"], "value": float(e["value"])} for e in reversed(entries)],
    }


async def _av_stock_daily(symbol: str, limit: int = 30) -> dict:
    url = (
        f"https://www.alphavantage.co/query"
        f"?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=compact"
        f"&apikey={_env('ALPHA_VANTAGE_API_KEY')}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    if _av_is_rate_limited(data):
        return {"current": None, "history": [], "rate_limited": True}
    ts = data.get("Time Series (Daily)", {})
    dates = sorted(ts.keys(), reverse=True)[:limit]
    if not dates:
        return {"current": None, "history": []}
    return {
        "current": float(ts[dates[0]]["4. close"]),
        "history": [{"date": d, "value": float(ts[d]["4. close"])} for d in reversed(dates)],
    }


async def _av_fx_daily(from_sym: str, to_sym: str, limit: int = 30) -> dict:
    url = (
        f"https://www.alphavantage.co/query"
        f"?function=FX_DAILY&from_symbol={from_sym}&to_symbol={to_sym}"
        f"&apikey={_env('ALPHA_VANTAGE_API_KEY')}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    if _av_is_rate_limited(data):
        return {"current": None, "history": [], "rate_limited": True}
    ts = data.get("Time Series FX (Daily)", {})
    dates = sorted(ts.keys(), reverse=True)[:limit]
    if not dates:
        return {"current": None, "history": []}
    return {
        "current": float(ts[dates[0]]["4. close"]),
        "history": [{"date": d, "value": float(ts[d]["4. close"])} for d in reversed(dates)],
    }


# ---------------------------------------------------------------------------
# Market data cache — 백그라운드 15분 TTL
# ---------------------------------------------------------------------------

_market_cache: dict = {"data": None, "ts": 0.0, "fetching": False}
_MARKET_TTL = 900


async def _av_fred_copper() -> dict:
    """FRED PCOPPUSDM — LME 구리 현물가 (USD/메트릭톤, 월간)"""
    fred_key = _env("FRED_API_KEY")
    if not fred_key:
        return {"current": None, "history": [], "error": "FRED_API_KEY not set"}
    url = (
        "https://api.stlouisfed.org/fred/series/observations"
        "?series_id=PCOPPUSDM&api_key=" + fred_key +
        "&file_type=json&sort_order=desc&limit=24"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    obs = [
        {"date": o["date"], "value": float(o["value"])}
        for o in reversed(data.get("observations", []))
        if o["value"] != "."
    ]
    if not obs:
        return {"current": None, "history": []}
    return {
        "current": obs[-1]["value"],
        "history": obs,
        "_symbol": "LME_SPOT",
    }


async def _refresh_market_cache() -> None:
    if _market_cache["fetching"]:
        return
    _market_cache["fetching"] = True

    steps = [
        ("WTI",    lambda: _av_commodity("WTI")),
        ("COPPER", lambda: _av_fred_copper()),
        ("GOLD",   lambda: _av_stock_daily("GLD")),
        ("SILVER", lambda: _av_stock_daily("SLV")),
        ("DXY",    lambda: _av_fx_daily("USD", "EUR")),
    ]
    results = {}
    for i, (key, fetcher) in enumerate(steps):
        if i > 0:
            await asyncio.sleep(13)
        try:
            results[key] = await fetcher()
        except Exception as e:
            results[key] = {"current": None, "history": [], "error": str(e)[:80]}

    _market_cache["data"] = results
    _market_cache["ts"] = time.time()
    _market_cache["fetching"] = False


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_refresh_market_cache())


@app.get("/api/market")
async def get_market_data(refresh: bool = False):
    if not _env("ALPHA_VANTAGE_API_KEY"):
        return {k: {"current": None, "history": []} for k in ["DXY", "WTI", "GOLD", "SILVER", "COPPER"]}

    now = time.time()
    cache_age = now - _market_cache["ts"]

    if refresh or (not _market_cache["data"]) or (cache_age > _MARKET_TTL):
        asyncio.create_task(_refresh_market_cache())

    if not _market_cache["data"]:
        return {
            "_loading": True,
            "_message": "데이터 수집 중... 약 60초 후 새로고침하세요",
            **{k: {"current": None, "history": []} for k in ["DXY", "WTI", "GOLD", "SILVER", "COPPER"]},
        }

    return {**_market_cache["data"], "_cached": True, "_age_seconds": int(cache_age)}


# ---------------------------------------------------------------------------
# Fear & Greed
# ---------------------------------------------------------------------------

@app.get("/api/fear-greed")
async def get_fear_greed():
    url = "https://api.alternative.me/fng/?limit=30&format=json"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        data = resp.json()

    entries = data.get("data", [])
    current = entries[0] if entries else {}
    history = [
        {"timestamp": e["timestamp"], "value": int(e["value"]), "classification": e["value_classification"]}
        for e in reversed(entries)
    ]
    return {
        "current_value": int(current.get("value", 0)),
        "current_classification": current.get("value_classification", ""),
        "history": history,
    }


_CNN_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://edition.cnn.com",
    "Referer": "https://edition.cnn.com/markets/fear-and-greed",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}


async def _try_cnn_dataviz() -> dict | None:
    """CNN dataviz API 직접 호출."""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=_CNN_BROWSER_HEADERS)
        if resp.status_code != 200:
            return None
        data = resp.json()
        fg = data.get("fear_and_greed", {})
        if not fg.get("score"):
            return None
        historical_data = data.get("fear_and_greed_historical", {}).get("data", [])
        history = [
            {
                "timestamp": str(int(h.get("x", 0) / 1000)),
                "value": round(float(h.get("y", 0))),
                "classification": h.get("rating", ""),
            }
            for h in historical_data[-30:]
        ]
        return {
            "current_value": round(float(fg.get("score", 0))),
            "current_classification": fg.get("rating", ""),
            "history": history,
            "source": "cnn",
        }
    except Exception:
        return None


async def _try_rapidapi_fng() -> dict | None:
    """RapidAPI fear-and-greed-index 폴백 (RAPIDAPI_KEY 필요)."""
    rapid_key = _env("RAPIDAPI_KEY")
    if not rapid_key:
        return None
    url = "https://fear-and-greed-index.p.rapidapi.com/v1/fgi"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                url,
                headers={
                    "X-RapidAPI-Key": rapid_key,
                    "X-RapidAPI-Host": "fear-and-greed-index.p.rapidapi.com",
                },
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        fgi = data.get("fgi", {})
        current_value = round(float(fgi.get("value", 0)))
        current_text = fgi.get("valueText", "")
        now_ts = int(time.time())
        snapshots = [
            ("oneYearAgo",    now_ts - 365 * 86400),
            ("oneMonthAgo",   now_ts -  30 * 86400),
            ("oneWeekAgo",    now_ts -   7 * 86400),
            ("previousClose", now_ts -       86400),
        ]
        history = []
        for key, ts in snapshots:
            pt = fgi.get(key) or {}
            v = pt.get("value")
            if v is not None:
                history.append({
                    "timestamp": str(ts),
                    "value": round(float(v)),
                    "classification": pt.get("valueText", ""),
                })
        history.append({"timestamp": str(now_ts), "value": current_value, "classification": current_text})
        return {
            "current_value": current_value,
            "current_classification": current_text,
            "history": history,
            "source": "rapidapi",
        }
    except Exception:
        return None


async def _try_scrape_cnn_page() -> dict | None:
    """CNN 페이지 HTML에서 __NEXT_DATA__ JSON 파싱 폴백."""
    url = "https://edition.cnn.com/markets/fear-and-greed"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": _CNN_BROWSER_HEADERS["User-Agent"],
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
        if resp.status_code != 200:
            return None
        text = resp.text
        # Next.js SSR data blob
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.DOTALL)
        blob = json.loads(m.group(1)) if m else {}
        blob_str = json.dumps(blob) if blob else text
        score_m = re.search(r'"score"\s*:\s*([\d.]+)', blob_str)
        if not score_m:
            # Fallback: search raw HTML
            score_m = re.search(r'"score"\s*:\s*([\d.]+)', text)
        if not score_m:
            return None
        rating_m = re.search(r'"rating"\s*:\s*"([^"]+)"', blob_str if blob else text)
        score = round(float(score_m.group(1)))
        rating = rating_m.group(1) if rating_m else ""
        now_ts = int(time.time())
        return {
            "current_value": score,
            "current_classification": rating,
            "history": [{"timestamp": str(now_ts), "value": score, "classification": rating}],
            "source": "scrape",
        }
    except Exception:
        return None


@app.get("/api/cnn-fear-greed")
async def get_cnn_fear_greed():
    for fn in (_try_cnn_dataviz, _try_rapidapi_fng, _try_scrape_cnn_page):
        result = await fn()
        if result:
            return result
    raise HTTPException(
        status_code=503,
        detail="CNN Fear & Greed: 모든 소스 실패. RAPIDAPI_KEY 환경변수 설정을 확인하세요.",
    )


# ---------------------------------------------------------------------------
# News — Claude 요약은 키가 있을 때만, 없으면 원문 반환
# ---------------------------------------------------------------------------

@app.get("/api/news")
async def get_news():
    news_key = _env("NEWS_API_KEY")
    if not news_key:
        return {"articles": [], "summarized": False, "error": "NEWS_API_KEY not configured"}

    news_url = (
        "https://newsapi.org/v2/top-headlines"
        "?category=business&language=en&pageSize=10"
        f"&apiKey={news_key}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(news_url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"NewsAPI: {resp.text[:200]}")
        articles_data = resp.json().get("articles", [])[:5]

    if not articles_data:
        return {"articles": [], "summarized": False}

    result = [
        {
            "title": a.get("title", ""),
            "url": a.get("url", ""),
            "source": a.get("source", {}).get("name", ""),
            "publishedAt": a.get("publishedAt", ""),
            "urlToImage": a.get("urlToImage", ""),
            "description": a.get("description", ""),
            "summary": "",
            "impact": "",
        }
        for a in articles_data
    ]

    anthropic_key = _env("ANTHROPIC_API_KEY")
    if not anthropic_key:
        return {"articles": result, "summarized": False}

    try:
        import anthropic as _anthropic
        claude = _anthropic.Anthropic(api_key=anthropic_key)
        articles_text = "\n\n".join(
            f"{i+1}. 제목: {a['title']}\n   내용: {a['description']}"
            for i, a in enumerate(result)
        )
        message = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system="당신은 미국 거시경제 전문 애널리스트입니다. 뉴스를 한국어로 요약하세요.",
            messages=[{
                "role": "user",
                "content": (
                    f"다음 뉴스 5건을 각각 한국어로 2~3문장 요약하고 거시경제 영향을 한 문장으로 설명하세요.\n\n{articles_text}\n\n"
                    "JSON 배열만 반환: [{\"title\":\"원제목\",\"summary\":\"요약\",\"impact\":\"영향\"}, ...]"
                ),
            }],
        )
        raw = message.content[0].text
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            for i, s in enumerate(json.loads(m.group())):
                if i < len(result):
                    result[i]["summary"] = s.get("summary", "")
                    result[i]["impact"] = s.get("impact", "")
        return {"articles": result, "summarized": True}
    except Exception as e:
        return {"articles": result, "summarized": False, "claude_error": str(e)[:100]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
