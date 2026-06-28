import { useEffect, useState } from 'react'
import { orgs, type OrgMember, type NotificationPrefs } from '../../lib/api'

const ROLES = ['viewer', 'developer', 'qa', 'admin']

export default function TeamPage() {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // Notification preferences
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)

  useEffect(() => {
    orgs.members()
      .then(setMembers)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))

    orgs.getNotificationPrefs()
      .then(setPrefs)
      .catch(() => {}) // non-critical
      .finally(() => setPrefsLoading(false))
  }, [])

  async function handleTogglePref(key: keyof NotificationPrefs) {
    if (!prefs) return
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    setPrefsSaving(true)
    setPrefsSaved(false)
    try {
      await orgs.updateNotificationPrefs({ [key]: updated[key] })
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 2000)
    } catch {
      setPrefs(prefs) // rollback on error
    } finally {
      setPrefsSaving(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    try {
      const newMember = await orgs.invite(inviteEmail.trim(), inviteRole)
      setMembers(prev => [...prev, newMember])
      setInviteEmail('')
    } catch (e) {
      setInviteError((e as Error).message || 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Team & Access</h1>
      <p className="text-gray-500 text-sm mb-6">Manage your team members and their access levels.</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Invite Team Member</h2>
        {inviteError && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</div>
        )}
        <div className="flex gap-3">
          <input
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            placeholder="Enter email address..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="w-36 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
          >
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="bg-cyan-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-cyan-600 disabled:opacity-60"
          >
            {inviting ? 'Inviting…' : 'Send Invite'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">The user must already have an Ittiqan account.</p>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">My Notification Preferences</h2>
            <p className="text-xs text-gray-400 mt-0.5">Control which email notifications you receive for your account.</p>
          </div>
          {prefsSaved && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
          {prefsSaving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        {prefsLoading ? (
          <div className="text-sm text-gray-400">Loading preferences…</div>
        ) : prefs ? (
          <div className="space-y-4">
            {([
              { key: 'notify_on_new_approval' as const, label: 'New approval requests', desc: 'Receive an email when a new approval request arrives in the queue (admins and owners only).' },
              { key: 'notify_on_approval_decision' as const, label: 'Approval decisions', desc: 'Receive an email when a request you submitted is approved or rejected.' },
            ]).map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5 relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={() => handleTogglePref(key)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleTogglePref(key)}
                    className={`w-10 h-6 rounded-full transition-colors ${prefs[key] ? 'bg-cyan-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${prefs[key] ? 'left-5' : 'left-1'}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Could not load preferences.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Members ({loading ? '…' : members.length})</h2>
        </div>

        {error && (
          <div className="px-6 py-4 text-sm text-red-600">{error}</div>
        )}

        {loading ? (
          <div className="px-6 py-8 text-sm text-gray-400 text-center">Loading members…</div>
        ) : (
          members.map(m => {
            const initial = (m.name || m.email || '?')[0].toUpperCase()
            return (
              <div key={m.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  {m.picture ? (
                    <img src={m.picture} alt={m.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 bg-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-medium">{initial}</div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{m.name || '—'}</p>
                    <p className="text-gray-400 text-xs">{m.email}</p>
                  </div>
                </div>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium capitalize">{m.role}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
