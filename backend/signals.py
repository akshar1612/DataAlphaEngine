"""
Signal extraction layer.

Uses sentence-transformers to embed synthetic job-posting descriptions and
score them against bullish/bearish hiring templates — the actual NLP alpha signal.
All four alt-data streams are then z-scored, winsorised, and combined into a
weighted composite signal used by the backtest engine.
"""
import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

logger = logging.getLogger(__name__)

# ── Embedding model (lazy-loaded once) ────────────────────────────────────────

_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("sentence-transformers model loaded (all-MiniLM-L6-v2)")
        except Exception as exc:
            logger.warning("sentence-transformers unavailable (%s); using fallback scoring", exc)
            _model = "fallback"
    return _model


# ── Hiring-intent templates ────────────────────────────────────────────────────

_BULLISH_TEMPLATE = (
    "aggressive hiring expansion record revenue growth profitable scaling "
    "headcount surge new market launch strong demand momentum investment"
)
_BEARISH_TEMPLATE = (
    "layoffs downsizing cost cutting restructuring hiring freeze headcount reduction "
    "revenue decline margin compression write-down impairment losses"
)

_JOB_BLURBS: Dict[str, List[str]] = {
    "aggressive": [
        "We're on a hiring spree — 300+ open roles across engineering, sales, and ops. "
        "Record Q3 revenue and 90% YoY growth means we need top talent now.",
        "Explosive demand for our AI platform. Join the fastest-growing SaaS company "
        "of 2024. Tripling headcount this year as we expand into five new markets.",
        "We've just closed a $1B Series D. Immediate openings in every function. "
        "This is the rocket ship moment — come build the future with us.",
    ],
    "steady": [
        "Software engineer role on our cloud infrastructure team. "
        "Solid company, good benefits, predictable work-life balance.",
        "Product manager for our payments division. "
        "Established product, clear roadmap, experienced team.",
        "Experienced analyst wanted for our data platform. "
        "Stable environment, growing team, opportunity to make an impact.",
    ],
    "contracting": [
        "Following strategic realignment we have limited openings in "
        "select high-priority areas only. Headcount managed carefully.",
        "Due to market conditions we are pausing hiring in most divisions. "
        "Only business-critical roles will be filled this quarter.",
        "As part of our efficiency programme we are reducing headcount "
        "by 12% and have frozen non-essential hiring across the organisation.",
    ],
}

# Pre-compute embedding-based scores once the model is available
_emb_scores: Optional[Dict[str, float]] = None


def _compute_embedding_scores() -> Dict[str, float]:
    global _emb_scores
    if _emb_scores is not None:
        return _emb_scores

    model = _get_model()
    if model == "fallback":
        _emb_scores = {"aggressive": 1.0, "steady": 0.0, "contracting": -1.0}
        return _emb_scores

    from sklearn.metrics.pairwise import cosine_similarity as cos_sim

    bull_emb = model.encode([_BULLISH_TEMPLATE])
    bear_emb = model.encode([_BEARISH_TEMPLATE])

    scores = {}
    for category, blurbs in _JOB_BLURBS.items():
        embs = model.encode(blurbs)
        bull = cos_sim(embs, bull_emb).mean()
        bear = cos_sim(embs, bear_emb).mean()
        scores[category] = float(bull - bear)

    # Normalise to [-1, +1]
    lo, hi = min(scores.values()), max(scores.values())
    span = hi - lo + 1e-9
    _emb_scores = {k: 2 * (v - lo) / span - 1 for k, v in scores.items()}
    logger.info("Embedding scores computed: %s", _emb_scores)
    return _emb_scores


def get_embedding_scores() -> Dict[str, float]:
    """Return the NLP-derived hiring intent scores (aggressive / steady / contracting)."""
    return _compute_embedding_scores()


# ── Signal normalisation helpers ───────────────────────────────────────────────

def zscore(df: pd.DataFrame, window: Optional[int] = None) -> pd.DataFrame:
    """Cross-sectional z-score; optionally rolling if window is given."""
    if window:
        mu = df.rolling(window).mean()
        sd = df.rolling(window).std().replace(0, np.nan).fillna(1)
    else:
        mu = df.mean(axis=1)
        sd = df.std(axis=1).replace(0, np.nan).fillna(1)
        return df.subtract(mu, axis=0).divide(sd, axis=0).clip(-3, 3)
    return df.subtract(mu).divide(sd).clip(-3, 3)


# ── Composite signal construction ──────────────────────────────────────────────

DEFAULT_WEIGHTS = {
    "job_signal": 0.30,
    "web_signal": 0.30,
    "ship_signal": 0.20,
    "sat_signal":  0.20,
}


def compute_composite_signal(
    alt_signals: Dict[str, pd.DataFrame],
    weights: Optional[Dict[str, float]] = None,
) -> pd.DataFrame:
    """
    Weighted combination of the four alt-data z-score signals.

    Each signal is cross-sectionally z-scored and winsorised before combination.
    The output is a tickers×dates DataFrame of composite signal z-scores.
    """
    w = weights or DEFAULT_WEIGHTS
    available = {k: v for k, v in alt_signals.items() if k in w}
    if not available:
        raise ValueError("No recognised signal keys found in alt_signals dict")

    # Normalise each stream
    normed = {k: zscore(df) for k, df in available.items()}

    # Align on common dates
    common_idx = normed[list(normed.keys())[0]].index
    for df in normed.values():
        common_idx = common_idx.intersection(df.index)

    composite = sum(w[k] * normed[k].loc[common_idx] for k in normed)
    # Final cross-sectional normalisation
    composite = zscore(composite)
    return composite.dropna(how="all")


# ── Rolling Information Coefficient ───────────────────────────────────────────

def rolling_ic(
    signal: pd.DataFrame,
    returns: pd.DataFrame,
    window: int = 12,
) -> Tuple[pd.DatetimeIndex, List[float]]:
    """
    Spearman rank correlation between signal and 1-week-ahead returns,
    computed in a rolling window across dates.

    Returns (dates, ic_values).
    """
    common = signal.index.intersection(returns.index)
    sig = signal.loc[common].values
    ret = returns.loc[common].values

    ics: List[float] = []
    dates: List = []
    for i in range(window, len(common)):
        s_win = sig[i - window : i].flatten()
        r_win = ret[i - window : i].flatten()
        mask = ~(np.isnan(s_win) | np.isnan(r_win))
        if mask.sum() < 5:
            continue
        ic, _ = spearmanr(s_win[mask], r_win[mask])
        ics.append(float(ic) if not np.isnan(ic) else 0.0)
        dates.append(common[i])

    return pd.DatetimeIndex(dates), ics
