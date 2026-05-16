import { useEffect, useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api'
import type { SignalsResponse } from '../types'

const SIGNAL_TYPES = [
  { key: 'job',       label: 'Job Postings',    color: '#6366f1', desc: 'Hiring velocity signal from job posting counts, embedded via sentence-transformers' },
  { key: 'web',       label: 'Web Traffic',     color: '#22c55e', desc: 'Weekly DAU trend — proxy for consumer demand and brand momentum' },
  { key: 'shipping',  label: 'Shipping / AIS',  color: '#f59e0b', desc: 'Container throughput and port congestion — supply-chain lead indicator' },
  { key: 'satellite', label: 'Satellite',       color: '#ec4899', desc: 'Parking-lot occupancy from satellite imagery — retail footfall proxy' },
  { key: 'composite', label: 'Composite',       color: '#e2e8f0', desc: 'Weighted combination of all four signals, cross-sectionally z-scored' },
] as const

type SigKey = typeof SIGNAL_TYPES[number]['key']
const TICKERS = ['AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','JPM','GS','WMT','TGT','COST','HD','FDX','XOM']
const COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#38bdf8','#a78bfa','#fb7185','#34d399','#fbbf24','#60a5fa']

export default function SignalExplorer() {
  const [data, setData] = useState<SignalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSig, setActiveSig] = useState<SigKey>('composite')
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['AAPL', 'NVDA', 'AMZN'])
  const [embScores, setEmbScores] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    Promise.all([api.signals(), api.embeddingScores()])
      .then(([s, e]) => { setData(s); setEmbScores(e) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted text-sm">Computing embeddings via sentence-transformers…</p>
      </div>
    </div>
  )

  if (error) return <div className="p-8 text-danger text-sm">Error: {error}</div>

  const sigInfo = SIGNAL_TYPES.find(s => s.key === activeSig)!

  // Build chart series for selected tickers
  const chartData = (data!.dates || []).map((date, i) => {
    const row: Record<string, string | number> = { date }
    for (const t of selectedTickers) {
      const sigMap = data!.signals as Record<string, Record<string, (number | null)[]>>
      const vals = sigMap[activeSig]?.[t]
      row[t] = vals?.[i] ?? 0
    }
    return row
  })

  // IC chart
  const icData = (data!.rolling_ic || []).map(d => ({
    date: d.date,
    IC: d.ic,
  }))

  const avgIc = icData.length
    ? (icData.reduce((s, d) => s + d.IC, 0) / icData.length).toFixed(4)
    : 'N/A'

  function toggleTicker(t: string) {
    setSelectedTickers(prev =>
      prev.includes(t)
        ? prev.filter(x => x !== t)
        : prev.length < 8 ? [...prev, t] : prev
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Signal Explorer</h1>
        <p className="text-sm text-muted mt-0.5">
          Drill into each alternative data stream and inspect predictive power
        </p>
      </div>

      {/* NLP embedding scores panel */}
      {embScores && (
        <div className="card bg-primary/5 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="section-title mb-2">LLM Embedding Hiring Intent Scores</div>
              <p className="text-xs text-muted mb-3">
                Job posting blurbs are embedded using <span className="text-primary font-mono">all-MiniLM-L6-v2</span>.
                Cosine similarity to a "bullish hiring" template minus "bearish" template gives a net hiring-momentum signal.
              </p>
              <div className="flex gap-4">
                {Object.entries(embScores).map(([cat, score]) => (
                  <div key={cat} className="card-sm flex-1 text-center">
                    <div className="text-xs text-muted capitalize mb-1">{cat}</div>
                    <div className={`text-lg font-mono font-bold ${score > 0 ? 'text-success' : 'text-danger'}`}>
                      {score > 0 ? '+' : ''}{score.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signal selector */}
      <div className="flex flex-wrap gap-2">
        {SIGNAL_TYPES.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSig(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeSig === s.key
                ? 'border-transparent text-white'
                : 'border-border text-muted hover:text-slate-100 hover:border-slate-500'
            }`}
            style={activeSig === s.key ? { background: s.color, borderColor: s.color } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="card-sm bg-surface-3/50 text-xs text-muted border border-border/50 rounded-lg px-4 py-2">
        {sigInfo.desc}
      </div>

      {/* Ticker selector */}
      <div>
        <div className="section-title mb-2">Select Tickers (max 8)</div>
        <div className="flex flex-wrap gap-1.5">
          {TICKERS.map(t => (
            <button
              key={t}
              onClick={() => toggleTicker(t)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border transition-colors ${
                selectedTickers.includes(t)
                  ? 'bg-surface-3 border-primary text-slate-100'
                  : 'border-border text-muted hover:border-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Signal time series */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <span className="section-title">{sigInfo.label} Signal — Z-Score Time Series</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={d => d.slice(0, 7)} interval={Math.floor(chartData.length / 8)} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={v => v.toFixed(1)} width={36} />
            <Tooltip
              formatter={(v: number, name: string) => [v.toFixed(3), name]}
              contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#252540" strokeWidth={1} />
            <Legend iconType="line" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {selectedTickers.map((t, i) => (
              <Line
                key={t} type="monotone" dataKey={t}
                stroke={COLORS[i % COLORS.length]} strokeWidth={1.5}
                dot={false} activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Rolling IC */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <span className="section-title">Rolling 12-Week Spearman IC — Composite Signal</span>
          <span className="text-xs font-mono text-muted">
            Mean IC: <span className="text-primary">{avgIc}</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={icData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={d => d.slice(0, 7)} interval={Math.floor(icData.length / 8)} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false}
              tickFormatter={v => v.toFixed(2)} width={40} domain={[-0.3, 0.3]} />
            <Tooltip
              formatter={(v: number) => [v.toFixed(4), 'IC']}
              contentStyle={{ background: '#12121f', border: '1px solid #252540', borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} strokeDasharray="4 2" />
            <ReferenceLine y={0.05} stroke="#22c55e" strokeWidth={1} strokeDasharray="2 2" label={{ value: 'IC=0.05', fill: '#22c55e', fontSize: 10 }} />
            <Line type="monotone" dataKey="IC" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted mt-2">
          IC &gt; 0.05 is generally considered a strong alt-data signal. Positive IC means the composite
          signal reliably predicts 1-week-ahead cross-sectional returns.
        </p>
      </div>

      {/* Latest signal table */}
      <div className="card">
        <span className="section-title block mb-4">Latest Signal Snapshot (All Tickers)</span>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-muted font-medium pb-2 pr-4">Ticker</th>
                <th className="text-left text-muted font-medium pb-2 pr-4">Sector</th>
                {SIGNAL_TYPES.map(s => (
                  <th key={s.key} className="text-center text-muted font-medium pb-2 px-2"
                    style={{ color: activeSig === s.key ? s.color : undefined }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TICKERS.map(t => {
                const row = data!.signals
                const latest = (k: string) => {
                  const arr = (row as Record<string, Record<string, (number|null)[]>>)[k]?.[t]
                  if (!arr) return 0
                  for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i] !== null) return arr[i] as number
                  }
                  return 0
                }
                return (
                  <tr key={t} className="border-t border-border/30 hover:bg-surface-3/20">
                    <td className="py-2 pr-4 font-mono font-semibold text-slate-300">{t}</td>
                    <td className="py-2 pr-4 text-muted">
                      {{'AAPL':'Tech','MSFT':'Tech','GOOGL':'Tech','AMZN':'Consumer','META':'Tech',
                        'NVDA':'Tech','TSLA':'Consumer','JPM':'Finance','GS':'Finance','WMT':'Consumer',
                        'TGT':'Consumer','COST':'Consumer','HD':'Consumer','FDX':'Industrial','XOM':'Energy'}[t]}
                    </td>
                    {SIGNAL_TYPES.map(s => {
                      const v = latest(s.key)
                      return (
                        <td key={s.key} className="py-2 px-2 text-center">
                          <span className={`font-mono ${v >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {v >= 0 ? '+' : ''}{v.toFixed(2)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
