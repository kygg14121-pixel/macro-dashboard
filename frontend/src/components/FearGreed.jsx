import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import axios from "axios";
import API from "../config.js";

function getColor(value) {
  if (value <= 20) return "#ef4444";
  if (value <= 40) return "#f97316";
  if (value <= 60) return "#eab308";
  if (value <= 80) return "#84cc16";
  return "#22c55e";
}

function getLabel(classification) {
  const map = {
    "Extreme Fear": "극단적 공포",
    Fear: "공포",
    Neutral: "중립",
    Greed: "탐욕",
    "Extreme Greed": "극단적 탐욕",
  };
  return map[classification] || classification;
}

function Gauge({ value }) {
  const angle = -135 + (value / 100) * 270;
  const color = getColor(value);
  const r = 60;
  const cx = 80;
  const cy = 80;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const startAngle = -135;
  const endAngle = startAngle + (value / 100) * 270;

  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  const bgX2 = cx + r * Math.cos(toRad(startAngle + 270));
  const bgY2 = cy + r * Math.sin(toRad(startAngle + 270));

  return (
    <svg width={160} height={120} viewBox="0 0 160 120">
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${bgX2} ${bgY2}`}
        fill="none"
        stroke="#374151"
        strokeWidth={12}
        strokeLinecap="round"
      />
      {value > 0 && (
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
        />
      )}
      <line
        x1={cx}
        y1={cy}
        x2={cx + (r - 15) * Math.cos(toRad(angle))}
        y2={cy + (r - 15) * Math.sin(toRad(angle))}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={5} fill={color} />
      <text x={cx} y={cy + 22} textAnchor="middle" fill="white" fontSize={22} fontWeight="bold">
        {value}
      </text>
    </svg>
  );
}

export default function FearGreed() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${API}/api/fear-greed`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="card">
      <div className="card-title">공포탐욕지수</div>
      <div className="text-gray-500 text-sm">로딩 중...</div>
    </div>
  );

  if (!data) return null;

  const color = getColor(data.current_value);
  const historyData = data.history.map((h) => ({
    date: new Date(parseInt(h.timestamp) * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    value: h.value,
  }));

  return (
    <div className="card">
      <div className="card-title">공포탐욕지수 (Alternative.me)</div>
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="flex flex-col items-center">
          <Gauge value={data.current_value} />
          <span className="text-lg font-bold mt-1" style={{ color }}>
            {getLabel(data.current_classification)}
          </span>
        </div>
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} interval={5} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
              <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "공포", fill: "#ef4444", fontSize: 9 }} />
              <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "탐욕", fill: "#22c55e", fontSize: 9 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
                formatter={(v) => [v, "지수"]}
              />
              <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
