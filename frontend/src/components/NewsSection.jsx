import React, { useEffect, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NewsSection() {
  const [articles, setArticles] = useState([]);
  const [summarized, setSummarized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/api/news`)
      .then((res) => {
        setArticles(res.data.articles || []);
        setSummarized(res.data.summarized || false);
      })
      .catch(() => setError("뉴스 로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-3">
        주요 경제 뉴스
        {summarized ? (
          <span className="text-xs text-purple-400 font-normal ml-2">Claude AI 한국어 요약</span>
        ) : (
          <span className="text-xs text-gray-500 font-normal ml-2">NewsAPI</span>
        )}
      </h2>
      {loading && <div className="text-gray-500 text-sm">뉴스를 불러오는 중...</div>}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div className="flex flex-col gap-3">
        {articles.map((article, i) => (
          <a
            key={i}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:border-purple-500 transition-colors cursor-pointer group"
          >
            <div className="flex gap-4">
              {article.urlToImage && (
                <img
                  src={article.urlToImage}
                  alt=""
                  className="w-20 h-16 object-cover rounded-lg flex-shrink-0"
                  onError={(e) => (e.target.style.display = "none")}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-purple-400 font-medium">{article.source}</span>
                  <span className="text-xs text-gray-600">{formatDate(article.publishedAt)}</span>
                </div>
                <p className="text-sm text-gray-300 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
                  {article.title}
                </p>
                {/* Claude 요약이 있으면 요약 표시, 없으면 원문 description 표시 */}
                {article.summary ? (
                  <>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                    {article.impact && (
                      <div className="mt-1.5 flex items-start gap-1">
                        <span className="text-xs text-yellow-500 font-semibold flex-shrink-0">영향:</span>
                        <span className="text-xs text-yellow-400/80">{article.impact}</span>
                      </div>
                    )}
                  </>
                ) : article.description ? (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">
                    {article.description}
                  </p>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
