import React, { useEffect, useRef } from "react";

export default function TradingViewHeatmap() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 컨테이너 완전 초기화
    container.innerHTML = "";

    // TradingView가 요구하는 내부 div
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "calc(100% - 32px)";
    widget.style.width = "100%";
    container.appendChild(widget);

    // copyright div (TradingView 필수)
    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    container.appendChild(copyright);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "600",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">
        S&amp;P 500 섹터 히트맵{" "}
        <span className="text-xs text-gray-500 font-normal">(TradingView)</span>
      </h2>
      <p className="text-xs text-gray-500 mb-2">
        ※ 장중(미국 동부시간 9:30~16:00)에만 실시간 업데이트
      </p>
      <div className="card p-0 overflow-hidden rounded-xl">
        <div
          ref={containerRef}
          className="tradingview-widget-container"
          style={{ height: 600, width: "100%", minHeight: 600 }}
        />
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
          출처:{" "}
          <a
            href="https://www.tradingview.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            TradingView
          </a>{" "}
          &mdash; S&amp;P 500 섹터별 시가총액 및 등락률
        </div>
      </div>
    </section>
  );
}
