# 🇺🇸 미국 거시경제 대시보드

FRED, Alpha Vantage, Alternative.me, NewsAPI, Claude AI를 활용한 실시간 거시경제 대시보드입니다.

---

## 기능

| 기능 | API | 설명 |
|------|-----|------|
| CPI / 실업률 / 10년물 금리 | FRED | 월별/일별 시계열 차트 |
| DXY / WTI / Gold / Silver / Copper | Alpha Vantage | 현재가 + 미니 차트 |
| 공포탐욕지수 | Alternative.me | 게이지 + 30일 추이 |
| 경제 뉴스 한국어 요약 | NewsAPI + Claude | AI 요약 + 거시경제 영향 분석 |
| S&P 500 히트맵 | Finviz | 섹터별 등락률 |

---

## API 키 발급 방법

### 1. FRED API Key (무료)
1. [https://fred.stlouisfed.org/](https://fred.stlouisfed.org/) 접속
2. 우상단 **My Account** → **API Keys** → **Request API Key**
3. 이메일 주소 입력 후 즉시 발급 (무료, 제한 없음)

### 2. Alpha Vantage API Key (무료)
1. [https://www.alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) 접속
2. 이메일 입력 → 즉시 키 발급 (무료: 25 req/day, 프리미엄 $50/월)
3. WTI/Gold/Silver/Copper는 무료 플랜으로 사용 가능

### 3. NewsAPI Key (무료)
1. [https://newsapi.org/register](https://newsapi.org/register) 접속
2. 이메일/비밀번호 입력 후 가입 → 즉시 키 발급
3. 무료 플랜: 100 req/day, 1달 전까지 기사

### 4. Anthropic Claude API Key
1. [https://console.anthropic.com/](https://console.anthropic.com/) 접속
2. 회원가입 후 **API Keys** → **Create Key**
3. 최초 $5 크레딧 제공 (claude-haiku 기준 수백만 토큰)

---

## 로컬 실행

### 사전 요구사항
- Python 3.11+
- Node.js 18+

### 1. 백엔드 설정

```bash
cd backend

# 가상환경 생성 (Windows)
python -m venv venv
venv\Scripts\activate

# 패키지 설치
pip install -r requirements.txt

# .env 파일 생성
copy .env.example .env
# .env 파일을 열어 API 키 입력

# 서버 실행
uvicorn main:app --reload --port 8000
```

백엔드가 실행되면 http://localhost:8000/docs 에서 API 문서 확인 가능

### 2. 프론트엔드 설정

```bash
cd frontend

# .env 파일 생성
copy .env.example .env
# 로컬 개발 시 REACT_APP_API_URL=http://localhost:8000 그대로 사용

# 패키지 설치
npm install

# 개발 서버 실행
npm start
```

http://localhost:3000 에서 대시보드 확인

---

## 배포

### 백엔드 → Railway

1. [https://railway.app](https://railway.app) 가입 후 **New Project** → **Deploy from GitHub**
2. `backend` 폴더를 루트로 설정하거나 GitHub 레포 연결
3. **Variables** 탭에서 환경 변수 추가:
   ```
   FRED_API_KEY=xxxxx
   ALPHA_VANTAGE_API_KEY=xxxxx
   NEWS_API_KEY=xxxxx
   ANTHROPIC_API_KEY=xxxxx
   ```
4. 자동 배포 완료 후 **Domain** 복사 (예: `https://macro-api.up.railway.app`)

### 프론트엔드 → Vercel

1. [https://vercel.com](https://vercel.com) 가입 후 **Add New Project** → GitHub 연결
2. `frontend` 폴더를 루트 디렉토리로 설정
3. **Environment Variables**에 추가:
   ```
   VITE_API_URL=https://macro-api.up.railway.app
   ```
4. **Deploy** 클릭 → 완료

---

## 프로젝트 구조

```
macro-dashboard/
├── backend/
│   ├── main.py          # FastAPI 서버 (모든 API 엔드포인트)
│   ├── requirements.txt
│   ├── railway.json     # Railway 배포 설정
│   ├── Procfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── FredChart.jsx      # FRED 지표 차트
│   │       ├── MarketData.jsx     # Alpha Vantage 시장 데이터
│   │       ├── FearGreed.jsx      # 공포탐욕지수
│   │       ├── NewsSection.jsx    # 뉴스 + AI 요약
│   │       └── FinvizHeatmap.jsx  # Finviz 히트맵
│   ├── vercel.json
│   └── package.json
└── README.md
```

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/fred/{series_id}` | FRED 시계열 데이터 |
| GET | `/api/market` | Alpha Vantage 시장 데이터 |
| GET | `/api/fear-greed` | 공포탐욕지수 |
| GET | `/api/news` | 뉴스 + Claude 한국어 요약 |

**FRED series_id 예시:**
- `CPIAUCSL` - CPI 소비자물가지수
- `UNRATE` - 실업률
- `DGS10` - 10년물 국채금리
