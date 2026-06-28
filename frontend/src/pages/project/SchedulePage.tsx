import { useEffect, useState } from 'react'
import { schedules as schedulesApi, type Schedule } from '../../lib/api'

export default function SchedulePage() {
  const [items, setItems] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [cron, setCron] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    schedulesApi.list()
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!name || !cron) return
    setSaving(true)
    setSaveError('')
    try {
      const created = await schedulesApi.create({ name, cron_expression: cron })
      setItems(prev => [created, ...prev])
      setName(''); setCron('')
      setShowCreate(false)
    } catch (e) {
      setSaveError((e as Error).message || 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await schedulesApi.delete(id)
      setItems(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      setError((e as Error).message || 'Failed to delete schedule')
    }
  }

  async function handleToggle(s: Schedule) {
    try {
      const updated = await schedulesApi.update(s.id, { status: s.status === 'active' ? 'paused' : 'active' })
      setItems(prev => prev.map(x => x.id === s.id ? updated : x))
    } catch (e) {
      setError((e as Error).message || 'Failed to update schedule')
    }
  }

  async function handlePauseAll() {
    try {
      await schedulesApi.pauseAll()
      setItems(prev => prev.map(s => ({ ...s, status: 'paused' as const })))
    } catch (e) {
      setError((e as Error).message || 'Failed to pause schedules')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Schedules</h1>
        <div className="flex gap-2">
          <button onClick={handlePauseAll} className="flex items-center gap-1 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">⏸ Pause all</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-600">+ Add Schedule</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">Loading schedules…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-gray-300 text-5xl mb-4">🕐</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No schedules configured</h2>
          <p className="text-gray-400 text-sm mb-6">Schedule evaluations by adding a schedule.</p>
          <button onClick={() => setShowCreate(true)} className="bg-cyan-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-cyan-600">+ Add Schedule</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase gap-4">
            <span>Name</span><span>Frequency</span><span>Status</span><span></span>
          </div>
          {items.map(s => (
            <div key={s.id} className="grid grid-cols-[1fr_1fr_auto_auto] px-5 py-4 border-b border-gray-100 text-sm items-center gap-4">
              <span className="font-medium text-gray-900">{s.name}</span>
              <span className="text-gray-500 font-mono text-xs">{s.cron_expression}</span>
              <button
                onClick={() => handleToggle(s)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {s.status === 'active' ? 'Active' : 'Paused'}
              </button>
              <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">🕐 Create Schedule</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {saveError && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NAME <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Nightly regression" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FREQUENCY (CRON) <span className="text-red-500">*</span></label>
                <select value={cron} onChange={e => setCron(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none">
                  <option value="">Select a preset</option>
                  <option value="0 0 * * *">Daily at midnight (0 0 * * *)</option>
                  <option value="0 */6 * * *">Every 6 hours (0 */6 * * *)</option>
                  <option value="0 0 * * 1">Weekly on Monday (0 0 * * 1)</option>
                  <option value="0 9 * * 1-5">Weekdays at 9am (0 9 * * 1-5)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">UTC. Standard 5-field cron (minute hour day month weekday).</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !name || !cron} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-60">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
