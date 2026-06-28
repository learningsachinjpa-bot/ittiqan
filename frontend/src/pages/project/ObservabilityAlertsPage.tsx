import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { observability } from '../../lib/api'
import type { ObsAlert, AlertChannel, WebhookDelivery } from '../../lib/api'

const SEV_COLOR: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const COND_LABELS: Record<string, string> = {
  error_rate: 'Error Rate >',
  latency_spike: 'Avg Latency >',
  score_drop: 'Score <',
}

const COND_UNITS: Record<string, string> = {
  error_rate: '%',
  latency_spike: 'ms',
  score_drop: '',
}

const COND_HINTS: Record<string, string> = {
  error_rate: 'Fires when error + timeout % exceeds this value over the last 30 min',
  latency_spike: 'Fires when average latency_ms exceeds this value over the last 30 min',
  score_drop: 'Fires when the most recent completed evaluation score drops below this value (0.0–1.0)',
}

interface FiredResult {
  alert_id: string; alert_name: string; condition_type: string
  threshold: number; metric_value: number
}

export default function ObservabilityAlertsPage() {
  const { id: agentId } = useParams()
  const [alerts, setAlerts] = useState<ObsAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [condType, setCondType] = useState('error_rate')
  const [threshold, setThreshold] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [evalResult, setEvalResult] = useState<{ fired: FiredResult[]; fired_count: number } | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [channelAlertId, setChannelAlertId] = useState<string | null>(null)
  const [channelType, setChannelType] = useState<'email' | 'webhook'>('email')
  const [channelValue, setChannelValue] = useState('')
  const [channelSaving, setChannelSaving] = useState(false)
  const [channelError, setChannelError] = useState('')
  // Webhook delivery history: alertId → deliveries
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({})
  const [deliveryLoading, setDeliveryLoading] = useState<string | null>(null)
  // Test webhook: alertId+url → result
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null)  // `${alertId}:${url}`
  const [testResults, setTestResults] = useState<Record<string, { status: string; http_status: number | null; duration_ms: number; error: string | null }>>({})

  function load() {
    setLoading(true)
    setFetchError('')
    observability.alerts()
      .then(setAlerts)
      .catch(err => setFetchError(err instanceof Error ? err.message : 'Failed to load alerts'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !threshold) return
    setSubmitting(true)
    setFormError('')
    try {
      await observability.createAlert({
        name: name.trim(),
        condition_type: condType,
        condition_threshold: Number(threshold),
        severity,
        agent_id: agentId,
      })
      setShowForm(false)
      setName('')
      setThreshold('')
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create alert')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this alert?')) return
    await observability.deleteAlert(id)
    load()
  }

  async function handleAddChannel(alertId: string) {
    if (!channelValue.trim()) { setChannelError('Enter a value'); return }
    const alert = alerts.find(a => a.id === alertId)
    if (!alert) return
    const existing: AlertChannel[] = alert.notification_channels ?? []
    const newChannel: AlertChannel = channelType === 'email'
      ? { type: 'email', address: channelValue.trim() }
      : { type: 'webhook', url: channelValue.trim() }
    const updated = [...existing, newChannel]
    setChannelSaving(true)
    setChannelError('')
    try {
      await observability.updateAlertChannels(alertId, updated)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, notification_channels: updated } : a))
      setChannelValue('')
    } catch (e) {
      setChannelError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setChannelSaving(false)
    }
  }

  async function handleRemoveChannel(alertId: string, idx: number) {
    const alert = alerts.find(a => a.id === alertId)
    if (!alert) return
    const updated = (alert.notification_channels ?? []).filter((_, i) => i !== idx)
    try {
      await observability.updateAlertChannels(alertId, updated)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, notification_channels: updated } : a))
    } catch (e) {
      setChannelError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  async function handleEvaluate() {
    setEvaluating(true)
    setEvalResult(null)
    try {
      const result = await observability.evaluateAlerts(agentId)
      setEvalResult(result)
      if (result.fired_count > 0) load() // refresh triggered_count
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Evaluation failed')
    } finally {
      setEvaluating(false)
    }
  }

  async function loadDeliveries(alertId: string) {
    setDeliveryLoading(alertId)
    try {
      const data = await observability.webhookDeliveries(alertId)
      setDeliveries(prev => ({ ...prev, [alertId]: data }))
    } catch {
      // non-critical, leave empty
    } finally {
      setDeliveryLoading(null)
    }
  }

  async function handleTestWebhook(alertId: string, url: string) {
    const key = `${alertId}:${url}`
    setTestingWebhook(key)
    try {
      const result = await observability.testWebhook(alertId, url)
      setTestResults(prev => ({ ...prev, [key]: result }))
      // Reload delivery history so the test ping appears
      loadDeliveries(alertId)
    } catch (e) {
      setTestResults(prev => ({ ...prev, [key]: { status: 'failed', http_status: null, duration_ms: 0, error: e instanceof Error ? e.message : 'Test failed' } }))
    } finally {
      setTestingWebhook(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fires when trace metrics breach a threshold — checked every 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="border border-cyan-300 text-cyan-700 hover:bg-cyan-50 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {evaluating
              ? <><span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />Evaluating…</>
              : '▷ Run Evaluation Now'}
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setFormError('') }}
            className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New Alert
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      {/* Evaluation result banner */}
      {evalResult !== null && (
        <div className={`rounded-xl border p-4 ${evalResult.fired_count > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {evalResult.fired_count === 0 ? (
            <p className="text-sm font-medium text-green-700">All clear — no thresholds breached in the last 30 minutes</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-700 mb-2">{evalResult.fired_count} alert{evalResult.fired_count > 1 ? 's' : ''} fired — incidents created</p>
              <div className="space-y-1">
                {evalResult.fired.map(f => (
                  <div key={f.alert_id} className="text-xs text-red-600 flex gap-2">
                    <span className="font-medium">{f.alert_name}</span>
                    <span>—</span>
                    <span>{COND_LABELS[f.condition_type] ?? f.condition_type} {f.threshold}{COND_UNITS[f.condition_type] ?? ''} · current: {f.metric_value.toFixed(1)}{COND_UNITS[f.condition_type] ?? ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* How it works info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">How alerts work</p>
        <p>The engine evaluates all active alerts every 5 minutes automatically (after health checks). It looks at the last 30 minutes of trace data for this agent. When a threshold is breached, an Incident is created in Reliability → Incidents and any webhook channels are notified. Alerts have a 30-minute cooldown to prevent flooding.</p>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create Alert</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="alert-name" className="block text-xs font-medium text-gray-600 mb-1">Alert Name</label>
              <input
                id="alert-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. High Error Rate"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="alert-condition" className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                <select
                  id="alert-condition"
                  value={condType}
                  onChange={e => setCondType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {Object.entries(COND_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l.replace(' >', '').replace(' <', '')}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{COND_HINTS[condType]}</p>
              </div>
              <div>
                <label htmlFor="alert-threshold" className="block text-xs font-medium text-gray-600 mb-1">
                  Threshold {COND_UNITS[condType] ? `(${COND_UNITS[condType]})` : ''}
                </label>
                <input
                  id="alert-threshold"
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={e => setThreshold(e.target.value)}
                  placeholder={condType === 'error_rate' ? 'e.g. 5' : condType === 'latency_spike' ? 'e.g. 2000' : '0.7'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="alert-severity" className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
                <select
                  id="alert-severity"
                  value={severity}
                  onChange={e => setSeverity(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {['low', 'medium', 'high', 'critical'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !name.trim() || !threshold}
                className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {submitting ? 'Creating…' : 'Create Alert'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Active Alerts</h2>
          <span className="text-xs text-gray-400">Evaluating every 5 min · 30 min window · 30 min cooldown</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No alerts configured</p>
            <p className="text-gray-400 text-xs mt-1">Create an alert to get notified when error rate or latency spikes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Condition</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">Triggered</th>
                <th className="px-4 py-2 text-left">Last Fired</th>
                <th className="px-4 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {alerts.map(a => (
                <>
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {COND_LABELS[a.condition_type] ?? a.condition_type} {a.condition_threshold}{COND_UNITS[a.condition_type] ?? ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEV_COLOR[a.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.triggered_count}×</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {a.last_triggered_at ? new Date(a.last_triggered_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            const opening = channelAlertId !== a.id
                            setChannelAlertId(opening ? a.id : null)
                            setChannelValue('')
                            setChannelError('')
                            if (opening) loadDeliveries(a.id)
                          }}
                          className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                          title="Manage notification channels"
                        >
                          🔔 Notify {(a.notification_channels?.length ?? 0) > 0 && `(${a.notification_channels!.length})`}
                        </button>
                        <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                  {channelAlertId === a.id && (
                    <tr key={`${a.id}-channels`}>
                      <td colSpan={6} className="px-4 py-4 bg-cyan-50 border-l-2 border-cyan-300">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Notification Channels</p>
                          {(a.notification_channels ?? []).length === 0 && (
                            <p className="text-xs text-gray-400">No channels yet — add one below</p>
                          )}
                          {(a.notification_channels ?? []).map((ch, idx) => {
                            const webhookUrl = ch.type === 'webhook' ? (ch.url ?? '') : ''
                            const testKey = `${a.id}:${webhookUrl}`
                            const testResult = testResults[testKey]
                            const isTesting = testingWebhook === testKey
                            const alertDeliveries = (deliveries[a.id] ?? []).filter(d => d.url === webhookUrl)
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${ch.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{ch.type}</span>
                                  <span className="text-gray-700 font-mono truncate max-w-xs">{ch.type === 'email' ? ch.address : ch.url}</span>
                                  {ch.type === 'webhook' && webhookUrl && (
                                    <button
                                      onClick={() => handleTestWebhook(a.id, webhookUrl)}
                                      disabled={isTesting}
                                      className="text-xs border border-cyan-300 text-cyan-600 hover:bg-cyan-50 px-2 py-0.5 rounded disabled:opacity-50"
                                    >
                                      {isTesting ? '…' : 'Test'}
                                    </button>
                                  )}
                                  <button onClick={() => handleRemoveChannel(a.id, idx)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                                </div>
                                {/* Inline test result */}
                                {testResult && ch.type === 'webhook' && webhookUrl && testResults[testKey] && (
                                  <div className={`text-xs px-2 py-1 rounded ${testResult.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {testResult.status === 'success'
                                      ? `✓ HTTP ${testResult.http_status} · ${testResult.duration_ms}ms`
                                      : `✗ ${testResult.error ?? `HTTP ${testResult.http_status}`}`}
                                  </div>
                                )}
                                {/* Delivery history */}
                                {ch.type === 'webhook' && alertDeliveries.length > 0 && (
                                  <div className="ml-1 border-l-2 border-gray-100 pl-2 space-y-0.5">
                                    <p className="text-xs text-gray-400 font-medium">Recent deliveries</p>
                                    {alertDeliveries.slice(0, 5).map(d => (
                                      <div key={d.id} className="flex items-center gap-2 text-xs text-gray-500">
                                        <span className={`font-medium ${d.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                          {d.status === 'success' ? '✓' : '✗'}
                                        </span>
                                        {d.http_status && <span className="text-gray-400">HTTP {d.http_status}</span>}
                                        {d.duration_ms != null && <span className="text-gray-400">{d.duration_ms}ms</span>}
                                        {d.is_test && <span className="bg-gray-100 text-gray-500 px-1 rounded">test</span>}
                                        <span className="text-gray-300">{new Date(d.created_at).toLocaleTimeString()}</span>
                                        {d.error_message && <span className="text-red-500 truncate max-w-xs" title={d.error_message}>{d.error_message.slice(0, 60)}</span>}
                                      </div>
                                    ))}
                                    {deliveryLoading === a.id && <p className="text-xs text-gray-400">Loading…</p>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          <div className="flex items-center gap-2 pt-1">
                            <select
                              value={channelType}
                              onChange={e => setChannelType(e.target.value as 'email' | 'webhook')}
                              aria-label="Channel type"
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                            >
                              <option value="email">Email</option>
                              <option value="webhook">Webhook</option>
                            </select>
                            <input
                              value={channelValue}
                              onChange={e => setChannelValue(e.target.value)}
                              placeholder={channelType === 'email' ? 'ops@yourcompany.com' : 'https://hooks.slack.com/...'}
                              aria-label={channelType === 'email' ? 'Email address' : 'Webhook URL'}
                              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                            />
                            <button
                              onClick={() => handleAddChannel(a.id)}
                              disabled={channelSaving}
                              className="text-xs bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              {channelSaving ? '…' : '+ Add'}
                            </button>
                          </div>
                          {channelError && <p className="text-xs text-red-600">{channelError}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
