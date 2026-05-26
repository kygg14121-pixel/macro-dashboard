import React, { useState } from "react";
import FredCharts from "./components/FredChart";
import MarketData from "./components/MarketData";
import FearGreed from "./components/FearGreed";
import NewsSection from "./components/NewsSection";
import FinvizHeatmap from "./components/FinvizHeatmap";

function RefreshButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors font-medium"
    >
      <span className={loading ? "animate-spin" : ""}>↻</span>
      {loading ? "갱신 중..." : "데이터 갱신"}
    </button>
  );
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const now = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  function handleRefresh() {
    setLoading(true);
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setLoading(false);
    }, 300);
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              🇺🇸 미국 거시경제 대시보드
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">마지막 갱신: {now}</p>
          </div>
          <RefreshButton onClick={handleRefresh} loading={loading} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-8" key={refreshKey}>
        {/* FRED 지표 */}
        <FredCharts />

        {/* 시장 데이터 */}
        <MarketData />

        {/* Fear & Greed — 두 게이지 나란히 */}
        <FearGreed />

        {/* 뉴스 */}
        <NewsSection />

        {/* Finviz 히트맵 */}
        <FinvizHeatmap />
      </main>

      <footer className="text-center text-xs text-gray-700 py-6 border-t border-gray-800 mt-8">
        데이터 출처: FRED · Alpha Vantage · Alternative.me · NewsAPI · Finviz | AI 요약: Anthropic Claude
      </footer>
    </div>
  );
}
