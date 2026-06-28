import { useEffect, useState } from 'react'
import { approvalGateway } from '../../lib/api'
import type { ApprovalRequest } from '../../lib/api'

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'Approved',  color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expired',   color: 'bg-gray-100 text-gray-500' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-400' },
}

const URGENCY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-yellow-400', low: 'bg-gray-300',
}

export default function ApprovalsHistoryPage() {
  const [items, setItems] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState('')

  function load() {
    setLoading(true)
    setFetchError('')
    approvalGateway.history({ status: statusFilter || undefined, limit: 100 })
      .then(setItems)
      .catch(e => setFetchError(e instanceof Error ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Approval History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete audit trail — every request, every decision, every note</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button onClick={load} className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">↻ Refresh</button>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{fetchError}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs text-gray-400">{items.length} record{items.length !== 1 ? 's' : ''}</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading history…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No approval requests yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map(r => {
              const sc = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
              const isOpen = expanded === r.id
              return (
                <div key={r.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${URGENCY_DOT[r.urgency] ?? 'bg-gray-300'}`} />
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{r.action_title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{r.action_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sc.color}`}>{sc.label}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                      <span className="text-xs text-gray-300">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100 space-y-3">
                      <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-1">Request ID</p>
                          <p className="font-mono text-gray-600">{r.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-1">Agent</p>
                          <p className="text-gray-600">{r.agent_id ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-1">Submitted</p>
                          <p className="text-gray-600">{new Date(r.created_at).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase tracking-wide mb-1">Decided</p>
                          <p className="text-gray-600">{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : '—'}</p>
                        </div>
                      </div>

                      {r.action_description && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Description</p>
                          <p className="text-sm text-gray-700">{r.action_description}</p>
                        </div>
                      )}

                      {r.action_payload && Object.keys(r.action_payload).length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payload</p>
                          <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-32 text-gray-700">
                            {JSON.stringify(r.action_payload, null, 2)}
                          </pre>
                        </div>
                      )}

                      {r.review_note && (
                        <div className={`rounded-lg p-3 ${r.status === 'rejected' ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                          <p className="text-xs font-medium text-gray-500 mb-1">{r.status === 'rejected' ? 'Rejection reason' : 'Approval note'}</p>
                          <p className="text-sm text-gray-700">{r.review_note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
