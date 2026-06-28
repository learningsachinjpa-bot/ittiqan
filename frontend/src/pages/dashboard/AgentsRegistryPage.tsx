import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid, List, Search, Edit2, Trash2, ArrowRight } from 'lucide-react'
import { agents as agentsApi } from '../../lib/api'

export default function AgentsRegistryPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    agentsApi.list()
      .then(setAgents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await agentsApi.delete(deleteId)
      setAgents(prev => prev.filter(a => a.id !== deleteId))
      setDeleteId(null)
    } catch (err: any) {
      alert(err.message || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))

  const statusColor = (status: string) =>
    status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const timeAgo = (iso: string) => {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents Registry</h1>
          <p className="text-gray-500 text-sm">Manage and monitor all connected AI agents in one centralized registry.</p>
        </div>
        <button onClick={() => navigate('/dashboard/agents/connect')} className="flex items-center gap-2 bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-600">
          + Connect Agent
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents registry..." className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-72 focus:outline-none focus:border-cyan-400" />
        </div>
        <div className="flex gap-1">
          <button onClick={() => setView('grid')} className={`p-2 rounded ${view === 'grid' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}><Grid className="w-4 h-4" /></button>
          <button onClick={() => setView('list')} className={`p-2 rounded ${view === 'list' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-gray-600'}`}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🤖</div>
          <p className="text-gray-500 font-medium mb-1">No agents connected yet</p>
          <p className="text-gray-400 text-sm mb-6">Connect your first AI agent to start evaluating and securing it.</p>
          <button onClick={() => navigate('/dashboard/agents/connect')} className="bg-cyan-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-cyan-600">+ Connect Agent</button>
        </div>
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
          {filtered.map(agent => (
            <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${statusColor(agent.status)}`}>{agent.status}</span>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/dashboard/agents/connect?edit=${agent.id}`)} className="text-gray-400 hover:text-gray-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteId(agent.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{agent.name}</h3>
              <p className="text-gray-400 text-xs mb-3">{agent.description || 'No description available.'}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {(agent.tags || []).map((t: string) => <span key={t} className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-400">
                <div className="flex justify-between"><span>⏱ Last evaluated</span><span>{agent.last_evaluated_at ? timeAgo(agent.last_evaluated_at) : 'Never'}</span></div>
                <div className="flex justify-between"><span>⚙ LLM Judge</span><span className="text-cyan-600">{agent.llm_judge_provider || 'Not set'}</span></div>
                <div className="flex justify-between"><span>📅 Created</span><span>{formatDate(agent.created_at)}</span></div>
              </div>
              <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {agent.enable_multi_turn ? '💬 Multi-turn' : '💬 Single-turn'}
                  {agent.endpoint_url ? ' · 🔗 Connected' : ' · ⚠ No endpoint'}
                </span>
                <button onClick={() => navigate(`/dashboard/quickstart/${agent.id}`)} title="Integration guide" className="text-gray-400 hover:text-cyan-600 text-xs font-medium">{'</>'}</button>
                <button onClick={() => navigate(`/project/${agent.id}`)} className="text-cyan-500 hover:text-cyan-600"><ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-sm text-gray-400">
        Showing {filtered.length} of {agents.length} agents
      </div>

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Agent</h3>
            <p className="text-gray-500 text-sm mb-4">This will permanently delete the agent and all its evaluation history. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
