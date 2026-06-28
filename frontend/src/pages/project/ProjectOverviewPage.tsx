import { useNavigate, useParams } from 'react-router-dom'

export default function ProjectOverviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const base = `/project/${id}`

  const stats = [
    { label: 'OVERALL SCORE', value: '—', sub: 'avg of 0 runs', color: 'text-gray-400' },
    { label: 'PASS RATE', value: '—', sub: 'avg of 0 runs', color: 'text-gray-400', icon: '✓' },
    { label: 'SECURITY', value: '—', sub: 'No scans yet', color: 'text-gray-400', icon: '🛡' },
    { label: 'UPTIME', value: '0.0%', sub: 'No smoke tests', color: 'text-red-500' },
    { label: 'P95 LATENCY', value: '—', sub: 'No traces yet', color: 'text-gray-400' },
    { label: 'TOTAL EVALUATIONS', value: '0', sub: 'No runs yet', color: 'text-gray-900' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analysis</h1>
          <p className="text-gray-500 text-sm">Operational overview — quality, security, runtime and reliability at a glance.</p>
        </div>
        <div className="flex gap-2 text-sm">
          {['24h', '7d', '30d'].map(t => (
            <button key={t} className={`px-3 py-1.5 rounded ${t === '30d' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-6 text-xs">
        {['Multi-Turn Conversation', 'RAG', 'Safety & Guardrails', 'Images (Multimodal)', 'Agentic AI'].map(tag => (
          <span key={tag} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{tag}</span>
        ))}
        <span className="text-gray-400">#{id} · Created 1 minute ago · Evaluations 0</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{s.icon && <span className="mr-1">{s.icon}</span>}{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mb-1`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-4 flex items-center gap-2">📈 Evaluation Score Trend</h3>
          <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No evaluations in this range</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700 text-sm">🔔 Weakest Metrics</h3>
            <button onClick={() => navigate(`${base}/metrics`)} className="text-xs text-cyan-600 hover:underline">View all</button>
          </div>
          <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No metric breakdown yet</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700 text-sm">🛡 Security Posture</h3>
            <button onClick={() => navigate(`${base}/security/assessments`)} className="text-xs text-cyan-600 hover:underline">View scans</button>
          </div>
          <div className="h-24 flex items-center justify-center text-gray-300 text-sm">No security scans yet</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-4">⚡ Latency (p50 / p95 / p99)</h3>
          <div className="h-24 flex items-center justify-center text-gray-300 text-sm">No runtime traces in this range</div>
        </div>
      </div>

      {/* Endpoint uptime & alerts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700 text-sm">☁ Endpoint Uptime</h3>
            <button className="text-xs text-cyan-600 hover:underline">Details</button>
          </div>
          <div className="h-16 flex items-center justify-center text-gray-300 text-sm">No smoke tests yet</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700 text-sm">🔔 Firing Alerts</h3>
            <button className="text-xs text-cyan-600 hover:underline">All alerts</button>
          </div>
          <div className="h-16 flex items-center justify-center text-gray-300 text-sm">No firing alerts — all clear</div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-3">💡 Recommendations</h3>
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ All systems healthy — No issues detected across quality, security, runtime and uptime signals.
        </div>
      </div>

      {/* Recent evaluations */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold text-gray-700 text-sm mb-4">🔄 Recent Evaluations</h3>
        <div className="h-16 flex items-center justify-center text-gray-300 text-sm">No evaluations yet</div>
      </div>

      {/* Configured metrics & environment */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">⚙ Configured Metrics</h3>
            <button onClick={() => navigate(`${base}/metrics`)} className="text-xs text-cyan-600 hover:underline">Manage</button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {['Knowledge Retention', 'Role Adherence', 'Turn Relevancy', 'Goal Accuracy', 'Topic Adherence', 'Turn Contextual Precision'].map(m => (
              <span key={m}>• {m}</span>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">🌐 Environment</h3>
          <div className="space-y-2 text-xs">
            {[['Endpoint', 'https://api.dify.ai/v1'], ['Response type', 'json'], ['Auth', 'None'], ['Metric mode', 'capability']].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-gray-400">{k}</span><span className="text-gray-700">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
