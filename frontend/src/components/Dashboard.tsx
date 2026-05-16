import { useEffect, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react'
import { api } from '../api'
import type { BacktestResults, SignalsResponse } from '../types'

const DEFAULT_CFG = {
  start: '2022-01-01',
  end: '2024-12-31',
  signal_weights: { job_signal: 0.30, web_signal: 0.30, ship_signal: 0.20, sat_signal: 0.20 },
  long_n: 5,
  short_n: 5,
  transaction_cost: 0.001,
}

function fmt(v: number, mode: 'pct' | 'x2' | 'plain' = 'pct') {
  if (mode === 'pct') return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
  if (mode === 'x2') return v.toFixed(2)
  return v.toFixed(3)
}

function MetricCard({
  label, value, sub, positive,
}: { label: string; value: string; sub?: string; positive?: boolean }) {
  const colour = positive === undefined ? 'text-slate-100' : positive ? 'text-success' : 'text-danger'
  return (
    <div className="card flex flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${colour}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

// Signal heatmap cell
function HeatCell({ value }: { value: number }) {
  const clamped = Math.max(-2.5, Math.min(2.5, value))
  const alpha = Math.abs(clamped) / 2.5
  const bg = clamped > 0
    ? `rgba(34,197,94,${0.12 + alpha * 0.4})`
    : `rgba(239,68,68,${0.12 + alpha * 0.4})`
  const text = clamped > 0 ? 'text-green-300' : 'text-red-300'
  return (
    <div
      className={`flex items-center justify-center rounded text-xs font-mono font-semibold ${text}`}
      style={{ background: bg, minWidth: 52, height: 28 }}
    >
      {clamped >= 0 ? '+' : ''}{clamped.toFixed(2)}
    </div>
  )
}

export default function Dashboard() {
  const [results, setResults] = useState<BacktestResults | null>(null)
  const [signals, setSignals] = useState<SignalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.backtest(DEFAULT_CFG), api.signals()])
      .then(([bt, sig]) => {
        setResults(bt)
        setSignals(sig)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted text-sm">Loading market intelligence…</p>
          <p className="text-muted/60 text-xs">Downloading equity data · Computing embeddings</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-danger text-sm">
        Backend error: {error}<br />
        <span className="text-muted">Make sure the FastAPI server is running on port 8000.</span>
      </div>
    )
  }

  const m = results!.metrics
  const latest = signals?.latest ?? {}
  const tickers = Object.keys(latest)

  // Equity curve — convert cumulative return to percentage
  const curve = results!.equity_curve.map(d => ({
    date: d.date,
    Strategy: +((d.strategy - 1) * 100).toFixed(2),
    Benchmark: +((d.benchmark - 1) * 100).toFixed(2),
  }))

  // Top signals bar data
  const signalBars = tickers
    .map(t => ({ ticker: t, score: latest[t].composite }))
    .sort((a, b) => b.score - a.score)

  const SIGNAL_COLS = ['job', 'web', 'shipping', 'satellite', 'composite'] as const

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Long-short strategy · 5L/5S · Weekly rebalance · 10 bps TC
          </p>
        </div>
        <div className="text-xs text-muted font-mono">
          Backtest: {DEFAULT_CFG.start} → {DEFAULT_CFG.end}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Alpha"
          value={fmt(m.total_return)}
          sub={`Ann. ${fmt(m.annual_return)}`}
          positive={m.total_return > 0}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={m.sharpe_ratio.toFixed(2)}
          sub={`Calmar ${m.calmar_ratio.toFixed(2)}`}
          positive={m.sharpe_ratio > 0}
        />
        <MetricCard
          label="Max Drawdown"
          value={fmt(m.max_drawdown)}
          positive={false}
        />
        <MetricCard
          label="Hit Rate"
          value={`${(m.hit_rate * 100).toFixed(1)}%`}
          sub={`IC avg · β ${m.beta.toFixed(2)}`}
          positive={m.hit_rate > 0.5}
        />
      </div>

      {/* Equity curve */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <span className="section-title">Equity Curve — Cumulative Return (%)</span>
          <div className="flex gap-4 text-xs">
            <span className="text-primary font-medium">— Strategy (L/S)</span>
            <span className="text-muted">— SPY Benchmark</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="grad_strat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad_bench" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={d => d.slice(0, 7)} interval={Math.floor(curve.length / 8)} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} width={52} />
            <Tooltip
              formatter={(v: number, name: string) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, name]}
              contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Area type="monotone" dataKey="Strategy" stroke="#6366f1" strokeWidth={2}
              fill="url(#grad_strat)" dot={false} />
            <Area type="monotone" dataKey="Benchmark" stroke="#64748b" strokeWidth={1.5}
              fill="url(#grad_bench)" dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signal strength bar */}
        <div className="card">
          <span className="section-title block mb-4">Composite Signal Scores (Latest)</span>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={signalBars} layout="vertical" margin={{ left: 4, right: 12 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
                tickFormatter={v => v.toFixed(1)} />
              <YAxis type="category" dataKey="ticker" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'monospace' }}
                tickLine={false} width={44} />
              <Tooltip
                formatter={(v: number) => [v.toFixed(3), 'Signal z-score']}
                contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}
                fill="#6366f1"
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Signal heatmap */}
        <div className="card overflow-auto">
          <span className="section-title block mb-4">Signal Heatmap (Latest Week)</span>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-muted font-medium pb-2 pr-3">Ticker</th>
                {SIGNAL_COLS.map(c => (
                  <th key={c} className="text-muted font-medium pb-2 px-1 capitalize text-center whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="space-y-1">
              {tickers.slice(0, 10).map(t => (
                <tr key={t} className="border-t border-border/40">
                  <td className="py-1 pr-3 font-mono font-semibold text-slate-300">{t}</td>
                  {SIGNAL_COLS.map(col => (
                    <td key={col} className="py-1 px-1">
                      <HeatCell value={latest[t]?.[col] ?? 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Positions */}
      <div className="card">
        <span className="section-title block mb-4">Latest Positions</span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {results!.positions.map(p => (
            <div key={p.ticker} className="card-sm flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-slate-100">{p.ticker}</span>
                <span className={p.side === 'LONG' ? 'badge-long' : 'badge-short'}>{p.side}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted">
                {p.side === 'LONG' ? <TrendingUp size={12} className="text-success" /> : <TrendingDown size={12} className="text-danger" />}
                <span className="font-mono">{(p.weight * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs font-mono text-muted">
                Sig: <span className={p.signal >= 0 ? 'text-success' : 'text-danger'}>
                  {p.signal >= 0 ? '+' : ''}{p.signal.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
