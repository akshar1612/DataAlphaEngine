# Alternative Data Alpha Engine

A full-stack quantitative research platform that ingests unstructured alternative data, extracts predictive signals using LLM embeddings, and backtests them against real equity returns.

![Stack](https://img.shields.io/badge/Python-3.13-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green) ![React](https://img.shields.io/badge/React-18-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)

---

<img width="1470" height="767" alt="Screenshot 2026-05-16 at 2 41 59 PM" src="https://github.com/user-attachments/assets/552af8b4-451b-4e17-a416-9307b565487b" />

<img width="1467" height="762" alt="Screenshot 2026-05-16 at 2 34 18 PM" src="https://github.com/user-attachments/assets/a5140a85-da3f-4863-8c88-aef962d44ca0" />


## Overview

Traditional quant strategies rely on price, volume, and fundamental data — all widely available and heavily arbitraged. Modern alpha comes from **alternative data**: satellite imagery, job postings, web traffic, shipping manifests. This engine demonstrates the full pipeline from raw alt data ingestion through signal extraction and systematic backtesting.

### What it does

1. **Ingests** four streams of alternative data (job postings, web traffic, shipping, satellite imagery)
2. **Extracts signals** using `sentence-transformers` LLM embeddings to score hiring intent from job posting text
3. **Normalizes** signals cross-sectionally into z-scores, then combines into a weighted composite
4. **Backtests** a dollar-neutral long/short equity strategy against real returns (via yfinance) with transaction costs
5. **Visualizes** the full pipeline — equity curves, signal heatmaps, rolling IC, drawdown, monthly returns — in an interactive React dashboard

---

## Architecture

```
Alpha/
├── backend/
│   ├── main.py           # FastAPI app + CORS
│   ├── config.py         # Universe, sectors, defaults
│   ├── data.py           # Alt data simulation + yfinance equity returns
│   ├── signals.py        # LLM embeddings, z-scoring, composite signal, rolling IC
│   ├── backtest.py       # Long/short engine, performance metrics
│   ├── routers/
│   │   └── api.py        # REST endpoints
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx                      # Sidebar layout + routing
    │   ├── api.ts                       # Axios API client
    │   ├── types.ts                     # TypeScript interfaces
    │   └── components/
    │       ├── Dashboard.tsx            # Metrics, equity curve, heatmap, positions
    │       ├── SignalExplorer.tsx        # Per-signal drill-down, rolling IC, NLP scores
    │       └── Backtester.tsx           # Config sliders, backtest results
    ├── package.json
    └── vite.config.ts     # Proxies /api → localhost:8000
```

---

## Signal Pipeline

### Alternative Data Sources

| Source | Proxy for | Publication Lag | Target IC |
|--------|-----------|-----------------|-----------|
| Job Postings | Revenue growth, expansion plans | 2 weeks | ~0.065 |
| Web Traffic | Consumer demand, brand momentum | 1 week | ~0.075 |
| Shipping / AIS | Supply chain activity | 1 week | ~0.055 |
| Satellite Imagery | Retail footfall (parking occupancy) | Same week | ~0.045 |
| **Composite** | Weighted combination | — | **~0.09** |

### LLM Embedding Signal

Job posting blurbs are embedded using `all-MiniLM-L6-v2` (384-dimensional vectors). The hiring-intent score is computed as:

```
score = cosine_sim(blurb, bullish_template) − cosine_sim(blurb, bearish_template)
```

Where the bullish template captures aggressive hiring language and the bearish template captures restructuring/layoff language. This produces semantically-grounded scores without relying on keyword dictionaries.

### Signal Normalization

All signals are **cross-sectionally z-scored** per date:

```
z_i,t = (signal_i,t − mean_t) / std_t
```

This removes market-wide noise and focuses purely on relative ranking across tickers.

### Composite Signal

```
composite = 0.30 × job_z + 0.30 × web_z + 0.20 × ship_z + 0.20 × sat_z
```

Weights are user-configurable in the Backtester. The composite is winsorized at ±3σ and re-normalized.

---

## Backtest Engine

**Strategy**: Dollar-neutral long/short equity, weekly rebalance

```
Long  → top N tickers by composite signal  (+1/N weight each)
Short → bottom N tickers by composite signal  (−1/N weight each)
Net exposure = 0  (market neutral)
```

**Transaction costs**: Applied on portfolio turnover each period.

**Performance metrics computed**:
- Total / Annualized Return
- Sharpe Ratio (annualized)
- Max Drawdown
- Calmar Ratio
- Hit Rate
- Alpha & Beta vs SPY (OLS regression)
- Rolling 12-week Spearman IC
- Average Turnover

**Benchmark results** (2022–2024, 5L/5S, 10 bps TC):

| Metric | Value |
|--------|-------|
| Sharpe Ratio | ~0.64 |
| Annual Return | ~31% |
| Max Drawdown | ~−11% |
| Alpha vs SPY | ~29% |
| Hit Rate | ~54% |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/universe` | Ticker list with sector metadata |
| `GET` | `/api/alt-data` | Raw alt data for all tickers |
| `GET` | `/api/signals` | Z-scored signals + rolling IC |
| `POST` | `/api/backtest` | Run a full backtest |
| `GET` | `/api/embedding-scores` | NLP hiring-intent scores (debug) |

Interactive docs available at `http://localhost:8000/docs` when the backend is running.

---

## Setup & Running

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The first run will download the `all-MiniLM-L6-v2` sentence-transformer model (~90 MB) and fetch equity data from Yahoo Finance. Subsequent runs use the in-memory cache.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Both at once

```bash
chmod +x start.sh
./start.sh
```

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — REST API
- [sentence-transformers](https://www.sbert.net/) — LLM embeddings (`all-MiniLM-L6-v2`)
- [yfinance](https://github.com/ranaroussi/yfinance) — Real equity data
- [pandas](https://pandas.pydata.org/) / [numpy](https://numpy.org/) — Signal processing
- [scipy](https://scipy.org/) — Spearman IC, OLS regression
- [scikit-learn](https://scikit-learn.org/) — Cosine similarity

**Frontend**
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — Build tooling
- [Recharts](https://recharts.org/) — Interactive charts
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Lucide React](https://lucide.dev/) — Icons
- [Axios](https://axios-http.com/) — HTTP client

---

## Pages

### Dashboard
Overview of the default strategy: key metrics at a glance, equity curve vs SPY, composite signal bar chart ranked by score, signal heatmap (15 tickers × 5 signal types), and current long/short positions.

### Signal Explorer
Drill into any individual signal stream. Toggle between job postings, web traffic, shipping, satellite, or composite. Select up to 8 tickers for time-series overlay. View the rolling 12-week IC chart with the 0.05 significance threshold. Inspect the raw NLP embedding scores that power the hiring-intent signal.

### Backtester
Fully interactive. Adjust signal weights with sliders (with live Σ validation), portfolio size (N long / N short), transaction cost in basis points, and date range. Hit **Run Backtest** to get equity curve, drawdown chart, monthly return calendar, and a complete performance report.
