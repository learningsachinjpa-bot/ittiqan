import { useEffect, useState } from 'react'
import { orgs, type OrgMember } from '../../lib/api'

const ROLES = ['viewer', 'developer', 'qa', 'admin']

export default function TeamPage() {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('developer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    orgs.members()
      .then(setMembers)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

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
