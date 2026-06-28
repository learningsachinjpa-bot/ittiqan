import { useNavigate } from 'react-router-dom'

export default function OverviewPage() {
  const navigate = useNavigate()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Operations Control Center</h1>
      <p className="text-gray-500 text-sm mb-8">Cross-agent health, quality, security and reliability across your connected fleet.</p>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-gray-300 text-6xl mb-4">⬡</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No agents connected yet</h2>
        <p className="text-gray-400 text-sm mb-6">Connect an agent in the Agents Registry to populate the control center.</p>
        <button onClick={() => navigate('/dashboard/agents/connect')} className="flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-cyan-600">
          + Connect Agent
        </button>
      </div>
    </div>
  )
}
