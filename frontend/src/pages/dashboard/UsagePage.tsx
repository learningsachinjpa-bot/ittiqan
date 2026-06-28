import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { orgs } from '../../lib/api'
import type { UsageStats } from '../../lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(usd: number) {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Plan limit bar ────────────────────────────────────────────────────────────

function LimitBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  // limit === 0 means Enterprise unlimited; limit === -1 means no enforced cap
  const unlimited = limit <= 0
  const pct = unlimited ? 0 : Math.min(Math.round((used / limit) * 100), 100)
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-cyan-500'
  const remaining = unlimited ? null : limit - used

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500 tabular-nums">
          {fmt(used)}{!unlimited && ` / ${fmt(limit)}`}
          {unlimited && <span className="text-xs text-green-600 ml-1">Unlimited</span>}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-2 ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {!unlimited && (
        <p className="text-xs text-gray-400 mt-1">
          {remaining! > 0 ? `${fmt(remaining!)} remaining` : 'Limit reached'}
          {pct >= 80 && remaining! > 0 && <span className="text-amber-600 ml-1">· Consider upgrading</span>}
        </p>
      )}
    </div>
  )
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function SparkBar({ daily }: { daily: { date: string; count: number }[] }) {
  const max = Math.max(...daily.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-16">
      {daily.map(d => {
        const height = max === 0 ? 2 : Math.max(Math.round((d.count / max) * 64), d.count > 0 ? 4 : 2)
        const dt = new Date(d.date)
        const label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        return (
          <div
            key={d.date}
            className="flex-1 group relative"
            title={`${label}: ${d.count} eval${d.count !== 1 ? 's' : ''}`}
          >
            <div
              className="w-full rounded-t bg-cyan-400 group-hover:bg-cyan-500 transition-colors"
              style={{ height: `${height}px` }}
            />
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none">
              {label}: {d.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    orgs.usageStats()
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load usage data'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Usage</h1>
      <p className="text-gray-500 text-sm mb-6">Monitor your platform usage and limits.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse h-24" />
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Usage</h1>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
    </div>
  )

  const s = stats!
  const planLabel = s.plan.name.charAt(0).toUpperCase() + s.plan.name.slice(1)
  const evalActivity = s.daily_evals.reduce((sum, d) => sum + d.count, 0)
  const nextReset = (() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Usage</h1>
          <p className="text-gray-500 text-sm">
            <span className="font-medium text-gray-700 capitalize">{planLabel} plan</span>
            {' · '}Resets {nextReset}
          </p>
        </div>
        {s.plan.name === 'free' && (
          <button
            onClick={() => navigate('/dashboard/plan')}
            className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Upgrade Plan
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Traces (30d)"
          value={fmt(s.traces_30d.total)}
          sub={s.traces_30d.error_rate_pct > 0 ? `${s.traces_30d.error_rate_pct}% error rate` : 'No errors'}
        />
        <StatCard
          label="Tokens consumed (30d)"
          value={fmt(s.traces_30d.total_tokens)}
          sub="input + output"
        />
        <StatCard
          label="LLM cost (30d)"
          value={fmtCost(s.traces_30d.total_cost_usd)}
          sub="from agent traces"
        />
        <StatCard
          label="Avg eval score"
          value={s.evals.avg_score !== null ? `${Math.round(s.evals.avg_score * 100)}%` : '—'}
          sub={s.evals.completed > 0 ? `across ${s.evals.completed} completed evals` : 'No completed evals yet'}
        />
      </div>

      {/* Plan limits */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Plan Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LimitBar label="Agents Connected" used={s.consumption.agents} limit={s.plan.max_agents} />
          <LimitBar label="Evaluations This Month" used={s.consumption.evaluations_this_month} limit={s.plan.max_evaluations_per_month} />
          <LimitBar label="Datasets" used={s.consumption.datasets} limit={s.plan.max_datasets} />
          <LimitBar label="Security Scans (all time)" used={s.consumption.security_scans} limit={-1} />
        </div>
      </div>

      {/* Eval activity chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Evaluation Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {evalActivity} evaluation{evalActivity !== 1 ? 's' : ''} in the last 30 days
            </p>
          </div>
        </div>
        <SparkBar daily={s.daily_evals} />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">
            {new Date(s.daily_evals[0]?.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-xs text-gray-400">Today</span>
        </div>
      </div>

      {/* Per-agent breakdown */}
      {s.agents.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Agent Activity</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Evals (total)</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Traces (30d)</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Evaluated</th>
                </tr>
              </thead>
              <tbody>
                {s.agents.map((a, i) => (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/project/${a.id}`)}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{a.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right tabular-nums">{a.eval_count}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 text-right tabular-nums">{a.trace_count_30d}</td>
                    <td className="py-3 px-4 text-right">
                      {a.avg_score !== null ? (
                        <span className={`text-sm font-semibold ${a.avg_score >= 0.8 ? 'text-green-600' : a.avg_score >= 0.6 ? 'text-amber-600' : 'text-red-600'}`}>
                          {Math.round(a.avg_score * 100)}%
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400 text-right">
                      {a.last_evaluated_at
                        ? new Date(a.last_evaluated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {s.agents.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No agents connected yet.</p>
          <button
            onClick={() => navigate('/dashboard/agents/connect')}
            className="mt-3 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Connect your first agent
          </button>
        </div>
      )}
    </div>
  )
}
