import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reliability } from '../../lib/api'
import type { UptimeEntry } from '../../lib/api'

function UptimeBadge({ pct }: { pct: number }) {
  const color = pct >= 99 ? 'text-green-600 bg-green-50' : pct >= 95 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50'
  return <span className={`px-3 py-1 rounded-full text-sm font-bold ${color}`}>{pct.toFixed(2)}%</span>
}

export default function ReliabilityUptimePage() {
  const { id: agentId } = useParams()
  const [entries, setEntries] = useState<UptimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(24)

  useEffect(() => {
    setLoading(true)
    reliability.uptime(agentId, hours).then(setEntries).finally(() => setLoading(false))
  }, [agentId, hours])

  const total = entries.length
  const successful = entries.filter(e => e.status === 'success').length
  const uptimePct = total > 0 ? (successful / total) * 100 : 100
  const avgLatency = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + (e.latency_ms ?? 0), 0) / entries.length)
    : 0
  const errors = entries.filter(e => e.status === 'error')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Uptime</h1>
          <p className="text-sm text-gray-500 mt-0.5">Availability derived from agent call traces</p>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Uptime', value: loading ? '…' : <UptimeBadge pct={uptimePct} /> },
          { label: 'Total Calls', value: loading ? '…' : total },
          { label: 'Avg Latency', value: loading ? '…' : `${avgLatency}ms` },
          { label: 'Errors', value: loading ? '…' : errors.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Mini sparkline bar */}
      {!loading && entries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Call History (last {entries.length} calls)</p>
          <div className="flex gap-0.5 h-8 items-end">
            {entries.slice(0, 120).reverse().map((e, i) => (
              <div
                key={i}
                title={`${e.status} — ${e.latency_ms ?? 0}ms`}
                className={`flex-1 rounded-sm ${e.status === 'success' ? 'bg-green-400' : e.status === 'timeout' ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ height: `${Math.min(100, Math.max(20, ((e.latency_ms ?? 100) / 2000) * 100))}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Oldest</span><span>← Green = success · Red = error · Yellow = timeout →</span><span>Newest</span>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Errors</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Latency</th>
                <th className="px-4 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {errors.slice(0, 20).map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(e.checked_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{e.status}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{e.latency_ms != null ? `${e.latency_ms}ms` : '—'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-xs">{e.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-sm">No call data for this period</p>
          <p className="text-gray-400 text-xs mt-1">Uptime is derived from ingested traces — send some calls first</p>
        </div>
      )}
    </div>
  )
}
