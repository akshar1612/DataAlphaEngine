"""
Backtest engine — dollar-neutral long/short equity strategy.

Algorithm (weekly rebalance):
  1. Rank all tickers by composite signal (cross-sectionally).
  2. Long top-N, short bottom-N with equal weight within each leg.
  3. Compute gross P&L = sum(weight_i * return_i).
  4. Deduct transaction cost = tc_rate * sum(|Δweight_i|).
  5. Compound returns into an equity curve.

Performance metrics returned:
  total_return, annual_return, sharpe, max_drawdown, calmar,
  hit_rate, avg_ic, avg_turnover, alpha_vs_benchmark, beta_vs_benchmark
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.stats import linregress, spearmanr

logger = logging.getLogger(__name__)


# ── Pydantic model for backtest config ────────────────────────────────────────

from pydantic import BaseModel, Field


class BacktestConfig(BaseModel):
    start: str = "2022-01-01"
    end: str = "2024-12-31"
    signal_weights: Dict[str, float] = {
        "job_signal": 0.30,
        "web_signal": 0.30,
        "ship_signal": 0.20,
        "sat_signal": 0.20,
    }
    long_n: int = Field(5, ge=1, le=10)
    short_n: int = Field(5, ge=1, le=10)
    transaction_cost: float = Field(0.001, ge=0.0, le=0.02)


# ── Core engine ────────────────────────────────────────────────────────────────

def run_backtest(
    signal: pd.DataFrame,
    returns: pd.DataFrame,
    config: BacktestConfig,
    benchmark_returns: Optional[pd.Series] = None,
) -> Dict[str, Any]:
    """
    Run the long-short backtest and return a fully-populated results dict
    suitable for JSON serialisation.
    """
    # Align signal and returns on common dates/tickers
    common_dates = signal.index.intersection(returns.index)
    common_tickers = signal.columns.intersection(returns.columns).tolist()

    sig = signal.loc[common_dates, common_tickers]
    ret = returns.loc[common_dates, common_tickers]

    n_dates = len(common_dates)
    long_n = min(config.long_n, len(common_tickers) // 2)
    short_n = min(config.short_n, len(common_tickers) // 2)

    prev_weights = pd.Series(0.0, index=common_tickers)
    pnl: List[float] = []
    turnover: List[float] = []
    weight_records: List[dict] = []

    for i, date in enumerate(common_dates):
        row_sig = sig.loc[date]
        valid = row_sig.dropna()
        if len(valid) < long_n + short_n:
            pnl.append(0.0)
            turnover.append(0.0)
            continue

        ranked = valid.rank(ascending=False)
        longs = ranked[ranked <= long_n].index.tolist()
        shorts = ranked[ranked > len(valid) - short_n].index.tolist()

        weights = pd.Series(0.0, index=common_tickers)
        weights[longs] = 1.0 / long_n
        weights[shorts] = -1.0 / short_n

        # Transaction cost on turnover
        delta = (weights - prev_weights).abs().sum()
        tc = config.transaction_cost * delta

        # Gross return this period
        period_ret = (weights * ret.loc[date]).sum()
        net_ret = period_ret - tc

        pnl.append(float(net_ret))
        turnover.append(float(delta))
        prev_weights = weights.copy()

        # Record latest positions (last date only for brevity)
        if i == n_dates - 1:
            for t in longs:
                weight_records.append({
                    "ticker": t, "weight": round(1.0 / long_n, 4),
                    "signal": round(float(row_sig[t]), 3), "side": "LONG",
                })
            for t in shorts:
                weight_records.append({
                    "ticker": t, "weight": round(-1.0 / short_n, 4),
                    "signal": round(float(row_sig[t]), 3), "side": "SHORT",
                })

    pnl_s = pd.Series(pnl, index=common_dates)
    equity = (1 + pnl_s).cumprod()

    # ── Benchmark equity curve ─────────────────────────────────────────────────
    if benchmark_returns is not None and not benchmark_returns.empty:
        bmark = benchmark_returns.reindex(common_dates).fillna(0)
    else:
        bmark = pd.Series(0.0, index=common_dates)
    bench_equity = (1 + bmark).cumprod()

    # ── Performance metrics ────────────────────────────────────────────────────
    weeks_per_year = 52.0
    total_return = float(equity.iloc[-1] - 1)
    n_years = len(pnl_s) / weeks_per_year
    annual_return = float((1 + total_return) ** (1 / max(n_years, 0.1)) - 1)

    pnl_arr = pnl_s.values
    excess = pnl_arr - bmark.values
    sharpe = (
        float(np.mean(excess) / np.std(excess) * np.sqrt(weeks_per_year))
        if np.std(excess) > 0 else 0.0
    )

    running_max = equity.cummax()
    drawdown = (equity / running_max) - 1
    max_dd = float(drawdown.min())
    calmar = float(annual_return / abs(max_dd)) if max_dd != 0 else 0.0

    hit_rate = float((pnl_arr > 0).mean())
    avg_turnover = float(np.mean(turnover))

    # Alpha / Beta vs benchmark
    if bmark.std() > 0:
        slope, intercept, *_ = linregress(bmark.values, pnl_arr)
        beta = float(slope)
        alpha = float(intercept * weeks_per_year)
    else:
        beta, alpha = 0.0, annual_return

    # Rolling IC (signal vs 1-week-ahead returns)
    ic_dates, ic_vals = _rolling_ic(sig, ret, window=12)

    # Monthly returns for calendar heatmap
    monthly = _monthly_returns(pnl_s)

    # Equity curve records
    curve = _align_curves(equity, bench_equity)

    return {
        "equity_curve": curve,
        "metrics": {
            "total_return": round(total_return, 4),
            "annual_return": round(annual_return, 4),
            "sharpe_ratio": round(sharpe, 3),
            "max_drawdown": round(max_dd, 4),
            "calmar_ratio": round(calmar, 3),
            "hit_rate": round(hit_rate, 4),
            "alpha": round(alpha, 4),
            "beta": round(beta, 3),
            "avg_turnover": round(avg_turnover, 4),
        },
        "positions": sorted(weight_records, key=lambda x: -abs(x["weight"])),
        "monthly_returns": monthly,
        "rolling_ic": [
            {"date": str(d.date()), "ic": round(v, 4)}
            for d, v in zip(ic_dates, ic_vals)
        ],
        "drawdown": [
            {"date": str(d.date()), "drawdown": round(float(v), 4)}
            for d, v in drawdown.items()
        ],
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def _rolling_ic(
    signal: pd.DataFrame,
    returns: pd.DataFrame,
    window: int = 12,
) -> Tuple[List, List[float]]:
    sig_arr = signal.values
    ret_arr = returns.values
    dates, ics = [], []
    for i in range(window, len(signal)):
        s = sig_arr[i - window : i].flatten()
        r = ret_arr[i - window : i].flatten()
        mask = ~(np.isnan(s) | np.isnan(r))
        if mask.sum() < 5:
            continue
        ic, _ = spearmanr(s[mask], r[mask])
        ics.append(float(ic) if not np.isnan(ic) else 0.0)
        dates.append(signal.index[i])
    return dates, ics


def _monthly_returns(pnl: pd.Series) -> List[dict]:
    monthly = (1 + pnl).resample("ME").prod() - 1
    return [
        {"month": str(d.date())[:7], "return": round(float(v), 4)}
        for d, v in monthly.items()
    ]


def _align_curves(
    strategy: pd.Series,
    benchmark: pd.Series,
) -> List[dict]:
    df = pd.DataFrame({"strategy": strategy, "benchmark": benchmark}).dropna()
    return [
        {
            "date": str(d.date()),
            "strategy": round(float(s), 6),
            "benchmark": round(float(b), 6),
        }
        for d, s, b in zip(df.index, df["strategy"], df["benchmark"])
    ]
