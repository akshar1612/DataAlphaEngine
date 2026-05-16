"""
All API routes for the Alpha Engine.

Endpoints:
  GET  /api/universe            – ticker metadata
  GET  /api/alt-data            – raw simulated alt data
  GET  /api/signals             – normalised signals + rolling IC
  POST /api/backtest            – run a full backtest
  GET  /api/embedding-scores    – NLP hiring-intent scores (debug / demo)
"""
import logging
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from backtest import BacktestConfig, run_backtest
from config import settings
from data import generate_alt_data, get_equity_returns
from signals import (
    compute_composite_signal,
    get_embedding_scores,
    rolling_ic,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── /universe ─────────────────────────────────────────────────────────────────

@router.get("/universe")
def universe():
    return [
        {"symbol": t, "sector": settings.SECTOR_MAP.get(t, "Unknown")}
        for t in settings.UNIVERSE
    ]


# ── /alt-data ──────────────────────────────────────────────────────────────────

@router.get("/alt-data")
def alt_data(
    start: str = Query(settings.DEFAULT_START),
    end: str = Query(settings.DEFAULT_END),
    ticker: Optional[str] = Query(None),
):
    """
    Returns the four alt data streams for all tickers (or one ticker) over the
    given date range.  Shape: { dates, tickers, job_postings, web_traffic,
    shipping, satellite } where each data field is a dict of
    ticker → list[value].
    """
    try:
        returns = get_equity_returns(start=start, end=end)
        alt = generate_alt_data(returns)
    except Exception as exc:
        logger.exception("alt-data error")
        raise HTTPException(500, str(exc))

    tickers = [ticker] if ticker else settings.UNIVERSE
    dates = [str(d.date()) for d in returns.index.tolist()]

    def _to_dict(df: pd.DataFrame) -> dict:
        return {t: df[t].fillna(0).tolist() for t in tickers if t in df.columns}

    return {
        "dates": dates,
        "tickers": tickers,
        "job_postings": _to_dict(alt["job_postings"]),
        "web_traffic":  _to_dict(alt["web_traffic"]),
        "shipping":     _to_dict(alt["shipping"]),
        "satellite":    _to_dict(alt["satellite"]),
    }


# ── /signals ───────────────────────────────────────────────────────────────────

@router.get("/signals")
def signals(
    start: str = Query(settings.DEFAULT_START),
    end: str = Query(settings.DEFAULT_END),
    job_w: float = Query(0.30),
    web_w: float = Query(0.30),
    ship_w: float = Query(0.20),
    sat_w: float = Query(0.20),
):
    """
    Returns per-ticker signal z-scores for all four alt data streams plus the
    weighted composite, along with rolling Spearman IC.
    """
    try:
        returns = get_equity_returns(start=start, end=end)
        alt = generate_alt_data(returns)
    except Exception as exc:
        logger.exception("signals error")
        raise HTTPException(500, str(exc))

    weights = {
        "job_signal": job_w,
        "web_signal": web_w,
        "ship_signal": ship_w,
        "sat_signal":  sat_w,
    }
    composite = compute_composite_signal(alt, weights)

    # Align all signal DataFrames to composite index
    idx = composite.index
    tickers = settings.UNIVERSE

    def _safe(df: pd.DataFrame) -> dict:
        return {
            t: [round(float(v), 4) if not np.isnan(v) else None
                for v in df.reindex(idx)[t].fillna(np.nan).tolist()]
            for t in tickers if t in df.columns
        }

    ic_dates, ic_vals = rolling_ic(composite, returns.reindex(idx), window=12)

    return {
        "dates": [str(d.date()) for d in idx],
        "tickers": tickers,
        "signals": {
            "job":       _safe(alt["job_signal"]),
            "web":       _safe(alt["web_signal"]),
            "shipping":  _safe(alt["ship_signal"]),
            "satellite": _safe(alt["sat_signal"]),
            "composite": _safe(composite),
        },
        "rolling_ic": [
            {"date": str(d.date()), "ic": round(v, 4)}
            for d, v in zip(ic_dates, ic_vals)
        ],
        # Latest snapshot for heatmap
        "latest": {
            t: {
                "job":       round(float(alt["job_signal"].iloc[-1][t]), 3) if t in alt["job_signal"].columns else 0.0,
                "web":       round(float(alt["web_signal"].iloc[-1][t]), 3) if t in alt["web_signal"].columns else 0.0,
                "shipping":  round(float(alt["ship_signal"].iloc[-1][t]), 3) if t in alt["ship_signal"].columns else 0.0,
                "satellite": round(float(alt["sat_signal"].iloc[-1][t]), 3) if t in alt["sat_signal"].columns else 0.0,
                "composite": round(float(composite.iloc[-1][t]), 3) if t in composite.columns else 0.0,
            }
            for t in tickers
        },
    }


# ── /backtest ──────────────────────────────────────────────────────────────────

@router.post("/backtest")
def backtest(cfg: BacktestConfig):
    """Run a long-short equity backtest and return full results."""
    try:
        returns = get_equity_returns(start=cfg.start, end=cfg.end)
        alt = generate_alt_data(returns)
        composite = compute_composite_signal(alt, cfg.signal_weights)

        # SPY benchmark
        bench_raw = get_equity_returns(tickers=["SPY"], start=cfg.start, end=cfg.end)
        benchmark = bench_raw["SPY"] if "SPY" in bench_raw.columns else None

        results = run_backtest(composite, returns, cfg, benchmark_returns=benchmark)
        return results

    except Exception as exc:
        logger.exception("backtest error")
        raise HTTPException(500, str(exc))


# ── /embedding-scores ─────────────────────────────────────────────────────────

@router.get("/embedding-scores")
def embedding_scores():
    """
    Returns the NLP-derived hiring-intent scores used by the job-postings signal.
    Shows that actual sentence-transformer embeddings power the alpha signal.
    """
    return get_embedding_scores()
