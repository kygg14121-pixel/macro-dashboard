import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import axios from "axios";
import API from "../config.js";

const MARKET_ITEMS = [
  { key: "DXY", label: "달러인덱스 (USD/EUR)", color: "#6366f1", unit: "" },
  { key: "WTI", label: "WTI 유가", color: "#f59e0b", unit: "$" },
  { key: "GOLD", label: "금 (GLD ETF)", color: "#fbbf24", unit: "$" },
  { key: "SILVER", label: "은 (SLV ETF)", color: "#94a3b8", unit: "$" },
  { key: "COPPER", label: "구리 (Copper)", color: "#b45309", unit: "$" },
];

function MarketCard({ item, data }) {
  const current = data?.current;
  const history = data?.history || [];
  const isRateLimited = data?.rate_limited || (data?.note && !current);
  const prev = history.length > 1 ? history[history.length - 2]?.value : null;
  const change = current && prev ? current - prev : null;
  const pct = change && prev ? (change / prev) * 100 : null;

  return (
    <div className="card">
      <div className="card-title">{item.label}</div>
      <div className="flex items-baseline gap-2 mb-2">
        {current !== null && current !== undefined ? (
          <>
            <span className="text-xl font-bold text-white">
              {item.unit}{typeof current === "number" ? current.toFixed(2) : current}
            </span>
            {pct !== null && (
              <span className={`text-xs font-medium ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </span>
            )}
          </>
        ) : isRateLimited ? (
          <span className="text-xs text-orange-400">API 한도 초과 (내일 재설정)</span>
        ) : (
          <span className="text-sm text-gray-500">데이터 없음</span>
        )}
      </div>
      {history.length > 0 && (
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={history} margin={{ top: 2, right: 2, bottom: 0, left: -30 }}>
            <defs>
              <linearGradient id={`grad-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={item.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={item.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "#9ca3af" }}
              itemStyle={{ color: item.color }}
              formatter={(v) => [`${item.unit}${v?.toFixed(2)}`, item.label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={item.color}
              strokeWidth={1.5}
              fill={`url(#grad-${item.key})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function MarketData() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [serverLoading, setServerLoading] = useState(false);

  useEffect(() => {
    axios
      .get(`${API}/api/market`)
      .then((res) => {
        setData(res.data);
        setServerLoading(res.data._loading === true);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">
        시장 데이터 (Alpha Vantage)
        {data._cached && (
          <span className="text-xs text-gray-500 font-normal ml-2">
            캐시 {Math.floor((data._age_seconds || 0) / 60)}분 전
          </span>
        )}
      </h2>
      {loading && <div className="text-gray-500 text-sm">로딩 중...</div>}
      {serverLoading && (
        <div className="text-yellow-500 text-sm mb-3">
          ⏳ 서버가 Alpha Vantage 데이터를 수집 중입니다 (약 60초). 잠시 후 새로고침하세요.
        </div>
      )}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {MARKET_ITEMS.map((item) => (
            <MarketCard key={item.key} item={item} data={data[item.key]} />
          ))}
        </div>
      )}
    </section>
  );
}
