import { useEffect, useState } from 'react'
import { agents as agentsApi, evaluations as evalsApi } from '../../lib/api'
import type { Agent, Evaluation } from '../../types'

interface AgentSummary {
  agent: Agent
  latestEval: Evaluation | null
}

function ScoreCircle({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 96 : size === 'md' ? 64 : 48
  const r = (dim / 2) - 6
  const circ = 2 * Math.PI * r
  const pct = score !== null ? Math.round(score * 100) : null
  const dash = pct !== null ? (pct / 100) * circ : 0
  const color = pct === null ? '#9ca3af' : pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={dim} height={dim}>
      <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6} />
      {pct !== null && (
        <circle
          cx={dim / 2} cy={dim / 2} r={r} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      )}
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size === 'lg' ? 20 : size === 'md' ? 13 : 11} fontWeight="700" fill={color}>
        {pct !== null ? `${pct}%` : '—'}
      </text>
    </svg>
  )
}

function MetricRow({ label, a, b }: { label: string; a: number | null; b: number | null }) {
  const pctA = a !== null ? Math.round(a * 100) : null
  const pctB = b !== null ? Math.round(b * 100) : null
  const winner = pctA !== null && pctB !== null ? (pctA > pctB ? 'a' : pctB > pctA ? 'b' : 'tie') : null

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2.5 pr-4 text-sm text-gray-500 w-1/3">{label}</td>
      <td className={`py-2.5 text-sm font-semibold text-center ${winner === 'a' ? 'text-green-600' : 'text-gray-700'}`}>
        {pctA !== null ? `${pctA}%` : '—'}
      </td>
      <td className="py-2.5 text-sm text-center text-gray-300">|</td>
      <td className={`py-2.5 text-sm font-semibold text-center ${winner === 'b' ? 'text-green-600' : 'text-gray-700'}`}>
        {pctB !== null ? `${pctB}%` : '—'}
      </td>
    </tr>
  )
}

export default function AgentComparisonPage() {
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [agentA, setAgentA] = useState('')
  const [agentB, setAgentB] = useState('')
  const [summaryA, setSummaryA] = useState<AgentSummary | null>(null)
  const [summaryB, setSummaryB] = useState<AgentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    agentsApi.list()
      .then(setAllAgents)
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to load agents'))
  }, [])

  async function compare() {
    if (!agentA || !agentB || agentA === agentB) return
    setLoading(true)
    setError('')
    setSummaryA(null)
    setSummaryB(null)
    try {
      const [evalsA, evalsB] = await Promise.all([
        evalsApi.list(agentA),
        evalsApi.list(agentB),
      ])
      const agentAObj = allAgents.find(a => a.id === agentA)!
      const agentBObj = allAgents.find(a => a.id === agentB)!
      const latestA = evalsA.filter(e => e.status === 'completed').sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())[0] ?? null
      const latestB = evalsB.filter(e => e.status === 'completed').sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())[0] ?? null
      setSummaryA({ agent: agentAObj, latestEval: latestA })
      setSummaryB({ agent: agentBObj, latestEval: latestB })
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to load eval data')
    } finally {
      setLoading(false)
    }
  }

  // Gather all unique metric keys from both evals
  const allMetrics = Array.from(new Set([
    ...Object.keys(summaryA?.latestEval?.metric_scores ?? {}),
    ...Object.keys(summaryB?.latestEval?.metric_scores ?? {}),
  ]))

  const scoresA = summaryA?.latestEval?.metric_scores ?? {}
  const scoresB = summaryB?.latestEval?.metric_scores ?? {}

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Agent Comparison</h1>
      <p className="text-gray-500 text-sm mb-6">Compare evaluation results across two agents side by side.</p>

      {loadError && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{loadError}</div>
      )}

      {/* Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-40">
          <label htmlFor="agent-a-select" className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Agent A</label>
          <select
            id="agent-a-select"
            value={agentA}
            onChange={e => setAgentA(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">Select agent…</option>
            {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="text-gray-300 font-bold text-xl self-end pb-2">vs</div>
        <div className="flex-1 min-w-40">
          <label htmlFor="agent-b-select" className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Agent B</label>
          <select
            id="agent-b-select"
            value={agentB}
            onChange={e => setAgentB(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">Select agent…</option>
            {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <button
          onClick={compare}
          disabled={loading || !agentA || !agentB || agentA === agentB}
          className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg"
        >
          {loading ? 'Loading…' : 'Compare'}
        </button>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {summaryA && summaryB && (
        <div className="space-y-5">
          {/* Header cards */}
          <div className="grid grid-cols-2 gap-5">
            {[summaryA, summaryB].map((s, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-xl p-5 text-center">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Agent {idx === 0 ? 'A' : 'B'}</p>
                <h2 className="text-lg font-bold text-gray-900 mb-3">{s.agent.name}</h2>
                <div className="flex justify-center mb-3">
                  <ScoreCircle score={s.latestEval?.overall_score ?? null} size="lg" />
                </div>
                {s.latestEval ? (
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>{s.latestEval.passed_count ?? 0} passed / {(s.latestEval.passed_count ?? 0) + (s.latestEval.failed_count ?? 0)} total</p>
                    <p>{s.latestEval.completed_at ? new Date(s.latestEval.completed_at).toLocaleDateString() : 'unknown date'}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No completed evaluations yet</p>
                )}
              </div>
            ))}
          </div>

          {/* Metric breakdown */}
          {allMetrics.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Metric Breakdown</h3>
              <table className="w-full">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    <th className="pb-2 text-left w-1/3">Metric</th>
                    <th className="pb-2 text-center">{summaryA.agent.name}</th>
                    <th className="pb-2 text-center w-8"></th>
                    <th className="pb-2 text-center">{summaryB.agent.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {allMetrics.map(m => (
                    <MetricRow
                      key={m}
                      label={m.replace(/_/g, ' ')}
                      a={scoresA[m] ?? null}
                      b={scoresB[m] ?? null}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary verdict */}
          {summaryA.latestEval?.overall_score != null && summaryB.latestEval?.overall_score != null && (() => {
            const sA = summaryA.latestEval!.overall_score!
            const sB = summaryB.latestEval!.overall_score!
            const diff = Math.abs(sA - sB)
            const winner = sA > sB ? summaryA.agent.name : sB > sA ? summaryB.agent.name : null
            return (
              <div className={`rounded-xl p-4 text-sm font-medium ${winner ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                {winner
                  ? `${winner} outperforms by ${Math.round(diff * 100)} percentage points overall.`
                  : 'Both agents scored identically overall.'}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
