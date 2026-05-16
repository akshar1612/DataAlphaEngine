import { useState } from 'react'
import { Activity, BarChart2, FlaskConical, Satellite } from 'lucide-react'
import Dashboard from './components/Dashboard'
import SignalExplorer from './components/SignalExplorer'
import Backtester from './components/Backtester'

type Page = 'dashboard' | 'signals' | 'backtest'

const NAV = [
  { id: 'dashboard' as Page, label: 'Dashboard', icon: Activity },
  { id: 'signals' as Page, label: 'Signal Explorer', icon: Satellite },
  { id: 'backtest' as Page, label: 'Backtester', icon: FlaskConical },
]

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <BarChart2 size={16} className="text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 leading-none">Alpha Engine</div>
              <div className="text-[10px] text-muted mt-0.5">Alt Data Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <div className="section-title px-3 mb-3">Navigation</div>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={page === id ? 'nav-item-active w-full text-left' : 'nav-item w-full text-left'}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-[10px] text-muted leading-relaxed">
            Signals: Job Postings · Web Traffic<br />
            Shipping · Satellite Imagery<br />
            <span className="text-primary/70">Powered by LLM Embeddings</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-surface-0">
        {page === 'dashboard' && <Dashboard />}
        {page === 'signals' && <SignalExplorer />}
        {page === 'backtest' && <Backtester />}
      </main>
    </div>
  )
}
