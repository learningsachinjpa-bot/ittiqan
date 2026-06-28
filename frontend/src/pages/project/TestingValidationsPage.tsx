import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { evaluations, agents, Agent } from '../../lib/api'

interface Evaluation {
  id: string; name: string; status: string; overall_score?: number
  total_cases: number; completed_cases: number; failed_cases: number
  created_at: string; completed_at?: string; metrics: string[]
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-700',
}

export default function TestingValidationsPage() {
  const { id: agentId } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agentId) return
    Promise.all([
      agents.get(agentId),
      evaluations.list(agentId),
    ]).then(([a, e]) => {
      setAgent(a)
      setEvals(e as Evaluation[])
    }).finally(() => setLoading(false))
  }, [agentId])

  const completed = evals.filter(e => e.status === 'completed')
  const avgScore = completed.length > 0
    ? (completed.reduce((s, e) => s + (e.overall_score ?? 0), 0) / completed.length * 100).toFixed(1)
    : '—'
  const passing = completed.filter(e => (e.overall_score ?? 0) >= 0.8).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Testing & Validations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Regression history and quality gate results for {agent?.name ?? 'this agent'}</p>
        </div>
        <button
          onClick={() => navigate(`/project/${agentId}/evaluations`)}
          className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Run Evaluation
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Runs', value: loading ? '…' : evals.length },
          { label: 'Avg Score', value: loading ? '…' : `${avgScore}%` },
          { label: 'Passing (≥80%)', value: loading ? '…' : passing },
          { label: 'Failing', value: loading ? '…' : completed.length - passing },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Quality gate visualization */}
      {!loading && completed.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Score Trend (last 20 runs)</h2>
          <div className="flex items-end gap-1 h-24">
            {completed.slice(-20).map((e, i) => {
              const pct = (e.overall_score ?? 0) * 100
              const color = pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400'
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${e.name}: ${pct.toFixed(1)}%`}>
                  <div className={`w-full rounded-t-sm ${color}`} style={{ height: `${Math.max(4, pct)}%` }} />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Oldest</span><span>— 80% pass threshold —</span><span>Newest</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Evaluation History</h2>
          <span className="text-xs text-gray-400">{evals.length} runs</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : evals.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No evaluations yet</p>
            <p className="text-gray-400 text-xs mt-1">Run your first evaluation to start tracking quality over time</p>
            <button
              onClick={() => navigate(`/project/${agentId}/evaluations`)}
              className="mt-3 text-sm text-cyan-600 hover:text-cyan-700 underline"
            >
              Go to Evaluations →
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Cases</th>
                <th className="px-4 py-2 text-left">Metrics</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {evals.map(e => (
                <tr
                  key={e.id}
                  onClick={() => navigate(`/project/${agentId}/evaluations`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.overall_score != null ? (
                      <span className={`font-semibold ${e.overall_score >= 0.8 ? 'text-green-600' : e.overall_score >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {(e.overall_score * 100).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.completed_cases}/{e.total_cases}
                    {e.failed_cases > 0 && <span className="text-red-500 ml-1">({e.failed_cases} failed)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(e.metrics ?? []).slice(0, 3).map(m => (
                        <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{m}</span>
                      ))}
                      {e.metrics?.length > 3 && <span className="text-xs text-gray-400">+{e.metrics.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
