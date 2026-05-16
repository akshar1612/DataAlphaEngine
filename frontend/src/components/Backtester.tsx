import { useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Play, RotateCcw } from 'lucide-react'
import { api } from '../api'
import type { BacktestConfig, BacktestResults } from '../types'

const DEFAULT: BacktestConfig = {
  start: '2022-01-01',
  end: '2024-12-31',
  signal_weights: { job_signal: 0.30, web_signal: 0.30, ship_signal: 0.20, sat_signal: 0.20 },
  long_n: 5,
  short_n: 5,
  transaction_cost: 0.001,
}

function pct(v: number, dp = 1) {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%`
}

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: 'good' | 'bad' | 'neutral' }) {
  const col = highlight === 'good' ? 'text-success' : highlight === 'bad' ? 'text-danger' : 'text-slate-100'
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono font-semibold ${col}`}>{value}</span>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; fmt: (v: number) => string
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-slate-100">{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full h-1 appearance-none rounded cursor-pointer"
        style={{ accentColor: '#6366f1' }}
      />
    </div>
  )
}

export default function Backtester() {
  const [cfg, setCfg] = useState<BacktestConfig>(DEFAULT)
  const [results, setResults] = useState<BacktestResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setWeight = (k: keyof BacktestConfig['signal_weights'], v: number) => {
    setCfg(prev => ({ ...prev, signal_weights: { ...prev.signal_weights, [k]: v } }))
  }

  async function runBacktest() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.backtest(cfg)
      setResults(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const totalWeight =
    cfg.signal_weights.job_signal +
    cfg.signal_weights.web_signal +
    cfg.signal_weights.ship_signal +
    cfg.signal_weights.sat_signal

  const weightsValid = Math.abs(totalWeight - 1) < 0.01

  // Build equity curve data
  const curve = results?.equity_curve.map(d => ({
    date: d.date,
    Strategy: +((d.strategy - 1) * 100).toFixed(2),
    Benchmark: +((d.benchmark - 1) * 100).toFixed(2),
  })) ?? []

  // Drawdown
  const ddData = results?.drawdown.map(d => ({
    date: d.date,
    Drawdown: +(d.drawdown * 100).toFixed(2),
  })) ?? []

  // Monthly returns
  const monthlyData = results?.monthly_returns.map(d => ({
    month: d.month,
    Return: +(d.return * 100).toFixed(2),
  })) ?? []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Backtester</h1>
        <p className="text-sm text-muted mt-0.5">Configure signal weights and strategy parameters, then run</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card space-y-4">
            <div className="section-title">Date Range</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted block mb-1">Start</label>
                <input type="date" value={cfg.start}
                  onChange={e => setCfg(p => ({ ...p, start: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">End</label>
                <input type="date" value={cfg.end}
                  onChange={e => setCfg(p => ({ ...p, end: e.target.value }))}
                  className="input-field" />
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="section-title">Signal Weights</div>
              <span className={`text-xs font-mono ${weightsValid ? 'text-success' : 'text-warning'}`}>
                Σ = {(totalWeight * 100).toFixed(0)}%{weightsValid ? ' ✓' : ' (adjust)'}
              </span>
            </div>
            <Slider label="Job Postings (NLP)" value={cfg.signal_weights.job_signal}
              min={0} max={1} step={0.05} fmt={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => setWeight('job_signal', v)} />
            <Slider label="Web Traffic" value={cfg.signal_weights.web_signal}
              min={0} max={1} step={0.05} fmt={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => setWeight('web_signal', v)} />
            <Slider label="Shipping / AIS" value={cfg.signal_weights.ship_signal}
              min={0} max={1} step={0.05} fmt={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => setWeight('ship_signal', v)} />
            <Slider label="Satellite" value={cfg.signal_weights.sat_signal}
              min={0} max={1} step={0.05} fmt={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => setWeight('sat_signal', v)} />
          </div>

          <div className="card space-y-4">
            <div className="section-title">Portfolio Construction</div>
            <Slider label="Long positions (N)" value={cfg.long_n}
              min={1} max={10} step={1} fmt={v => String(v)}
              onChange={v => setCfg(p => ({ ...p, long_n: v }))} />
            <Slider label="Short positions (N)" value={cfg.short_n}
              min={1} max={10} step={1} fmt={v => String(v)}
              onChange={v => setCfg(p => ({ ...p, short_n: v }))} />
            <Slider label="Transaction Cost" value={cfg.transaction_cost}
              min={0} max={0.02} step={0.0005} fmt={v => `${(v * 10000).toFixed(0)} bps`}
              onChange={v => setCfg(p => ({ ...p, transaction_cost: v }))} />
          </div>

          <div className="flex gap-2">
            <button onClick={runBacktest} disabled={loading || !weightsValid}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running…</>
                : <><Play size={14} /> Run Backtest</>
              }
            </button>
            <button onClick={() => { setCfg(DEFAULT); setResults(null) }}
              className="px-3 py-2 rounded-lg border border-border text-muted hover:text-slate-100 hover:border-slate-500 transition-colors">
              <RotateCcw size={14} />
            </button>
          </div>

          {error && (
            <div className="text-xs text-danger bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="lg:col-span-2 space-y-4">
          {!results && !loading && (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center mb-4">
                <Play size={20} className="text-muted" />
              </div>
              <p className="text-muted text-sm">Configure parameters and click Run Backtest</p>
              <p className="text-muted/60 text-xs mt-1">Backtests typically complete in 2–5 seconds</p>
            </div>
          )}

          {loading && (
            <div className="card flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted text-sm">Running backtest…</p>
            </div>
          )}

          {results && !loading && (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Return', value: pct(results.metrics.total_return), h: results.metrics.total_return > 0 ? 'good' : 'bad' },
                  { label: 'Sharpe Ratio', value: results.metrics.sharpe_ratio.toFixed(2), h: results.metrics.sharpe_ratio > 1 ? 'good' : results.metrics.sharpe_ratio > 0.5 ? 'neutral' : 'bad' },
                  { label: 'Max Drawdown', value: pct(results.metrics.max_drawdown), h: 'bad' },
                  { label: 'Hit Rate', value: `${(results.metrics.hit_rate * 100).toFixed(1)}%`, h: results.metrics.hit_rate > 0.5 ? 'good' : 'neutral' },
                ].map(m => (
                  <div key={m.label} className="card text-center">
                    <div className="metric-label">{m.label}</div>
                    <div className={`metric-value mt-1 ${m.h === 'good' ? 'text-success' : m.h === 'bad' ? 'text-danger' : 'text-slate-100'}`}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Equity curve */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <span className="section-title">Equity Curve (%)</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-primary">— Strategy</span>
                    <span className="text-muted">— Benchmark (SPY)</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
                      tickFormatter={d => d.slice(0, 7)} interval={Math.floor(curve.length / 6)} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
                      tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} width={48} />
                    <Tooltip
                      formatter={(v: number, n: string) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, n]}
                      contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="Strategy" stroke="#6366f1" strokeWidth={2}
                      fill="url(#g1)" dot={false} />
                    <Area type="monotone" dataKey="Benchmark" stroke="#64748b" strokeWidth={1.5}
                      fill="none" dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Drawdown */}
                <div className="card">
                  <span className="section-title block mb-3">Drawdown</span>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={ddData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                        tickFormatter={d => d.slice(0, 7)} interval={Math.floor(ddData.length / 4)} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                        tickFormatter={v => `${v.toFixed(0)}%`} width={38} />
                      <Tooltip
                        formatter={(v: number) => [`${v.toFixed(2)}%`, 'Drawdown']}
                        contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="Drawdown" stroke="#ef4444" strokeWidth={1.5}
                        fill="url(#g2)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly returns */}
                <div className="card">
                  <span className="section-title block mb-3">Monthly Returns</span>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                        interval={Math.floor(monthlyData.length / 5)} />
                      <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                        tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} width={38} />
                      <Tooltip
                        formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, 'Return']}
                        contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 11 }}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
                      <Bar dataKey="Return" radius={[2, 2, 0, 0]}>
                        {monthlyData.map((d, i) => (
                          <Cell key={i} fill={d.Return >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Full metrics table */}
              <div className="card">
                <span className="section-title block mb-3">Full Performance Report</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <div>
                    <MetricRow label="Total Return" value={pct(results.metrics.total_return)} highlight={results.metrics.total_return > 0 ? 'good' : 'bad'} />
                    <MetricRow label="Annual Return" value={pct(results.metrics.annual_return)} highlight={results.metrics.annual_return > 0 ? 'good' : 'bad'} />
                    <MetricRow label="Sharpe Ratio (ann.)" value={results.metrics.sharpe_ratio.toFixed(3)} highlight={results.metrics.sharpe_ratio > 0.8 ? 'good' : 'neutral'} />
                    <MetricRow label="Max Drawdown" value={pct(results.metrics.max_drawdown)} highlight="bad" />
                    <MetricRow label="Calmar Ratio" value={results.metrics.calmar_ratio.toFixed(3)} highlight={results.metrics.calmar_ratio > 1 ? 'good' : 'neutral'} />
                  </div>
                  <div>
                    <MetricRow label="Hit Rate (% weeks)" value={`${(results.metrics.hit_rate * 100).toFixed(2)}%`} highlight={results.metrics.hit_rate > 0.5 ? 'good' : 'neutral'} />
                    <MetricRow label="Alpha vs SPY (ann.)" value={pct(results.metrics.alpha)} highlight={results.metrics.alpha > 0 ? 'good' : 'bad'} />
                    <MetricRow label="Beta vs SPY" value={results.metrics.beta.toFixed(3)} highlight="neutral" />
                    <MetricRow label="Avg Weekly Turnover" value={`${(results.metrics.avg_turnover * 100).toFixed(1)}%`} highlight="neutral" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
