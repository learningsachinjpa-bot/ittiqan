import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { agents, evaluations, reliability, healthMonitor } from '../../lib/api'
import type { AgentHealthStatus, Incident } from '../../lib/api'
import type { Agent, Evaluation } from '../../types'

function score2color(v: number | null) {
  if (v === null) return 'text-gray-400'
  return v >= 0.8 ? 'text-green-600' : v >= 0.5 ? 'text-amber-500' : 'text-red-600'
}

function StatusDot({ status }: { status: string }) {
  const c = status === 'active' ? 'bg-green-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-gray-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, AgentHealthStatus>>({})
  const [evalMap, setEvalMap] = useState<Record<string, Evaluation | null>>({})
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      agents.list().then(setAgentList),
      healthMonitor.status(24).then(h => {
        const m: Record<string, AgentHealthStatus> = {}
        h.agents.forEach(a => { m[a.agent_id] = a })
        setHealthMap(m)
      }),
      reliability.incidents().then(setIncidents),
    ]).finally(() => setLoading(false))
  }, [])

  // Fetch latest eval for each agent after agent list loads
  useEffect(() => {
    if (!agentList.length) return
    const map: Record<string, Evaluation | null> = {}
    Promise.allSettled(
      agentList.map(a =>
        evaluations.list(a.id).then(list => {
          const done = list.filter(e => e.status === 'completed')
          map[a.id] = done.length > 0 ? done[0] : null
        })
      )
    ).then(() => setEvalMap({ ...map }))
  }, [agentList])

  const openIncidents = incidents.filter(i => i.status !== 'resolved')
  const degradedAgents = agentList.filter(a => a.status === 'degraded')

  // Fleet-level aggregates
  const agentsWithHealth = agentList.filter(a => healthMap[a.id])
  const avgUptime = agentsWithHealth.length
    ? agentsWithHealth.reduce((s, a) => s + (healthMap[a.id]?.uptime_pct ?? 100), 0) / agentsWithHealth.length
    : null

  const agentsWithEval = agentList.filter(a => evalMap[a.id])
  const avgScore = agentsWithEval.length
    ? agentsWithEval.reduce((s, a) => s + (evalMap[a.id]?.overall_score ?? 0), 0) / agentsWithEval.length
    : null

  if (!loading && agentList.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Operations Control Center</h1>
        <p className="text-gray-500 text-sm mb-8">Cross-agent health, quality, security and reliability across your connected fleet.</p>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-gray-300 text-6xl mb-4">⬡</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No agents connected yet</h2>
          <p className="text-gray-400 text-sm mb-6">Connect an agent in the Agents Registry to populate the control center.</p>
          <button onClick={() => navigate('/dashboard/agents/connect')} className="flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-cyan-600">
            + Connect Agent
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Operations Control Center</h1>
        <p className="text-gray-500 text-sm">Cross-agent health, quality, security and reliability — last 24h.</p>
      </div>

      {/* Fleet KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total Agents',
            value: loading ? '…' : agentList.length,
            sub: loading ? '' : `${agentList.filter(a => a.status === 'active').length} active · ${degradedAgents.length} degraded`,
            color: degradedAgents.length > 0 ? 'text-amber-600' : 'text-gray-900',
          },
          {
            label: 'Fleet Uptime',
            value: loading || avgUptime === null ? '—' : `${avgUptime.toFixed(1)}%`,
            sub: agentsWithHealth.length > 0 ? `across ${agentsWithHealth.length} monitored` : 'No health checks yet',
            color: avgUptime != null ? (avgUptime >= 99 ? 'text-green-600' : avgUptime >= 95 ? 'text-amber-500' : 'text-red-600') : 'text-gray-400',
          },
          {
            label: 'Avg Eval Score',
            value: avgScore != null ? `${(avgScore * 100).toFixed(1)}%` : '—',
            sub: agentsWithEval.length > 0 ? `${agentsWithEval.length} evaluated agent${agentsWithEval.length > 1 ? 's' : ''}` : 'No evaluations yet',
            color: score2color(avgScore),
          },
          {
            label: 'Open Incidents',
            value: loading ? '…' : openIncidents.length,
            sub: openIncidents.length === 0 ? 'All clear' : `${openIncidents.filter(i => i.severity === 'critical').length} critical`,
            color: openIncidents.length > 0 ? 'text-red-600' : 'text-green-600',
          },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{s.label}</p>
            <p className={`text-2xl font-bold mb-1 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(degradedAgents.length > 0 || openIncidents.length > 0) && (
        <div className="space-y-2">
          {degradedAgents.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-600">⚠</span>
                <span className="text-sm font-medium text-amber-800">{a.name} is degraded</span>
                <span className="text-xs text-amber-600">
                  {healthMap[a.id] ? `${healthMap[a.id].uptime_pct?.toFixed(1) ?? '?'}% uptime` : ''}
                </span>
              </div>
              <button onClick={() => navigate(`/project/${a.id}/reliability/uptime`)} className="text-xs text-amber-700 underline">View uptime</button>
            </div>
          ))}
          {openIncidents.slice(0, 3).map(inc => (
            <div key={inc.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-red-500">🚨</span>
                <span className="text-sm font-medium text-red-800">{inc.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${inc.severity === 'critical' ? 'bg-red-200 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{inc.severity}</span>
              </div>
              <span className="text-xs text-gray-400">{new Date(inc.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent fleet table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Agent Fleet</h2>
          <button onClick={() => navigate('/dashboard/agents/connect')} className="text-xs text-cyan-600 hover:underline">+ Add agent</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-2 text-left">Agent</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Uptime</th>
              <th className="px-4 py-2 text-left">Last Score</th>
              <th className="px-4 py-2 text-left">Open Incidents</th>
              <th className="px-4 py-2 text-left">Last Check</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
            ) : agentList.map(a => {
              const h = healthMap[a.id]
              const e = evalMap[a.id]
              const agentIncidents = openIncidents.filter(i => i.agent_id === a.id)
              return (
                <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/project/${a.id}`)}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{a.name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[200px]">{a.endpoint_url || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={a.status} />
                      <span className="text-xs capitalize text-gray-600">{a.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {h ? (
                      <span className={`font-medium ${h.uptime_pct != null ? (h.uptime_pct >= 99 ? 'text-green-600' : h.uptime_pct >= 95 ? 'text-amber-500' : 'text-red-600') : 'text-gray-400'}`}>
                        {h.uptime_pct != null ? `${h.uptime_pct.toFixed(1)}%` : '—'}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e ? (
                      <span className={`font-medium ${score2color(e.overall_score ?? null)}`}>
                        {e.overall_score != null ? `${(e.overall_score * 100).toFixed(1)}%` : '—'}
                      </span>
                    ) : <span className="text-gray-300">No evals</span>}
                  </td>
                  <td className="px-4 py-3">
                    {agentIncidents.length > 0 ? (
                      <span className="text-xs text-red-600 font-medium">{agentIncidents.length} open</span>
                    ) : <span className="text-xs text-green-600">✓ Clear</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {h?.last_check ? new Date(h.last_check).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-cyan-600">Open →</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Recent incidents */}
      {openIncidents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Open Incidents</h2>
            <span className="text-xs text-gray-400">{openIncidents.length} unresolved</span>
          </div>
          <div className="divide-y divide-gray-50">
            {openIncidents.slice(0, 6).map(inc => (
              <div key={inc.id} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${inc.severity === 'critical' ? 'bg-red-600' : inc.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{inc.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{inc.description?.slice(0, 100)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{new Date(inc.created_at).toLocaleString()}</p>
                  <span className={`text-xs font-medium ${inc.severity === 'critical' ? 'text-red-600' : 'text-orange-500'}`}>{inc.severity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
