import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, FolderOpen, Box, Users, CreditCard, BarChart2, Zap, ChevronDown, ShieldCheck, GitCompare } from 'lucide-react'
import { useState, useEffect } from 'react'
import { approvalGateway } from '../lib/api'

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showUser, setShowUser] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    function fetchPending() {
      approvalGateway.stats()
        .then(s => setPendingCount(s.pending))
        .catch(() => {})
    }
    fetchPending()
    const t = setInterval(fetchPending, 30000)
    return () => clearInterval(t)
  }, [])

  const navItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/agents', label: 'Agents Registry', icon: FolderOpen },
    { to: '/dashboard/compare', label: 'Compare Agents', icon: GitCompare },
  ]
  const platformItems = [{ to: '/dashboard/models', label: 'Models', icon: Box }]
  const adminItems = [{ to: '/dashboard/team', label: 'Team & Access', icon: Users }]
  const billingItems = [
    { to: '/dashboard/plan', label: 'Current Plan', icon: CreditCard },
    { to: '/dashboard/usage', label: 'Usage', icon: BarChart2 },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm">Ittiqan</div>
              <div className="text-gray-400 text-xs">Enterprise</div>
            </div>
          </div>
        </div>

        <div className="p-3 border-b border-gray-700">
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
            <div className="w-6 h-6 bg-cyan-500 rounded text-white text-xs flex items-center justify-center font-bold">
              {(user?.org?.name || user?.name || 'O')[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Organization</div>
              <div className="text-white text-sm font-medium">{user?.org?.name || user?.name?.split(' ')[0] || 'My Org'}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Main</p>
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Platform</p>
            {platformItems.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Governance</p>
            <NavLink
              to="/dashboard/approvals"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="flex-1">Approvals</span>
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/dashboard/approvals/history"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <ShieldCheck className="w-4 h-4 opacity-50" />
              <span>Approval History</span>
            </NavLink>
            <NavLink
              to="/dashboard/audit-log"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <ShieldCheck className="w-4 h-4 opacity-50" />
              <span>Audit Log</span>
            </NavLink>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Administration</p>
            {adminItems.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Billing & Usage</p>
            {billingItems.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="bg-gradient-to-br from-cyan-600 to-indigo-700 rounded-xl p-4 text-white">
            <div className="flex items-center gap-1 mb-2"><Zap className="w-4 h-4" /><span className="font-semibold text-sm">Upgrade & unlock all features</span></div>
            <button className="w-full bg-white text-cyan-600 text-sm font-medium py-1.5 rounded-lg hover:bg-cyan-50">Select a Plan</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <nav className="text-sm text-gray-500">Home</nav>
          <div className="flex items-center gap-3">
            <button className="text-gray-400 hover:text-gray-600">🌙</button>
            <button className="text-gray-400 hover:text-gray-600">🔔</button>
            <div className="relative">
              <button onClick={() => setShowUser(!showUser)} className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-medium text-xs overflow-hidden">{user?.picture ? <img src={user.picture} alt={user.name || 'Profile'} className="w-full h-full object-cover" /> : (user?.name?.[0] || 'U').toUpperCase()}</div>
                <span>{user?.name || 'User'}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showUser && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <button onClick={() => { logout(); navigate('/login') }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
