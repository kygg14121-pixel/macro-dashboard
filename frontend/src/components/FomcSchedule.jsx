import React, { useEffect, useState } from "react";
import axios from "axios";
import API from "../config.js";

function formatDateRange(start, end) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const month = s.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
  return `${month} ${s.getDate()}~${e.getDate()}일`;
}

export default function FomcSchedule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/fomc`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">FOMC 일정</h2>
      <div className="text-gray-500 text-sm">로딩 중...</div>
    </section>
  );

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">FOMC 일정 및 기준금리</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 현재 기준금리 */}
        <div className="card flex flex-col items-center justify-center text-center">
          <div className="card-title mb-2">현재 기준금리 (FFR)</div>
          <div className="text-5xl font-bold text-blue-400 mb-1">
            {data?.current_rate != null ? `${data.current_rate.toFixed(2)}%` : "N/A"}
          </div>
          {data?.rate_date && (
            <div className="text-xs text-gray-500 mt-1">{data.rate_date} 기준</div>
          )}
          <div className="text-xs text-gray-500 mt-2">FRED (목표금리 하단 기준)</div>
        </div>

        {/* 지난 일정 */}
        <div className="card">
          <div className="card-title mb-3">지난 FOMC</div>
          <div className="space-y-2">
            {data?.past?.slice().reverse().map((m) => (
              <div key={m.date} className="flex items-center justify-between py-1 border-b border-gray-700 last:border-0">
                <span className="text-sm text-gray-300">{formatDateRange(m.date, m.end_date)}</span>
                <span className="text-xs text-gray-500">{Math.abs(m.days_until)}일 전</span>
              </div>
            ))}
          </div>
        </div>

        {/* 다음 일정 */}
        <div className="card">
          <div className="card-title mb-3">다음 FOMC</div>
          <div className="space-y-2">
            {data?.upcoming?.map((m, i) => (
              <div key={m.date} className={`flex items-center justify-between py-1 border-b border-gray-700 last:border-0 ${i === 0 ? "text-white" : "text-gray-400"}`}>
                <span className={`text-sm ${i === 0 ? "font-semibold text-blue-300" : ""}`}>
                  {formatDateRange(m.date, m.end_date)}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  i === 0
                    ? m.days_until <= 7
                      ? "bg-red-900 text-red-300"
                      : "bg-blue-900 text-blue-300"
                    : "text-gray-500"
                }`}>
                  {i === 0 ? (m.days_until === 0 ? "오늘!" : m.days_until < 0 ? "진행중" : `D-${m.days_until}`) : `D-${m.days_until}`}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
