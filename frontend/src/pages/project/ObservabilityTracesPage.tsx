import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { observability } from '../../lib/api'
import type { Trace, ObsMetrics } from '../../lib/api'

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  timeout: 'bg-yellow-100 text-yellow-700',
}

export default function ObservabilityTracesPage() {
  const { id: agentId } = useParams()
  const [traces, setTraces] = useState<Trace[]>([])
  const [metrics, setMetrics] = useState<ObsMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(24)
  const [selected, setSelected] = useState<Trace | null>(null)
  const [detail, setDetail] = useState<{ input?: string; output?: string; spans: unknown[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    setLoading(true)
    setFetchError('')
    Promise.all([
      observability.traces(agentId, hours),
      observability.metrics(agentId, hours),
    ]).then(([t, m]) => {
      setTraces(t)
      setMetrics(m)
    }).catch(err => {
      setFetchError(err instanceof Error ? err.message : 'Failed to load traces')
    }).finally(() => setLoading(false))
  }, [agentId, hours])

  async function openDetail(t: Trace) {
    setSelected(t)
    setLoadingDetail(true)
    try {
      const d = await observability.trace(t.trace_id)
      setDetail({ input: d.input, output: d.output, spans: d.spans })
    } finally {
      setLoadingDetail(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Traces</h1>
          <p className="text-sm text-gray-500 mt-0.5">Request-level observability for this agent</p>
        </div>
        <select
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          {[1, 6, 24, 48, 168].map(h => (
            <option key={h} value={h}>Last {h === 168 ? '7 days' : `${h}h`}</option>
          ))}
        </select>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Total Calls" value={metrics?.total_calls ?? 0} />
          <MetricCard label="Error Rate" value={`${metrics?.error_rate ?? 0}%`} />
          <MetricCard label="Avg Latency" value={`${metrics?.avg_latency_ms ?? 0}ms`} sub={`p95: ${metrics?.p95_latency_ms ?? 0}ms`} />
          <MetricCard label="Total Cost" value={`$${metrics?.total_cost_usd ?? 0}`} sub={`${metrics?.total_tokens ?? 0} tokens`} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent Traces</h2>
          <span className="text-xs text-gray-400">{traces.length} traces</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading traces…</div>
        ) : traces.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No traces yet</p>
            <p className="text-gray-400 text-xs mt-1">Traces appear when your agent calls are ingested via the API</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Trace ID</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Latency</th>
                <th className="px-4 py-2 text-left">Tokens</th>
                <th className="px-4 py-2 text-left">Cost</th>
                <th className="px-4 py-2 text-left">Model</th>
                <th className="px-4 py-2 text-left">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {traces.map(t => (
                <tr
                  key={t.id}
                  onClick={() => openDetail(t)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs text-cyan-600">{t.trace_id.slice(0, 12)}…</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{t.latency_ms != null ? `${t.latency_ms}ms` : '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{t.tokens_input + t.tokens_output}</td>
                  <td className="px-4 py-2 text-gray-700">${t.cost_usd.toFixed(4)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{t.model_used ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{new Date(t.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setSelected(null); setDetail(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Trace Detail</h3>
              <button onClick={() => { setSelected(null); setDetail(null) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Trace ID:</span> <span className="font-mono text-xs">{selected.trace_id}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[selected.status] ?? ''}`}>{selected.status}</span></div>
                <div><span className="text-gray-500">Latency:</span> {selected.latency_ms}ms</div>
                <div><span className="text-gray-500">Model:</span> {selected.model_used ?? '—'}</div>
                <div><span className="text-gray-500">Cost:</span> ${selected.cost_usd.toFixed(6)}</div>
                <div><span className="text-gray-500">Tokens:</span> {selected.tokens_input} in / {selected.tokens_output} out</div>
              </div>
              {loadingDetail ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-20 bg-gray-100 rounded-lg" />
                  <div className="h-20 bg-gray-100 rounded-lg" />
                </div>
              ) : detail ? (
                <>
                  {detail.input && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Input</p>
                      <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{detail.input}</pre>
                    </div>
                  )}
                  {detail.output && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Output</p>
                      <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{detail.output}</pre>
                    </div>
                  )}
                  {detail.spans.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Spans ({detail.spans.length})</p>
                      <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-40 overflow-y-auto">{JSON.stringify(detail.spans, null, 2)}</pre>
                    </div>
                  )}
                </>
              ) : null}
              {selected.error_message && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                  <p className="text-xs text-red-700">{selected.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
