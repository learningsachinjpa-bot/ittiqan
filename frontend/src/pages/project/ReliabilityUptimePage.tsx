import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reliability, healthMonitor } from '../../lib/api'
import type { UptimeEntry, AgentHealthStatus } from '../../lib/api'

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  degraded: 'bg-yellow-500',
  inactive: 'bg-gray-400',
  unknown: 'bg-gray-300',
}

function UptimeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-sm">No data</span>
  const color = pct >= 99 ? 'text-green-600 bg-green-50' : pct >= 95 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50'
  return <span className={`px-3 py-1 rounded-full text-sm font-bold ${color}`}>{pct.toFixed(2)}%</span>
}

export default function ReliabilityUptimePage() {
  const { id: agentId } = useParams()
  const [healthStatus, setHealthStatus] = useState<AgentHealthStatus | null>(null)
  const [entries, setEntries] = useState<UptimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)
  const [hours, setHours] = useState(24)
  const [intervalMinutes, setIntervalMinutes] = useState(5)
  const [savingInterval, setSavingInterval] = useState(false)
  const [fetchError, setFetchError] = useState('')

  function load() {
    setLoading(true)
    setFetchError('')
    Promise.all([
      healthMonitor.status(hours),
      reliability.uptime(agentId, hours),
    ]).then(([h, u]) => {
      const agentHealth = h.agents.find(a => a.agent_id === agentId) ?? null
      setHealthStatus(agentHealth)
      setIntervalMinutes(h.check_interval_minutes)
      setEntries(u)
    }).catch(err => {
      setFetchError(err instanceof Error ? err.message : 'Failed to load uptime data')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [agentId, hours])

  async function handleCheckNow() {
    if (!agentId) return
    setChecking(true)
    setCheckResult(null)
    try {
      const result = await healthMonitor.check(agentId)
      if (result.skipped) {
        setCheckResult(`Skipped: ${result.reason}`)
      } else {
        setCheckResult(`${result.status === 'success' ? '✓' : '✗'} ${result.status} — ${result.latency_ms}ms${result.error ? ` (${result.error})` : ''}`)
      }
      load()
    } catch (err) {
      setCheckResult(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setChecking(false)
    }
  }

  async function handleSaveInterval() {
    setSavingInterval(true)
    try {
      await healthMonitor.setInterval(intervalMinutes)
    } finally {
      setSavingInterval(false)
    }
  }

  const errors = entries.filter(e => e.status === 'error' || e.status === 'timeout')
  const totalFromTraces = entries.length
  const successFromTraces = entries.filter(e => e.status === 'success').length
  const tracesUptime = totalFromTraces > 0 ? (successFromTraces / totalFromTraces) * 100 : 100
  const avgLatency = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + (e.latency_ms ?? 0), 0) / entries.length)
    : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Uptime</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live health checks every {intervalMinutes} minutes</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {[1, 6, 24, 48, 168].map(h => (
              <option key={h} value={h}>Last {h === 168 ? '7 days' : `${h}h`}</option>
            ))}
          </select>
          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {checking ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Checking…</>
            ) : '▶ Check Now'}
          </button>
        </div>
      </div>

      {checkResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${checkResult.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {checkResult}
        </div>
      )}

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      {/* Health monitor summary card */}
      {!loading && healthStatus && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Health Monitor</h2>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[healthStatus.status] ?? 'bg-gray-300'}`} />
              <span className="text-sm font-medium text-gray-700 capitalize">{healthStatus.status}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Uptime</p>
              <UptimeBadge pct={healthStatus.uptime_pct} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Checks</p>
              <p className="text-lg font-bold text-gray-900">{healthStatus.total_checks}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Avg Latency</p>
              <p className="text-lg font-bold text-gray-900">{healthStatus.avg_latency_ms != null ? `${healthStatus.avg_latency_ms}ms` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Last Check</p>
              <p className="text-xs text-gray-700 mt-1">{healthStatus.last_check ? new Date(healthStatus.last_check).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && !healthStatus && totalFromTraces === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-medium text-amber-800">No health check data yet</p>
          <p className="text-xs text-amber-600 mt-1">
            Health checks run every {intervalMinutes} minutes automatically. Click "Check Now" to get an immediate reading.
            Make sure this agent has an endpoint URL configured.
          </p>
        </div>
      )}

      {/* Trace-based stats (includes manual calls + health checks) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Uptime (all traces)', value: loading ? '…' : `${tracesUptime.toFixed(1)}%` },
          { label: 'Total Calls', value: loading ? '…' : totalFromTraces },
          { label: 'Avg Latency', value: loading ? '…' : `${avgLatency}ms` },
          { label: 'Errors', value: loading ? '…' : errors.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      {!loading && entries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Call History (last {Math.min(entries.length, 120)} calls)</p>
          <div className="flex gap-0.5 h-8 items-end">
            {entries.slice(0, 120).reverse().map((e, i) => (
              <div
                key={i}
                title={`${e.status} — ${e.latency_ms ?? 0}ms at ${new Date(e.checked_at).toLocaleTimeString()}`}
                className={`flex-1 rounded-sm ${e.status === 'success' ? 'bg-green-400' : e.status === 'timeout' ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ height: `${Math.min(100, Math.max(8, ((e.latency_ms ?? 100) / 2000) * 100))}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Oldest</span>
            <span>Green = success · Red = error · Yellow = timeout</span>
            <span>Newest</span>
          </div>
        </div>
      )}

      {/* Check interval config */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Check Interval</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={60}
            value={intervalMinutes}
            onChange={e => setIntervalMinutes(Number(e.target.value))}
            className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <span className="text-sm text-gray-500">minutes (1–60)</span>
          <button
            onClick={handleSaveInterval}
            disabled={savingInterval}
            className="text-sm text-cyan-600 hover:text-cyan-700 border border-cyan-200 px-3 py-1.5 rounded-lg hover:bg-cyan-50 transition-colors disabled:opacity-50"
          >
            {savingInterval ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Changes apply to all agents across your organization</p>
      </div>

      {/* Error table */}
      {errors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Errors & Timeouts</h2>
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.status === 'timeout' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{e.latency_ms != null ? `${e.latency_ms}ms` : '—'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-xs">{e.error_message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
