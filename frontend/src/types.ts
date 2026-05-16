export interface TickerMeta {
  symbol: string
  sector: string
}

export interface AltDataResponse {
  dates: string[]
  tickers: string[]
  job_postings: Record<string, number[]>
  web_traffic: Record<string, number[]>
  shipping: Record<string, number[]>
  satellite: Record<string, number[]>
}

export interface SignalSnapshot {
  job: number
  web: number
  shipping: number
  satellite: number
  composite: number
}

export interface SignalsResponse {
  dates: string[]
  tickers: string[]
  signals: {
    job: Record<string, (number | null)[]>
    web: Record<string, (number | null)[]>
    shipping: Record<string, (number | null)[]>
    satellite: Record<string, (number | null)[]>
    composite: Record<string, (number | null)[]>
  }
  rolling_ic: { date: string; ic: number }[]
  latest: Record<string, SignalSnapshot>
}

export interface BacktestConfig {
  start: string
  end: string
  signal_weights: {
    job_signal: number
    web_signal: number
    ship_signal: number
    sat_signal: number
  }
  long_n: number
  short_n: number
  transaction_cost: number
}

export interface BacktestMetrics {
  total_return: number
  annual_return: number
  sharpe_ratio: number
  max_drawdown: number
  calmar_ratio: number
  hit_rate: number
  alpha: number
  beta: number
  avg_turnover: number
}

export interface Position {
  ticker: string
  weight: number
  signal: number
  side: 'LONG' | 'SHORT'
}

export interface BacktestResults {
  equity_curve: { date: string; strategy: number; benchmark: number }[]
  metrics: BacktestMetrics
  positions: Position[]
  monthly_returns: { month: string; return: number }[]
  rolling_ic: { date: string; ic: number }[]
  drawdown: { date: string; drawdown: number }[]
}
