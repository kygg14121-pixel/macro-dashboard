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

# Root .env (one level up from backend/)
load_dotenv(Path(__file__).parent.parent / ".env")

app = FastAPI(title="Macro Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRED_API_KEY = os.getenv("FRED_API_KEY", "")
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "fred_key": bool(FRED_API_KEY),
        "av_key": bool(ALPHA_VANTAGE_KEY),
        "news_key": bool(NEWS_API_KEY),
        "anthropic_key": bool(ANTHROPIC_API_KEY),
    }


# ---------------------------------------------------------------------------
# FRED
# ---------------------------------------------------------------------------

@app.get("/api/fred/{series_id}")
async def get_fred_series(series_id: str, limit: int = 60):
    if not FRED_API_KEY:
        raise HTTPException(status_code=500, detail="FRED_API_KEY not set")
    url = (
        "https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={FRED_API_KEY}&file_type=json"
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


async def _av_commodity(symbol: str) -> dict:
    url = (
        f"https://www.alphavantage.co/query"
        f"?function={symbol}&interval=monthly&apikey={ALPHA_VANTAGE_KEY}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    if _av_is_rate_limited(data):
        return {"current": None, "history": [], "rate_limited": True}
    entries = [e for e in data.get("data", [])[:12] if e.get("value") not in (None, ".", "")]
    return {
        "current": float(entries[0]["value"]) if entries else None,
        "history": [{"date": e["date"], "value": float(e["value"])} for e in reversed(entries)],
    }


async def _av_stock_daily(symbol: str, limit: int = 30) -> dict:
    url = (
        f"https://www.alphavantage.co/query"
        f"?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=compact&apikey={ALPHA_VANTAGE_KEY}"
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
        f"?function=FX_DAILY&from_symbol={from_sym}&to_symbol={to_sym}&apikey={ALPHA_VANTAGE_KEY}"
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
# Market data cache — fetched in background, 15-min TTL
# ---------------------------------------------------------------------------

_market_cache: dict = {"data": None, "ts": 0.0, "fetching": False}
_MARKET_TTL = 900  # 15 minutes


async def _refresh_market_cache() -> None:
    """
    5 sequential calls with 13-second gaps to stay under AV free-tier 5 req/min.
    Runs as a background coroutine so the HTTP endpoint never blocks.
    """
    if _market_cache["fetching"]:
        return
    _market_cache["fetching"] = True

    results = {}
    steps = [
        ("WTI",    lambda: _av_commodity("WTI")),
        ("COPPER", lambda: _av_commodity("COPPER")),
        ("GOLD",   lambda: _av_stock_daily("GLD")),   # SPDR Gold ETF proxy
        ("SILVER", lambda: _av_stock_daily("SLV")),   # iShares Silver Trust proxy
        ("DXY",    lambda: _av_fx_daily("USD", "EUR")),
    ]

    for i, (key, fetcher) in enumerate(steps):
        if i > 0:
            await asyncio.sleep(13)   # 13s gap → stays within 5 req/min
        try:
            results[key] = await fetcher()
        except Exception as e:
            results[key] = {"current": None, "history": [], "error": str(e)[:80]}

    _market_cache["data"] = results
    _market_cache["ts"] = time.time()
    _market_cache["fetching"] = False


@app.on_event("startup")
async def startup_event():
    """서버 시작 시 백그라운드로 market 데이터 프리페치"""
    asyncio.create_task(_refresh_market_cache())


@app.get("/api/market")
async def get_market_data(refresh: bool = False):
    """
    캐시된 데이터를 즉시 반환 (백그라운드에서 15분마다 자동 갱신).
    ?refresh=true 로 즉시 갱신 트리거 (완료까지 ~55초 소요).
    """
    if not ALPHA_VANTAGE_KEY:
        return {k: {"current": None, "history": []} for k in ["DXY", "WTI", "GOLD", "SILVER", "COPPER"]}

    now = time.time()
    cache_age = now - _market_cache["ts"]

    # Force refresh requested or cache expired
    if refresh or (not _market_cache["data"]) or (cache_age > _MARKET_TTL):
        asyncio.create_task(_refresh_market_cache())

    if not _market_cache["data"]:
        # Still loading after startup — return loading state
        return {
            "_loading": True,
            "_message": "데이터 수집 중... 약 60초 후 새로고침하세요",
            **{k: {"current": None, "history": []} for k in ["DXY", "WTI", "GOLD", "SILVER", "COPPER"]},
        }

    return {
        **_market_cache["data"],
        "_cached": True,
        "_age_seconds": int(cache_age),
    }


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


# ---------------------------------------------------------------------------
# News  — Claude 요약은 키가 있을 때만
# ---------------------------------------------------------------------------

@app.get("/api/news")
async def get_news():
    if not NEWS_API_KEY:
        raise HTTPException(status_code=500, detail="NEWS_API_KEY not set")

    news_url = (
        "https://newsapi.org/v2/top-headlines"
        "?category=business&language=en&pageSize=10"
        f"&apiKey={NEWS_API_KEY}"
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

    if not ANTHROPIC_API_KEY:
        return {"articles": result, "summarized": False}

    try:
        import anthropic as _anthropic
        claude = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
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
