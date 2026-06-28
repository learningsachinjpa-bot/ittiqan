import { useEffect, useState, useCallback } from 'react'
import { orgs } from '../../lib/api'
import type { AuditLogEntry } from '../../lib/api'
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react'

// ─── Action category groupings ───────────────────────────────────────────────

const ACTION_GROUPS: Record<string, { label: string; color: string; actions: string[] }> = {
  auth: {
    label: 'Authentication',
    color: 'bg-blue-100 text-blue-700',
    actions: ['auth.login', 'auth.google_login', 'auth.logout'],
  },
  agent: {
    label: 'Agents',
    color: 'bg-cyan-100 text-cyan-700',
    actions: ['agent.create', 'agent.update', 'agent.delete'],
  },
  evaluation: {
    label: 'Evaluations',
    color: 'bg-purple-100 text-purple-700',
    actions: ['evaluation.create', 'evaluation.results.export'],
  },
  dataset: {
    label: 'Datasets',
    color: 'bg-indigo-100 text-indigo-700',
    actions: ['dataset.upload', 'dataset.add_cases', 'dataset.remove_case', 'dataset.delete'],
  },
  alert: {
    label: 'Alerts',
    color: 'bg-amber-100 text-amber-700',
    actions: ['alert.create', 'alert.delete', 'alert.channels.update'],
  },
  incident: {
    label: 'Incidents',
    color: 'bg-orange-100 text-orange-700',
    actions: ['incident.create', 'incident.resolve'],
  },
  member: {
    label: 'Team',
    color: 'bg-green-100 text-green-700',
    actions: ['member.invite', 'create'],
  },
  schedule: {
    label: 'Schedules',
    color: 'bg-teal-100 text-teal-700',
    actions: ['schedule.create', 'schedule.update', 'schedule.delete', 'schedule.pause_all'],
  },
  llm: {
    label: 'Models',
    color: 'bg-pink-100 text-pink-700',
    actions: ['llm_provider.create', 'llm_provider.update', 'llm_provider.delete'],
  },
}

function getActionGroup(action: string) {
  for (const [, group] of Object.entries(ACTION_GROUPS)) {
    if (group.actions.includes(action)) return group
  }
  return { label: 'Other', color: 'bg-gray-100 text-gray-600', actions: [] }
}

function formatAction(action: string): string {
  return action
    .replace(/\./g, ' › ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatResourceType(rt: string): string {
  return rt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UserCell({ user }: { user: AuditLogEntry['user'] }) {
  if (!user) return <span className="text-gray-400 text-sm">—</span>
  return (
    <div className="flex items-center gap-2">
      {user.picture
        ? <img src={user.picture} alt={user.name || 'User'} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
        : <div className="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0 text-xs text-cyan-700 font-bold">{(user.name || user.email || '?')[0].toUpperCase()}</div>
      }
      <div className="min-w-0">
        <p className="text-sm text-gray-900 truncate">{user.name || '—'}</p>
        <p className="text-xs text-gray-400 truncate">{user.email || user.id}</p>
      </div>
    </div>
  )
}

function LogRow({ entry, expanded, onToggle }: { entry: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  const group = getActionGroup(entry.action)
  const ts = new Date(entry.created_at)
  const dateStr = ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-3 pl-4 pr-2 w-5">
          {entry.details
            ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />)
            : <span className="w-3.5 h-3.5 block" />
          }
        </td>
        <td className="py-3 pr-4 whitespace-nowrap">
          <p className="text-sm text-gray-900">{dateStr}</p>
          <p className="text-xs text-gray-400">{timeStr}</p>
        </td>
        <td className="py-3 pr-4">
          <UserCell user={entry.user} />
        </td>
        <td className="py-3 pr-4">
          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${group.color}`}>
            {formatAction(entry.action)}
          </span>
        </td>
        <td className="py-3 pr-4">
          <span className="text-sm text-gray-600">{formatResourceType(entry.resource_type)}</span>
          {entry.resource_id && (
            <p className="text-xs text-gray-400 font-mono truncate max-w-32">{entry.resource_id}</p>
          )}
        </td>
        <td className="py-3 pr-4">
          <span className="text-xs text-gray-400">{entry.ip_address || '—'}</span>
        </td>
      </tr>
      {expanded && entry.details && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="py-2 pl-12 pr-4">
            <p className="text-sm text-gray-600">{entry.details}</p>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [actionGroup, setActionGroup] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')

  const load = useCallback(async (pg: number) => {
    setLoading(true)
    setError('')
    try {
      // Action group filtering is done client-side after fetching —
      // the backend takes a single exact action string, but groups contain multiple.
      const result = await orgs.auditLogs({
        resource_type: resourceType || undefined,
        since: since || undefined,
        until: until || undefined,
        limit: PAGE_SIZE,
        offset: pg * PAGE_SIZE,
      })
      // Client-side filter by action group
      const filtered = actionGroup && ACTION_GROUPS[actionGroup]
        ? result.items.filter(i => ACTION_GROUPS[actionGroup].actions.includes(i.action))
        : result.items
      setItems(filtered)
      setTotal(result.total)
      setPage(pg)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [actionGroup, resourceType, since, until])

  useEffect(() => { load(0) }, [load])

  function applyFilters() { load(0) }

  function clearFilters() {
    setActionGroup('')
    setResourceType('')
    setSince('')
    setUntil('')
  }

  function exportCsv() {
    const header = ['Timestamp', 'User Name', 'User Email', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address']
    const rows = items.map(e => [
      e.created_at,
      e.user?.name ?? '',
      e.user?.email ?? '',
      e.action,
      e.resource_type,
      e.resource_id ?? '',
      e.details ?? '',
      e.ip_address ?? '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit Log</h1>
          <p className="text-gray-500 text-sm">Every action taken by team members — who did what, when, and from where.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(page)}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-500 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={items.length === 0}
            className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="audit-action-group" className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select
            id="audit-action-group"
            value={actionGroup}
            onChange={e => setActionGroup(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">All categories</option>
            {Object.entries(ACTION_GROUPS).map(([key, g]) => (
              <option key={key} value={key}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-resource-type" className="block text-xs font-medium text-gray-500 mb-1">Resource Type</label>
          <select
            id="audit-resource-type"
            value={resourceType}
            onChange={e => setResourceType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="">All resources</option>
            {['agent', 'dataset', 'evaluation', 'alert', 'incident', 'schedule', 'llm_provider', 'organization', 'user'].map(r => (
              <option key={r} value={r}>{formatResourceType(r)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-since" className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            id="audit-since"
            type="date"
            value={since}
            onChange={e => setSince(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label htmlFor="audit-until" className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            id="audit-until"
            type="date"
            value={until}
            onChange={e => setUntil(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <button
          onClick={applyFilters}
          className="bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          Apply
        </button>
        {(actionGroup || resourceType || since || until) && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-5 py-3 pl-4" />
              <th className="py-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
              <th className="py-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
              <th className="py-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
              <th className="py-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Resource</th>
              <th className="py-3 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td colSpan={6} className="py-3 px-4">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                  No audit log entries found for the selected filters.
                </td>
              </tr>
            ) : (
              items.map(entry => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} entries
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => load(page - 1)}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const pg = totalPages <= 7 ? i : page < 4 ? i : page > totalPages - 5 ? totalPages - 7 + i : page - 3 + i
                return (
                  <button
                    key={pg}
                    onClick={() => load(pg)}
                    disabled={loading}
                    className={`px-3 py-1.5 text-sm border rounded-lg ${pg === page ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} disabled:opacity-40`}
                  >
                    {pg + 1}
                  </button>
                )
              })}
              <button
                onClick={() => load(page + 1)}
                disabled={page >= totalPages - 1 || loading}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
