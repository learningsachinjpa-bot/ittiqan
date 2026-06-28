import { useEffect, useState, useCallback } from 'react'
import { approvalGateway } from '../../lib/api'
import type { ApprovalRequest, ApprovalStats } from '../../lib/api'

const URGENCY_CONFIG = {
  critical: { label: 'Critical', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', ring: 'border-red-300' },
  high:     { label: 'High',     dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', ring: 'border-orange-200' },
  normal:   { label: 'Normal',   dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', ring: 'border-gray-200' },
  low:      { label: 'Low',      dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600', ring: 'border-gray-200' },
}

function TimeAgo({ iso }: { iso: string }) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const label = diff < 60 ? `${diff}s ago` : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : `${Math.floor(diff / 3600)}h ago`
  return <span className="text-xs text-gray-400">{label}</span>
}

function ExpiresIn({ iso }: { iso: string }) {
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 1000)
  if (diff <= 0) return <span className="text-xs text-red-500 font-medium">Expiring…</span>
  const label = diff < 60 ? `${diff}s` : diff < 3600 ? `${Math.floor(diff / 60)}m` : `${Math.floor(diff / 3600)}h`
  const color = diff < 300 ? 'text-red-500' : diff < 900 ? 'text-amber-500' : 'text-gray-400'
  return <span className={`text-xs font-medium ${color}`}>Expires in {label}</span>
}

export default function ApprovalsQueuePage() {
  const [queue, setQueue] = useState<ApprovalRequest[]>([])
  const [stats, setStats] = useState<ApprovalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [showApproveNote, setShowApproveNote] = useState(false)
  const [apiKeyInfo, setApiKeyInfo] = useState<{ has_key: boolean; created_at?: string } | null>(null)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const load = useCallback(() => {
    Promise.allSettled([
      approvalGateway.queue().then(setQueue),
      approvalGateway.stats().then(setStats),
      approvalGateway.apiKeyInfo().then(setApiKeyInfo),
    ]).catch(() => setFetchError('Failed to load approvals'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    // Poll every 30s so new requests appear without refresh
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const selected = queue.find(r => r.id === selectedId) ?? null

  async function handleApprove(id: string) {
    setActing(true)
    setActionError('')
    try {
      await approvalGateway.approve(id, approveNote || undefined)
      setSelectedId(null)
      setApproveNote('')
      setShowApproveNote(false)
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  async function handleReject(id: string) {
    if (!rejectNote.trim()) { setActionError('A rejection note is required'); return }
    setActing(true)
    setActionError('')
    try {
      await approvalGateway.reject(id, rejectNote.trim())
      setSelectedId(null)
      setRejectNote('')
      load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  async function handleGenerateKey() {
    setGeneratingKey(true)
    try {
      const res = await approvalGateway.generateApiKey()
      setGeneratedKey(res.api_key)
      setApiKeyInfo({ has_key: true, created_at: res.created_at })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to generate key')
    } finally {
      setGeneratingKey(false)
    }
  }

  const urgCfg = (u: string) => URGENCY_CONFIG[u as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.normal

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve actions before your agents execute them</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↻ Refresh</button>
          <button onClick={() => setShowApiKey(!showApiKey)} className="text-sm text-cyan-600 hover:text-cyan-700 border border-cyan-200 px-3 py-1.5 rounded-lg hover:bg-cyan-50">⚙ API Key</button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      {/* API Key panel */}
      {showApiKey && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Agent API Key</h2>
          <p className="text-xs text-gray-500">Your agents use this key to submit approval requests. Include it as <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code> when calling <code className="bg-gray-100 px-1 rounded">POST /api/v1/approvals/request</code>.</p>
          {generatedKey ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <code className="text-xs text-green-800 break-all flex-1">{generatedKey}</code>
                <button onClick={() => navigator.clipboard.writeText(generatedKey)} className="text-xs text-green-700 border border-green-300 px-2 py-1 rounded hover:bg-green-100 flex-shrink-0">Copy</button>
              </div>
              <p className="text-xs text-amber-600">⚠ Copy this now — it will not be shown again.</p>
            </div>
          ) : apiKeyInfo?.has_key ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-600 font-medium">✓ Key active since {apiKeyInfo.created_at ? new Date(apiKeyInfo.created_at).toLocaleDateString() : '—'}</span>
              <button onClick={handleGenerateKey} disabled={generatingKey} className="text-xs text-amber-600 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-50">
                {generatingKey ? 'Rotating…' : 'Rotate Key'}
              </button>
            </div>
          ) : (
            <button onClick={handleGenerateKey} disabled={generatingKey} className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {generatingKey ? 'Generating…' : 'Generate API Key'}
            </button>
          )}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Pending', value: stats.pending, color: 'text-amber-600 bg-amber-50 border-amber-200' },
            { label: 'Approved', value: stats.approved, color: 'text-green-600 bg-green-50 border-green-200' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-600 bg-red-50 border-red-200' },
            { label: 'Expired', value: stats.expired, color: 'text-gray-500 bg-gray-50 border-gray-200' },
            { label: 'Total', value: stats.total, color: 'text-gray-700 bg-white border-gray-200' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main split layout */}
      <div className="grid grid-cols-5 gap-4">

        {/* Queue list — left */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Pending ({queue.length})</h2>
            {queue.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm font-medium text-green-600">Queue is empty</p>
              <p className="text-xs text-gray-400 mt-1">All actions have been reviewed</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
              {queue.map(req => {
                const cfg = urgCfg(req.urgency)
                return (
                  <button
                    key={req.id}
                    onClick={() => { setSelectedId(req.id); setActionError(''); setRejectNote(''); setApproveNote(''); setShowApproveNote(false) }}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-l-2 ${selectedId === req.id ? 'bg-cyan-50 border-l-cyan-400' : `border-l-transparent`}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{req.action_title}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{req.action_type}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <TimeAgo iso={req.created_at} />
                          {req.expires_at && <ExpiresIn iso={req.expires_at} />}
                        </div>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel — right */}
        <div className="col-span-3">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 h-full flex items-center justify-center p-8 text-center">
              <div>
                <p className="text-3xl mb-3">👆</p>
                <p className="text-sm font-medium text-gray-600">Select a request to review</p>
                <p className="text-xs text-gray-400 mt-1">Full details and approve/reject actions appear here</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

              {/* Title + urgency */}
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${urgCfg(selected.urgency).dot}`} />
                <div>
                  <h2 className="text-base font-bold text-gray-900">{selected.action_title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgCfg(selected.urgency).badge}`}>{urgCfg(selected.urgency).label}</span>
                    <span className="text-xs text-gray-400">{selected.action_type}</span>
                    <TimeAgo iso={selected.created_at} />
                  </div>
                </div>
              </div>

              {/* Description */}
              {selected.action_description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.action_description}</p>
                </div>
              )}

              {/* Payload */}
              {selected.action_payload && Object.keys(selected.action_payload).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Action Payload</p>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-gray-700">
                    {JSON.stringify(selected.action_payload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Expiry */}
              {selected.expires_at && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>⏱</span>
                  <ExpiresIn iso={selected.expires_at} />
                  <span>· Expires {new Date(selected.expires_at).toLocaleString()}</span>
                </div>
              )}

              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{actionError}</div>
              )}

              {/* Approve section */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {showApproveNote && (
                  <textarea
                    value={approveNote}
                    onChange={e => setApproveNote(e.target.value)}
                    placeholder="Optional note for the audit trail…"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => showApproveNote ? handleApprove(selected.id) : setShowApproveNote(true)}
                    disabled={acting}
                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                  >
                    {acting ? 'Processing…' : showApproveNote ? '✓ Confirm Approve' : '✓ Approve'}
                  </button>
                  {showApproveNote && (
                    <button onClick={() => setShowApproveNote(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  )}
                </div>
              </div>

              {/* Reject section */}
              <div className="space-y-2">
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  placeholder="Reason for rejection (required)…"
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
                <button
                  onClick={() => handleReject(selected.id)}
                  disabled={acting || !rejectNote.trim()}
                  className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  ✕ Reject
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
