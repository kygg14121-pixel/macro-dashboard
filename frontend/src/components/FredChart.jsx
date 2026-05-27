import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import axios from "axios";
import API from "../config.js";

const SERIES = [
  {
    id: "CPIAUCSL",
    label: "CPI (소비자물가지수)",
    color: "#f59e0b",
    unit: "%",
    yoy: true,
    fetchLimit: 84,
    description: "전년 동월 대비 상승률",
  },
  {
    id: "UNRATE",
    label: "실업률",
    color: "#ef4444",
    unit: "%",
    description: "계절조정 실업률",
  },
  {
    id: "DGS10",
    label: "10년물 국채금리",
    color: "#3b82f6",
    unit: "%",
    description: "미 재무부 10년물",
    daily: true,
  },
];

function ChartCard({ series }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);
  const [change, setChange] = useState(null);

  useEffect(() => {
    const limit = series.yoy ? (series.fetchLimit || 84) : 60;
    axios
      .get(`${API}/api/fred/${series.id}?limit=${limit}`)
      .then((res) => {
        const obs = res.data.data;

        if (series.yoy) {
          const raw = obs.map((o) => ({ date: o.date.slice(0, 7), value: parseFloat(o.value) }));
          const yoyData = [];
          for (let i = 12; i < raw.length; i++) {
            const curr = raw[i].value;
            const prev12 = raw[i - 12].value;
            if (prev12 !== 0) {
              yoyData.push({ date: raw[i].date, value: ((curr - prev12) / prev12) * 100 });
            }
          }
          setData(yoyData);
          if (yoyData.length >= 2) {
            const cur = yoyData[yoyData.length - 1].value;
            const prevYoy = yoyData[yoyData.length - 2].value;
            setCurrent(cur);
            setChange(cur - prevYoy);
          }
        } else {
          setData(obs.map((o) => ({
            date: series.daily ? o.date : o.date.slice(0, 7),
            value: parseFloat(o.value),
          })));
          if (obs.length >= 2) {
            const cur = parseFloat(obs[obs.length - 1].value);
            const prev = parseFloat(obs[obs.length - 2].value);
            setCurrent(cur);
            setChange(cur - prev);
          }
        }
      })
      .catch(() => setError("데이터 로드 실패"))
      .finally(() => setLoading(false));
  }, [series.id]);

  return (
    <div className="card">
      <div className="card-title">{series.label}</div>
      <div className="flex items-baseline gap-3 mb-3">
        {current !== null && (
          <>
            <span className="text-2xl font-bold text-white">
              {series.yoy
                ? `${current.toFixed(1)}%`
                : `${current.toFixed(2)}${series.unit}`}
            </span>
            <span
              className={`text-sm font-medium ${
                change >= 0 ? "text-red-400" : "text-green-400"
              }`}
            >
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(series.yoy ? 1 : 2)}{series.yoy ? "pp" : ""}
            </span>
          </>
        )}
        <span className="text-xs text-gray-500 ml-auto">{series.description}</span>
      </div>
      {loading && <div className="h-40 flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>}
      {error && <div className="h-40 flex items-center justify-center text-red-400 text-sm">{error}</div>}
      {!loading && !error && (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              interval={series.daily ? Math.floor(data.length / 8) : Math.floor(data.length / 5)}
            />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              labelStyle={{ color: "#9ca3af", fontSize: 11 }}
              itemStyle={{ color: series.color, fontSize: 12 }}
              formatter={(v) => [
                series.yoy ? `${v.toFixed(1)}%` : `${v.toFixed(2)}${series.unit}`,
                series.label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={series.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function FredCharts() {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">FRED 거시지표</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SERIES.map((s) => (
          <ChartCard key={s.id} series={s} />
        ))}
      </div>
    </section>
  );
}
