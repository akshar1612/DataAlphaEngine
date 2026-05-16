"""
Alt data simulation engine.

Generates synthetic alternative data with controlled correlation to forward equity returns.
Each stream mimics real-world alt data characteristics:
  - Job Postings : monthly cadence, 2-week publication lag, IC ≈ 0.065
  - Web Traffic  : weekly cadence, 1-week lag, IC ≈ 0.075
  - Shipping     : weekly cadence, 1-week lag, IC ≈ 0.055
  - Satellite    : weekly cadence, same-week, IC ≈ 0.045
  - Composite    : IC ≈ 0.09
"""
import logging
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import yfinance as yf

from config import settings

logger = logging.getLogger(__name__)

# In-memory caches (populated on first request, reused after)
_equity_cache: Dict[str, pd.DataFrame] = {}
_alt_data_cache: Dict[str, Dict] = {}


# ── Equity returns ─────────────────────────────────────────────────────────────

def get_equity_returns(
    tickers: Optional[List[str]] = None,
    start: str = settings.DEFAULT_START,
    end: str = settings.DEFAULT_END,
) -> pd.DataFrame:
    """Weekly close-to-close returns, downloaded via yfinance with synthetic fallback."""
    tickers = tickers or settings.UNIVERSE
    key = f"{','.join(sorted(tickers))}|{start}|{end}"
    if key in _equity_cache:
        return _equity_cache[key]

    try:
        raw = yf.download(
            tickers, start=start, end=end,
            interval="1wk", progress=False, auto_adjust=True,
        )
        prices = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        prices = prices[tickers].copy()
        returns = prices.pct_change().dropna()
        returns.index = pd.DatetimeIndex(returns.index).tz_localize(None)
        if returns.empty or len(returns) < 20:
            raise ValueError("Insufficient data from yfinance")
        logger.info("Downloaded %d weeks of equity data via yfinance", len(returns))
    except Exception as exc:
        logger.warning("yfinance failed (%s); generating synthetic returns", exc)
        dates = pd.date_range(start, end, freq="W-FRI")
        rng = np.random.default_rng(42)
        # Correlated returns via a 2-factor model
        market = rng.normal(0.0025, 0.020, len(dates))
        idio = rng.normal(0.0, 0.018, (len(dates), len(tickers)))
        betas = rng.uniform(0.6, 1.4, len(tickers))
        mat = np.outer(market, betas) + idio
        returns = pd.DataFrame(mat, index=dates, columns=tickers)

    _equity_cache[key] = returns
    return returns


# ── Alt data simulation ────────────────────────────────────────────────────────

def _cross_section_normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Subtract row mean, divide by row std (cross-sectional z-score)."""
    mu = df.mean(axis=1)
    sigma = df.std(axis=1).replace(0, np.nan).fillna(1)
    return df.subtract(mu, axis=0).divide(sigma, axis=0)


def generate_alt_data(
    returns: pd.DataFrame,
    seed: int = 42,
) -> Dict[str, pd.DataFrame]:
    """
    Build four alt data streams plus their normalised signal counterparts.

    Returns a dict keyed by:
      job_postings / web_traffic / shipping / satellite  — realistic units for display
      job_signal   / web_signal  / ship_signal / sat_signal — raw z-score signals
    """
    key = f"{id(returns)}|{seed}"
    if key in _alt_data_cache:
        return _alt_data_cache[key]

    rng = np.random.default_rng(seed)
    tickers = returns.columns.tolist()
    dates = returns.index
    n, k = len(dates), len(tickers)

    # Cross-sectionally normalised forward returns (what we want to predict)
    fwd = returns.shift(-1).fillna(0)
    fwd_cs = _cross_section_normalize(fwd)

    def _signal(alpha: float, lag: int, noise_scale: float) -> pd.DataFrame:
        """
        signal = alpha * fwd_cs + beta * N(0,1) + noise_scale * N(0,1)
        where beta = sqrt(1 - alpha² - noise_scale²), clamped to [0,1].
        """
        beta = float(np.clip(np.sqrt(max(0.0, 1 - alpha**2 - noise_scale**2)), 0, 1))
        sig = (
            alpha * fwd_cs
            + beta * pd.DataFrame(rng.standard_normal((n, k)), index=dates, columns=tickers)
            + noise_scale * pd.DataFrame(rng.standard_normal((n, k)), index=dates, columns=tickers)
        )
        if lag:
            sig = sig.shift(lag)
        return sig.clip(-4, 4)

    job_raw = _signal(alpha=0.11, lag=2, noise_scale=0.20)
    web_raw = _signal(alpha=0.13, lag=1, noise_scale=0.18)
    ship_raw = _signal(alpha=0.09, lag=1, noise_scale=0.22)
    sat_raw = _signal(alpha=0.08, lag=0, noise_scale=0.24)

    def _scale(df: pd.DataFrame, lo: float, hi: float, decimals: int = 0) -> pd.DataFrame:
        mn, mx = df.min().min(), df.max().max()
        scaled = (df - mn) / (mx - mn + 1e-9) * (hi - lo) + lo
        return scaled.round(decimals)

    def _to_int(df: pd.DataFrame) -> pd.DataFrame:
        return df.bfill().fillna(0).round(0).astype(int)

    result = {
        # display-ready units
        "job_postings": _to_int(_scale(job_raw, 50, 600)),
        "web_traffic":  _to_int(_scale(web_raw, 50_000, 2_000_000).round(-3)),
        "shipping":     _to_int(_scale(ship_raw, 200, 5_000)),
        "satellite":    _scale(sat_raw, 15, 85, decimals=1).bfill().fillna(0),
        # z-score signals for strategy construction
        "job_signal":   job_raw,
        "web_signal":   web_raw,
        "ship_signal":  ship_raw,
        "sat_signal":   sat_raw,
    }

    _alt_data_cache[key] = result
    return result


# ── Utility helpers used by the API layer ──────────────────────────────────────

def to_records(
    df: pd.DataFrame,
    value_name: str,
) -> List[dict]:
    """Melt a tickers×dates DataFrame to a list of {date, ticker, value} dicts."""
    melted = df.reset_index().melt(id_vars=df.index.name or "index", value_name=value_name)
    melted.columns = ["date", "ticker", value_name]
    melted["date"] = melted["date"].astype(str)
    return melted.dropna().to_dict(orient="records")
