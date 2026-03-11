# InvestmentApp - Multi-AI Portfolio Analyzer

**マルチAI投資分析ツール** / Multi-AI portfolio analyzer using Claude, GPT, Gemini, Grok, and Perplexity

---

## Overview / 概要

5つのAIエンジン（Claude, GPT, Gemini, Grok, Perplexity）を同時に活用し、テクニカル分析・ファンダメンタル分析・マクロ経済分析を統合的に行う投資分析ダッシュボードです。各AIの判断を比較し、コンセンサスシグナルを生成することで、より信頼性の高い投資判断をサポートします。

A comprehensive investment analysis dashboard that leverages five AI engines simultaneously. It compares signals across models to generate consensus-based investment insights with technical, fundamental, and macroeconomic analysis.

## Features / 機能

- **Stock Scanner** -- RSI, MACD, Bollinger Bands による銘柄スクリーニング（日本株 + 米国株）
- **Multi-AI Analysis** -- Claude / GPT / Gemini / Grok / Perplexity の5エンジン同時分析とコンセンサスシグナル
- **Global Market Dashboard** -- 世界主要株価指数のリアルタイムモニタリング
- **News Analysis** -- AI によるニュースインパクト分析（NewsAPI 連携）
- **Economic Indicators** -- FRED API 経済指標データの可視化と AI 解説
- **Macro Analysis** -- 景気サイクル判定、イールドカーブ分析、セクターローテーション提案
- **AI Advisor** -- 対話型 AI 投資アドバイザー（チャット形式）
- **Portfolio Management** -- ポートフォリオ管理、CSV インポート、SBI 証券/マネーフォワード連携
- **Earnings Tone Analysis** -- 決算発表のトーン分析
- **Fed Tone Analysis** -- FOMC 発言のトーン分析
- **Daily Strategy / Morning Brief** -- 毎日の投資戦略と朝のマーケットブリーフ
- **Study & Backtesting** -- 投資手法の学習と分析

## Tech Stack / 技術スタック

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| AI (Anthropic) | Claude Opus 4.6 / Sonnet 4.6 |
| AI (OpenAI) | GPT-5 / GPT-4.1 |
| AI (Google) | Gemini 2.5 Pro / Flash |
| AI (xAI) | Grok 3 |
| AI (Perplexity) | Sonar Pro |
| Market Data | Yahoo Finance (scraping) |
| News | NewsAPI |
| Economics | FRED API |
| Browser Automation | Playwright (for SBI/MoneyForward) |

## Getting Started / セットアップ

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/koach08/investment-app.git
cd investment-app
npm install
```

### Environment Variables

Copy the example file and add your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual API keys:

```env
# Required
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here

# Optional (enables additional AI engines)
GROK_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here

# Optional (enables news and economic data)
NEWS_API_KEY=your_key_here
FRED_API_KEY=your_key_here

# Optional (enables brokerage integration)
SBI_USER_ID=your_id_here
SBI_PASSWORD=your_password_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Project Structure

```
app/
  page.tsx              # Stock scanner (home)
  detail/               # Detailed stock analysis
  global/               # Global market indices
  news/                 # News feed & AI analysis
  calendar/             # Economic indicators (FRED)
  macro/                # Macro analysis
  advisor/              # AI chat advisor
  assets/               # Asset management
  portfolio/            # Portfolio management
  study/                # Study & backtesting
  settings/             # App settings
  api/                  # API routes (24 endpoints)
components/             # Shared UI components
lib/
  ai-engines.ts         # Multi-AI engine orchestration
  model-config.ts       # AI model tier configuration
  indicators.ts         # Technical indicator calculations
  types.ts              # TypeScript type definitions
```

## AI Model Tiers

The app uses a three-tier model strategy based on task importance:

| Tier | Use Case | Example Models |
|------|----------|---------------|
| LIGHT | Summaries, formatting | Sonnet 4.6, GPT-4.1 Mini, Gemini Flash |
| STANDARD | Stock analysis, news analysis | Sonnet 4.6, GPT-4.1, Gemini Pro |
| HEAVY | Portfolio strategy, margin trading | Opus 4.6, GPT-5, Gemini Pro |

## Screenshots

*Coming soon*

## License

MIT
