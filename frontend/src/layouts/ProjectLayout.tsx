import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, LayoutDashboard, SlidersHorizontal, Database, PlayCircle, Clock, Shield, BarChart2, Activity, Bell, Monitor, TestTube, Zap, ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function ProjectLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()
  const [showUser, setShowUser] = useState(false)
  const [evalOpen, setEvalOpen] = useState(true)
  const [secOpen, setSecOpen] = useState(true)
  const [relOpen, setRelOpen] = useState(false)
  const [obsOpen, setObsOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const base = `/project/${id}`

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-60 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-700 flex items-center gap-2">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">I</span>
          </div>
          <div>
            <div className="text-white font-bold text-sm">Ittiqan</div>
            <div className="text-gray-400 text-xs">Enterprise</div>
          </div>
        </div>

        <div className="p-3 border-b border-gray-700">
          <button onClick={() => navigate('/dashboard/agents')} className="flex items-center gap-1 text-gray-400 text-xs hover:text-white mb-2">
            <ChevronLeft className="w-3 h-3" /> Back to Registry
          </button>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-xs text-gray-400 uppercase">Project</div>
            <div className="text-white text-sm font-mono">#{id}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 px-2">Navigation</p>

          <NavLink to={base} end className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            <LayoutDashboard className="w-4 h-4" /> Overview
          </NavLink>
          <NavLink to={`${base}/metrics`} className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Metrics Configurations
          </NavLink>

          <button onClick={() => setEvalOpen(!evalOpen)} className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white text-xs">
            <span className="flex items-center gap-2"><PlayCircle className="w-4 h-4" />Evaluate</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${evalOpen ? 'rotate-180' : ''}`} />
          </button>
          {evalOpen && (
            <div className="ml-4 space-y-1">
              {[{ to: `${base}/datasets`, label: 'Datasets', icon: Database }, { to: `${base}/evaluations`, label: 'Evaluations', icon: PlayCircle }, { to: `${base}/schedule`, label: 'Schedule', icon: Clock }].map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <item.icon className="w-3 h-3" /> {item.label}
                </NavLink>
              ))}
            </div>
          )}

          <button onClick={() => setSecOpen(!secOpen)} className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white text-xs">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Security</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${secOpen ? 'rotate-180' : ''}`} />
          </button>
          {secOpen && (
            <div className="ml-4 space-y-1">
              {[{ to: `${base}/security/frameworks`, label: 'Frameworks', icon: Shield }, { to: `${base}/security/assessments`, label: 'Assessments', icon: BarChart2 }].map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <item.icon className="w-3 h-3" /> {item.label}
                </NavLink>
              ))}
            </div>
          )}

          <button onClick={() => setRelOpen(!relOpen)} className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white text-xs">
            <span className="flex items-center gap-2"><Activity className="w-4 h-4" />Reliability</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${relOpen ? 'rotate-180' : ''}`} />
          </button>
          {relOpen && (
            <div className="ml-4 space-y-1">
              {[{ to: `${base}/reliability/uptime`, label: 'Uptime', icon: Activity }, { to: `${base}/reliability/incidents`, label: 'Incidents', icon: Activity }].map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <item.icon className="w-3 h-3" /> {item.label}
                </NavLink>
              ))}
            </div>
          )}

          <button onClick={() => setObsOpen(!obsOpen)} className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white text-xs">
            <span className="flex items-center gap-2"><Monitor className="w-4 h-4" />Observability</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${obsOpen ? 'rotate-180' : ''}`} />
          </button>
          {obsOpen && (
            <div className="ml-4 space-y-1">
              {[{ to: `${base}/observability/traces`, label: 'Traces', icon: Monitor }, { to: `${base}/observability/alerts`, label: 'Alerts', icon: Bell }].map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <item.icon className="w-3 h-3" /> {item.label}
                </NavLink>
              ))}
            </div>
          )}

          <button onClick={() => setTestOpen(!testOpen)} className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-white text-xs">
            <span className="flex items-center gap-2"><TestTube className="w-4 h-4" />Testing & Validations</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${testOpen ? 'rotate-180' : ''}`} />
          </button>
          {testOpen && (
            <div className="ml-4 space-y-1">
              <NavLink to={`${base}/testing`} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <TestTube className="w-3 h-3" /> Test History
              </NavLink>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="bg-gradient-to-br from-cyan-600 to-indigo-700 rounded-xl p-3 text-white">
            <div className="flex items-center gap-1 mb-2"><Zap className="w-3 h-3" /><span className="font-semibold text-xs">Upgrade & unlock all features</span></div>
            <button className="w-full bg-white text-cyan-600 text-xs font-medium py-1.5 rounded-lg">Select a Plan</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <nav className="text-sm text-gray-500 flex items-center gap-1">
            <button onClick={() => navigate('/dashboard')} className="hover:text-gray-700">Home</button>
            <span>›</span>
            <button onClick={() => navigate('/dashboard/agents')} className="hover:text-gray-700">Agents Registry</button>
            <span>›</span>
            <span className="text-gray-900">Analysis</span>
          </nav>
          <div className="flex items-center gap-3">
            <button className="text-gray-400 hover:text-gray-600">🌙</button>
            <Bell className="w-5 h-5 text-gray-400" />
            <div className="relative">
              <button onClick={() => setShowUser(!showUser)} className="flex items-center gap-2 text-sm text-gray-700">
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white text-xs font-medium">{user?.name?.[0]?.toUpperCase()}</div>
                <span>{user?.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showUser && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
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
