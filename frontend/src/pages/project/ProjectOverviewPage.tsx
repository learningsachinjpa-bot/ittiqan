import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { agents, evaluations, observability, reliability, healthMonitor } from '../../lib/api'
import type { ObsMetrics, AgentHealthStatus, Incident } from '../../lib/api'
import type { Agent, Evaluation } from '../../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function score2color(v: number | null) {
  if (v === null) return 'text-gray-400'
  return v >= 0.8 ? 'text-green-600' : v >= 0.5 ? 'text-amber-500' : 'text-red-600'
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[color] ?? map.gray}`}>{children}</span>
}

function StatCard({ label, value, sub, color, icon, onClick }: {
  label: string; value: string; sub: string; color?: string; icon?: string; onClick?: () => void
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-5 ${onClick ? 'cursor-pointer hover:border-cyan-300 hover:shadow-sm transition-all' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
        {icon && <span className="mr-1">{icon}</span>}{label}
      </p>
      <p className={`text-2xl font-bold mb-1 ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  )
}

// ── mini sparkline ────────────────────────────────────────────────────────────
function ScoreLine({ evals }: { evals: Evaluation[] }) {
  const pts = evals
    .filter(e => e.overall_score != null)
    .slice(-20)
    .reverse()
  if (pts.length < 2) return (
    <div className="h-28 flex items-center justify-center text-gray-300 text-sm">Not enough evaluation data</div>
  )
  const max = 1, min = 0, w = 320, h = 96
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
  const ys = pts.map(e => h - ((e.overall_score! - min) / (max - min)) * h)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const fill = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
    + ` L${xs[xs.length - 1]},${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#grad)" />
      <path d={path} fill="none" stroke="#06b6d4" strokeWidth="2" />
      {pts.map((e, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="3" fill="#06b6d4">
          <title>{`${(e.overall_score! * 100).toFixed(1)}% — ${new Date(e.created_at).toLocaleDateString()}`}</title>
        </circle>
      ))}
    </svg>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const base = `/project/${id}`
  const [timeRange, setTimeRange] = useState<24 | 168 | 720>(24)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [evalList, setEvalList] = useState<Evaluation[]>([])
  const [metrics, setMetrics] = useState<ObsMetrics | null>(null)
  const [health, setHealth] = useState<AgentHealthStatus | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.allSettled([
      agents.get(id).then(setAgent),
      evaluations.list(id).then(setEvalList),
      observability.metrics(id, timeRange).then(setMetrics),
      healthMonitor.status(timeRange === 24 ? 24 : timeRange === 168 ? 168 : 720).then(h => {
        setHealth(h.agents.find(a => a.agent_id === id) ?? null)
      }),
      reliability.incidents().then(inc =>
        setIncidents(inc.filter(i => i.agent_id === id && i.status !== 'resolved'))
      ),
    ]).finally(() => setLoading(false))
  }, [id, timeRange])

  // ── derived stats ──────────────────────────────────────────────────────────
  const completedEvals = evalList.filter(e => e.status === 'completed')
  const avgScore = completedEvals.length
    ? completedEvals.reduce((s, e) => s + (e.overall_score ?? 0), 0) / completedEvals.length
    : null
  const passRate = completedEvals.length
    ? completedEvals.filter(e => (e.overall_score ?? 0) >= 0.7).length / completedEvals.length
    : null
  const recentEvals = evalList.slice(0, 5)

  // Weakest metrics across all completed evals
  const metricAgg: Record<string, { total: number; count: number }> = {}
  for (const e of completedEvals) {
    for (const [k, v] of Object.entries(e.metric_scores ?? {})) {
      if (!metricAgg[k]) metricAgg[k] = { total: 0, count: 0 }
      metricAgg[k].total += v as number
      metricAgg[k].count += 1
    }
  }
  const weakMetrics = Object.entries(metricAgg)
    .map(([name, { total, count }]) => ({ name, avg: total / count }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 4)

  const openIncidentCount = incidents.length
  const uptimePct = health?.uptime_pct ?? null
  const timeLabel = timeRange === 24 ? '24h' : timeRange === 168 ? '7d' : '30d'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {loading ? 'Loading…' : agent?.name ?? 'Analysis'}
          </h1>
          <p className="text-gray-500 text-sm">Operational overview — quality, security, runtime and reliability at a glance.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {([24, 168, 720] as const).map(t => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded transition-colors ${
                t === timeRange ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t === 24 ? '24h' : t === 168 ? '7d' : '30d'}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {agent && (
        <div className="flex flex-wrap gap-2 mb-6 text-xs">
          {(agent.tags ?? []).map(tag => (
            <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{tag}</span>
          ))}
          <span className="text-gray-400">#{id?.slice(0, 8)} · {completedEvals.length} evaluation{completedEvals.length !== 1 ? 's' : ''}</span>
          {agent.status === 'degraded' && <Pill color="red">⚠ Degraded</Pill>}
          {openIncidentCount > 0 && <Pill color="red">{openIncidentCount} open incident{openIncidentCount > 1 ? 's' : ''}</Pill>}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Overall Score"
          value={avgScore != null ? pct(avgScore) : '—'}
          sub={completedEvals.length > 0 ? `avg of ${completedEvals.length} run${completedEvals.length > 1 ? 's' : ''}` : 'No runs yet'}
          color={score2color(avgScore)}
          onClick={completedEvals.length > 0 ? () => navigate(`${base}/evaluations`) : undefined}
        />
        <StatCard
          label="Pass Rate"
          value={passRate != null ? pct(passRate) : '—'}
          sub={completedEvals.length > 0 ? `threshold ≥ 70%` : 'No runs yet'}
          color={passRate != null ? (passRate >= 0.7 ? 'text-green-600' : passRate >= 0.5 ? 'text-amber-500' : 'text-red-600') : 'text-gray-400'}
          icon="✓"
          onClick={completedEvals.length > 0 ? () => navigate(`${base}/evaluations`) : undefined}
        />
        <StatCard
          label="Uptime"
          value={uptimePct != null ? `${uptimePct.toFixed(1)}%` : '—'}
          sub={health ? `${health.total_checks} health checks` : 'No checks yet'}
          color={uptimePct != null ? (uptimePct >= 99 ? 'text-green-600' : uptimePct >= 95 ? 'text-amber-500' : 'text-red-600') : 'text-gray-400'}
          icon="☁"
          onClick={() => navigate(`${base}/reliability/uptime`)}
        />
        <StatCard
          label="Avg Latency"
          value={metrics ? `${Math.round(metrics.avg_latency_ms)}ms` : '—'}
          sub={metrics ? `p95: ${Math.round(metrics.p95_latency_ms)}ms · p99: ${Math.round(metrics.p99_latency_ms)}ms` : `No traces in ${timeLabel}`}
          onClick={metrics ? () => navigate(`${base}/observability/traces`) : undefined}
        />
        <StatCard
          label="Error Rate"
          value={metrics ? `${metrics.error_rate.toFixed(1)}%` : '—'}
          sub={metrics ? `${metrics.total_calls} calls · ${timeLabel}` : `No traces in ${timeLabel}`}
          color={metrics ? (metrics.error_rate < 1 ? 'text-green-600' : metrics.error_rate < 5 ? 'text-amber-500' : 'text-red-600') : 'text-gray-400'}
          onClick={metrics ? () => navigate(`${base}/observability/traces`) : undefined}
        />
        <StatCard
          label="Total Cost"
          value={metrics ? `$${metrics.total_cost_usd.toFixed(4)}` : '—'}
          sub={metrics ? `${(metrics.total_tokens / 1000).toFixed(1)}k tokens · ${timeLabel}` : `No traces in ${timeLabel}`}
          icon="💰"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">📈 Evaluation Score Trend</h3>
            <button onClick={() => navigate(`${base}/evaluations`)} className="text-xs text-cyan-600 hover:underline">All runs</button>
          </div>
          <ScoreLine evals={evalList} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">🔔 Weakest Metrics</h3>
            <button onClick={() => navigate(`${base}/metrics`)} className="text-xs text-cyan-600 hover:underline">View all</button>
          </div>
          {weakMetrics.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-gray-300 text-sm">No metric breakdown yet</div>
          ) : (
            <div className="space-y-2 mt-2">
              {weakMetrics.map(m => (
                <div key={m.name} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-36 truncate capitalize">{m.name.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${m.avg >= 0.8 ? 'bg-green-400' : m.avg >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${m.avg * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium w-10 text-right ${score2color(m.avg)}`}>{pct(m.avg)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Latency breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">⚡ Latency Distribution</h3>
          {metrics && metrics.total_calls > 0 ? (
            <div className="space-y-2">
              {[
                { label: 'p50', value: metrics.p50_latency_ms },
                { label: 'p95', value: metrics.p95_latency_ms },
                { label: 'p99', value: metrics.p99_latency_ms },
                { label: 'avg', value: metrics.avg_latency_ms },
              ].map(({ label, value }) => {
                const max = metrics.p99_latency_ms || 1
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">{label}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-2 bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-16 text-right">{Math.round(value)}ms</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-20 flex items-center justify-center text-gray-300 text-sm">No runtime traces in {timeLabel}</div>
          )}
        </div>

        {/* Open incidents */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">🚨 Open Incidents</h3>
            <button onClick={() => navigate(`${base}/reliability/incidents`)} className="text-xs text-cyan-600 hover:underline">All incidents</button>
          </div>
          {incidents.length === 0 ? (
            <div className="h-20 flex items-center justify-center text-green-600 text-sm gap-1">
              <span>✓</span><span>No open incidents</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-28 overflow-y-auto">
              {incidents.slice(0, 4).map(inc => (
                <div key={inc.id} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${inc.severity === 'critical' ? 'bg-red-600' : inc.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{inc.title}</p>
                    <p className="text-xs text-gray-500">{inc.severity} · {new Date(inc.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-3">💡 Recommendations</h3>
        <div className="space-y-2">
          {[
            avgScore !== null && avgScore < 0.7 && {
              color: 'red',
              text: `Overall score is ${pct(avgScore)} — below the 70% pass threshold. Review weakest metrics and re-evaluate.`,
              action: () => navigate(`${base}/evaluations`),
              actionLabel: 'View evaluations',
            },
            metrics && metrics.error_rate > 5 && {
              color: 'red',
              text: `Error rate is ${metrics.error_rate.toFixed(1)}% in the last ${timeLabel}. Check traces for recurring failures.`,
              action: () => navigate(`${base}/observability/traces`),
              actionLabel: 'View traces',
            },
            uptimePct !== null && uptimePct < 95 && {
              color: 'amber',
              text: `Uptime is ${uptimePct.toFixed(1)}% — below the 95% healthy threshold.`,
              action: () => navigate(`${base}/reliability/uptime`),
              actionLabel: 'View uptime',
            },
            openIncidentCount > 0 && {
              color: 'red',
              text: `${openIncidentCount} open incident${openIncidentCount > 1 ? 's' : ''} require attention.`,
              action: () => navigate(`${base}/reliability/incidents`),
              actionLabel: 'View incidents',
            },
            completedEvals.length === 0 && {
              color: 'blue',
              text: 'No evaluations run yet. Start an evaluation to get quality scores and metric breakdowns.',
              action: () => navigate(`${base}/evaluations`),
              actionLabel: 'Run evaluation',
            },
          ]
            .filter((r): r is { color: string; text: string; action: () => void; actionLabel: string } => Boolean(r))
            .map((rec, i) => (
              <div key={i} className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                rec.color === 'red' ? 'bg-red-50 border-red-200' :
                rec.color === 'amber' ? 'bg-amber-50 border-amber-200' :
                'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-sm ${rec.color === 'red' ? 'text-red-700' : rec.color === 'amber' ? 'text-amber-700' : 'text-blue-700'}`}>{rec.text}</p>
                <button onClick={rec.action} className="text-xs font-medium text-cyan-600 hover:underline whitespace-nowrap">{rec.actionLabel}</button>
              </div>
            ))
          }
          {/* All clear if no issues */}
          {!loading && avgScore !== null && avgScore >= 0.7 &&
            (!metrics || metrics.error_rate <= 5) &&
            (uptimePct === null || uptimePct >= 95) &&
            openIncidentCount === 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              ✓ All systems healthy — quality, runtime and reliability signals look good.
            </div>
          )}
          {!loading && completedEvals.length === 0 && (!metrics || metrics.total_calls === 0) && uptimePct === null && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              Get started: run an evaluation to populate this dashboard with real data.
            </div>
          )}
        </div>
      </div>

      {/* Recent evaluations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700 text-sm">🔄 Recent Evaluations</h3>
          <button onClick={() => navigate(`${base}/evaluations`)} className="text-xs text-cyan-600 hover:underline">All runs</button>
        </div>
        {recentEvals.length === 0 ? (
          <div className="h-12 flex items-center justify-center text-gray-300 text-sm">No evaluations yet</div>
        ) : (
          <div className="space-y-2">
            {recentEvals.map(e => {
              const score = e.overall_score
              return (
                <div key={e.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${e.status === 'completed' ? (score != null && score >= 0.7 ? 'bg-green-400' : 'bg-red-400') : e.status === 'running' ? 'bg-cyan-400 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-700 flex-1 truncate">{e.name}</span>
                  <span className={`text-sm font-semibold ${score2color(score ?? null)}`}>
                    {score != null ? pct(score) : e.status}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Environment */}
      {agent && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">🌐 Environment</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            {[
              ['Endpoint', agent.endpoint_url || '—'],
              ['Method', agent.http_method],
              ['Auth', agent.has_api_key ? 'API Key' : 'None'],
              ['LLM Judge', agent.llm_judge_model || agent.llm_judge_provider || '—'],
              ['Multi-Turn', agent.enable_multi_turn ? 'Enabled' : 'Disabled'],
              ['Trace Metrics', agent.enable_trace_metrics ? 'Enabled' : 'Disabled'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-50 py-1">
                <span className="text-gray-400">{k}</span>
                <span className="text-gray-700 truncate max-w-[180px]" title={v}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
