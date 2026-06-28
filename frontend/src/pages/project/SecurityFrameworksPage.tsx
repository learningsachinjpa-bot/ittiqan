import { useNavigate, useParams } from 'react-router-dom'

const FRAMEWORKS = [
  {
    id: 'owasp-llm',
    name: 'OWASP Top 10 for LLMs',
    version: 'v2025',
    desc: 'OWASP TOP 10 FOR LARGE LANGUAGE MODEL APPLICATIONS 2025',
    longDesc: 'A comprehensive list of the most critical security risks associated with LLM applications. The 2025 edition includes 10 critical risks covering prompt...',
    layers: ['App Layer', 'Synthetic Prompts'],
    categories: 10,
    vulnTypes: 114,
    color: 'text-red-500',
    icon: '🛡',
  },
  {
    id: 'owasp-agents',
    name: 'OWASP Top 10 for Agents',
    version: 'v2026',
    desc: 'OWASP TOP 10 FOR AGENTIC AI SYSTEMS (ASI) 2026',
    longDesc: 'A comprehensive list of the most critical security risks associated with agentic AI applications. The 2026 edition focuses on failures introduced...',
    layers: ['App Layer', 'Synthetic Prompts'],
    categories: 10,
    vulnTypes: 84,
    color: 'text-orange-500',
    icon: '🤖',
  },
  {
    id: 'nist',
    name: 'NIST AI Risk Management Framework',
    version: 'v1.0',
    desc: 'NIST AI RMF (NIST AI 100-1)',
    longDesc: 'A structured methodology from NIST for identifying, evaluating, and mitigating risks in AI systems. This implementation focuses on the...',
    layers: ['App Layer', 'Synthetic Prompts'],
    categories: 4,
    vulnTypes: 77,
    color: 'text-gray-600',
    icon: '🏛',
  },
  {
    id: 'mitre',
    name: 'MITRE ATLAS',
    version: 'v4.0',
    desc: 'MITRE ATLAS (ADVERSARIAL THREAT LANDSCAPE FOR AI SYSTEMS)',
    longDesc: 'A structured knowledge base of adversarial tactics, techniques, and procedures (TTPs) used against AI and ML systems. Extends MITRE...',
    layers: ['App Layer', 'Synthetic Prompts'],
    categories: 6,
    vulnTypes: 57,
    color: 'text-purple-500',
    icon: '🎯',
  },
]

export default function SecurityFrameworksPage() {
  const navigate = useNavigate()
  const { id } = useParams()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Security Frameworks</h1>
        <p className="text-gray-500 text-sm">Select a compliance framework to red team your AI system against industry standards.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FRAMEWORKS.map(f => (
          <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-cyan-300 transition-all cursor-pointer" onClick={() => navigate(`/project/${id}/security/assessments`)}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-2xl ${f.color}`}>{f.icon}</span>
              <span className="text-xs text-gray-400 font-mono">{f.version}</span>
            </div>
            <h3 className="font-bold text-gray-900 mb-1">{f.name}</h3>
            <p className="text-xs text-gray-400 mb-2">{f.desc}</p>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">{f.longDesc}</p>
            <div className="flex gap-2 mb-3">
              {f.layers.map(l => <span key={l} className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded">{l}</span>)}
            </div>
            <div className="flex gap-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
              <span><span className="font-semibold text-gray-700">{f.categories}</span> categories</span>
              <span><span className="font-semibold text-gray-700">{f.vulnTypes}</span> vuln types</span>
            </div>
          </div>
        ))}

        {/* Custom Framework Builder */}
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-5 hover:border-cyan-400 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <span className="text-cyan-500 font-semibold text-sm">+ Custom Framework Builder</span>
            <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded font-medium">CUSTOM</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">BUILD YOUR OWN SUITE</p>
          <p className="text-sm text-gray-600 mb-4">Compose your own risk categories from 35 vulnerability classes and 26 adversarial attack methods.</p>
          <div className="flex gap-2 mb-4">
            <span className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded">App Layer</span>
            <span className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded">Synthetic Prompts</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-400 mb-4 border-t border-gray-100 pt-3">
            <span><span className="font-semibold text-gray-700">35</span> classes</span>
            <span><span className="font-semibold text-gray-700">26</span> attacks</span>
          </div>
          <button className="w-full border border-cyan-400 text-cyan-600 text-sm py-2 rounded-lg hover:bg-cyan-50">Open Builder →</button>
        </div>
      </div>
    </div>
  )
}
