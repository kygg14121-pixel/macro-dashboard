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
  const r = 55;
  const cx = 75;
  const cy = 75;

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
    <svg width={150} height={110} viewBox="0 0 150 110">
      <path
        d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${bgX2} ${bgY2}`}
        fill="none"
        stroke="#374151"
        strokeWidth={11}
        strokeLinecap="round"
      />
      {value > 0 && (
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
        />
      )}
      <line
        x1={cx}
        y1={cy}
        x2={cx + (r - 14) * Math.cos(toRad(angle))}
        y2={cy + (r - 14) * Math.sin(toRad(angle))}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      <text x={cx} y={cy + 20} textAnchor="middle" fill="white" fontSize={20} fontWeight="bold">
        {value}
      </text>
    </svg>
  );
}

function GaugePanel({ label, data, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 flex-1">
        <div className="text-sm font-semibold text-gray-300">{label}</div>
        <div className="text-gray-500 text-sm py-8">로딩 중...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-2 flex-1">
        <div className="text-sm font-semibold text-gray-300">{label}</div>
        <div className="text-center text-red-400 text-xs py-6 px-2 leading-relaxed">
          데이터 로드 실패
          <br />
          <span className="text-gray-500">RAPIDAPI_KEY 환경변수를 설정하면 대체 소스를 사용합니다</span>
        </div>
      </div>
    );
  }

  const color = getColor(data.current_value);
  const historyData = data.history.map((h) => ({
    date: new Date(parseInt(h.timestamp) * 1000).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    }),
    value: h.value,
  }));
  const isSparse = historyData.length <= 6;
  const xInterval = isSparse ? 0 : Math.floor(historyData.length / 5);

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-300">{label}</div>
      <Gauge value={data.current_value} />
      <span className="text-base font-bold" style={{ color }}>
        {getLabel(data.current_classification)}
      </span>
      {data.source && (
        <span className="text-xs text-gray-600">소스: {data.source}</span>
      )}
      <div className="w-full">
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} interval={xInterval} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
              formatter={(v) => [v, "지수"]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={isSparse ? { r: 3, fill: color } : false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VixPanel({ data, loading, error }) {
  if (loading) return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="text-sm font-semibold text-gray-300">VIX 공포지수</div>
      <div className="text-gray-500 text-sm py-8">로딩 중...</div>
    </div>
  );
  if (error || !data?.current) return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="text-sm font-semibold text-gray-300">VIX 공포지수</div>
      <div className="text-red-400 text-xs py-6">데이터 로드 실패</div>
    </div>
  );

  const levelColors = {
    extreme_fear: "#ef4444",
    fear: "#f97316",
    normal: "#22c55e",
    greed: "#a78bfa",
  };
  const color = levelColors[data.level_color] || "#9ca3af";
  const historyData = data.history.map((h) => ({ date: h.date, value: h.value }));

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-300">VIX 공포지수</div>
      <div className="flex flex-col items-center mt-2 mb-1">
        <span className="text-4xl font-bold text-white">{data.current.toFixed(2)}</span>
        <span className="text-sm font-semibold mt-1" style={{ color }}>{data.level}</span>
      </div>
      <div className="text-xs text-gray-500 mb-1">
        &lt;12 과열 · 12~20 정상 · 20~30 불안 · &gt;30 극단적 공포
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
            <ReferenceLine y={20} stroke="#f97316" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
              formatter={(v) => [v.toFixed(2), "VIX"]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function FearGreed() {
  const [cryptoData, setCryptoData] = useState(null);
  const [cnnData, setCnnData] = useState(null);
  const [cryptoLoading, setCryptoLoading] = useState(true);
  const [cnnLoading, setCnnLoading] = useState(true);
  const [cryptoError, setCryptoError] = useState(null);
  const [cnnError, setCnnError] = useState(null);
  const [vixData, setVixData] = useState(null);
  const [vixLoading, setVixLoading] = useState(true);
  const [vixError, setVixError] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/api/fear-greed`)
      .then((res) => setCryptoData(res.data))
      .catch(() => setCryptoError("데이터 로드 실패"))
      .finally(() => setCryptoLoading(false));

    axios
      .get(`${API}/api/cnn-fear-greed`)
      .then((res) => setCnnData(res.data))
      .catch(() => setCnnError("데이터 로드 실패"))
      .finally(() => setCnnLoading(false));

    axios.get(`${API}/api/vix`)
      .then((res) => setVixData(res.data))
      .catch(() => setVixError("데이터 로드 실패"))
      .finally(() => setVixLoading(false));
  }, []);

  return (
    <div className="card">
      <div className="card-title">공포탐욕지수</div>
      <div className="flex flex-col sm:flex-row gap-6">
        <GaugePanel
          label="CNN 주식 공포탐욕지수"
          data={cnnData}
          loading={cnnLoading}
          error={cnnError}
        />
        <div className="hidden sm:block w-px bg-gray-700 self-stretch" />
        <GaugePanel
          label="암호화폐 공포탐욕지수"
          data={cryptoData}
          loading={cryptoLoading}
          error={cryptoError}
        />
        <div className="hidden sm:block w-px bg-gray-700 self-stretch" />
        <VixPanel data={vixData} loading={vixLoading} error={vixError} />
      </div>
    </div>
  );
}
