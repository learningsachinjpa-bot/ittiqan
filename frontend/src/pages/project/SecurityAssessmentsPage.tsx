import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { security as securityApi, llmProviders, getWsUrl } from '../../lib/api'
import type { LLMProvider, SecurityAssessment } from '../../types'
import { Shield, AlertTriangle, ChevronRight, ChevronDown, Play, AlertCircle } from 'lucide-react'

const FRAMEWORKS: Record<string, { label: string; description: string; icon: string; categories: string[] }> = {
  owasp_llm: {
    label: 'OWASP LLM Top 10 (2025)',
    description: 'Tests for the 10 most critical vulnerabilities in LLM applications including prompt injection, data poisoning, and insecure output handling.',
    icon: '🛡',
    categories: ['LLM01: Prompt Injection', 'LLM02: Sensitive Info Disclosure', 'LLM03: Supply Chain', 'LLM04: Data and Model Poisoning', 'LLM05: Insecure Output Handling', 'LLM06: Excessive Agency', 'LLM07: System Prompt Leakage', 'LLM08: Vector Weaknesses', 'LLM09: Misinformation', 'LLM10: Unbounded Consumption'],
  },
  owasp_agents: {
    label: 'OWASP Agents Top 10 (2026)',
    description: 'Specifically targets agentic AI systems — tool misuse, memory poisoning, orchestration attacks, and privilege escalation.',
    icon: '🤖',
    categories: ['AGENT01: Memory Poisoning', 'AGENT02: Tool Misuse', 'AGENT03: Orchestration Attack', 'AGENT04: Resource Exhaustion', 'AGENT05: Privilege Escalation'],
  },
  nist_ai_rmf: {
    label: 'NIST AI Risk Management Framework',
    description: 'Evaluates AI risks across four functions: GOVERN, MAP, MEASURE, MANAGE — aligned to US federal AI governance standards.',
    icon: '🏛',
    categories: ['GOVERN: Policies & Accountability', 'MAP: Risk Identification', 'MEASURE: Risk Analysis', 'MANAGE: Risk Response'],
  },
  mitre_atlas: {
    label: 'MITRE ATLAS',
    description: 'Adversarial Threat Landscape for AI Systems — real-world attack patterns from nation-state actors and advanced threat groups.',
    icon: '⚔',
    categories: ['Reconnaissance', 'Resource Development', 'Initial Access', 'Execution'],
  },
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Queued',     cls: 'bg-gray-100 text-gray-600' },
  running:   { label: 'Attacking',  cls: 'bg-orange-100 text-orange-600' },
  judging:   { label: 'Judging',    cls: 'bg-purple-100 text-purple-600' },
  completed: { label: 'Completed',  cls: 'bg-green-100 text-green-700' },
  failed:    { label: 'Failed',     cls: 'bg-red-100 text-red-700' },
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-blue-100 text-blue-700 border-blue-200',
  info:     'bg-gray-100 text-gray-600 border-gray-200',
}

type AttackWsMessage = { type: 'progress' | 'completed' | 'failed'; done?: number; total?: number; overall_risk_score?: number; passed_attacks?: number; failed_attacks?: number; error?: string; action?: string }

function LiveAttack({ assessmentId, onDone }: { assessmentId: string; onDone: (msg: AttackWsMessage) => void }) {
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentAttack, setCurrentAttack] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(`/security/${assessmentId}/ws`))
    wsRef.current = ws
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'progress') {
        setDone(msg.done)
        setTotal(msg.total)
        if (msg.finding?.category) setCurrentAttack(msg.finding.category)
      } else if (msg.type === 'completed' || msg.type === 'failed') {
        onDone(msg)
      }
    }
    return () => ws.close()
  }, [assessmentId])

  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const filled = Math.round(pct / 5)

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-orange-700">Generating & testing attacks...</span>
        <span className="text-xs text-orange-500">{done}/{total} attacks</span>
      </div>
      <div className="font-mono text-sm text-orange-600 mb-1">
        {'█'.repeat(filled)}{'░'.repeat(20 - filled)} {pct}%
      </div>
      {currentAttack && <p className="text-xs text-orange-500">Current: {currentAttack}</p>}
    </div>
  )
}

export default function SecurityAssessmentsPage() {
  const { id: agentId } = useParams<{ id: string }>()
  const [assessments, setAssessments] = useState<SecurityAssessment[]>([])
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)

  const [showNew, setShowNew] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedFramework, setSelectedFramework] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [numAttacks, setNumAttacks] = useState(5)
  const [attackerId, setAttackerId] = useState('')
  const [judgeId, setJudgeId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  const [liveRuns, setLiveRuns] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [findings, setFindings] = useState<Record<string, any[]>>({})

  useEffect(() => {
    if (!agentId) return
    Promise.all([securityApi.list(agentId), llmProviders.list()])
      .then(([ass, pr]) => {
        setAssessments(ass)
        setProviders(pr)
        const defAttacker = pr.find(p => p.is_default_attacker)
        const defJudge = pr.find(p => p.is_default_judge)
        if (defAttacker) setAttackerId(defAttacker.id)
        if (defJudge) setJudgeId(defJudge.id)
      }).catch(console.error).finally(() => setLoading(false))
  }, [agentId])

  const handleCreate = async () => {
    if (!selectedFramework) return setStartError('Select a framework.')
    setStarting(true)
    setStartError('')
    try {
      const ass = await securityApi.create({
        agent_id: agentId!,
        name: `${FRAMEWORKS[selectedFramework].label} — ${new Date().toLocaleDateString()}`,
        framework: selectedFramework,
        attack_categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        num_attacks_per_category: numAttacks,
        llm_attacker_provider_id: attackerId || undefined,
        llm_judge_provider_id: judgeId || undefined,
      })
      setAssessments(prev => [ass, ...prev])
      setLiveRuns(prev => new Set([...prev, ass.id]))
      setShowNew(false)
      setStep(1)
      setSelectedFramework('')
      setSelectedCategories([])
    } catch (e: any) {
      setStartError(e.message || 'Failed to start assessment.')
    } finally {
      setStarting(false)
    }
  }

  const loadFindings = async (id: string) => {
    if (findings[id]) { setExpandedId(id); return }
    const f = await securityApi.findings(id)
    setFindings(prev => ({ ...prev, [id]: f }))
    setExpandedId(id)
  }

  const onLiveDone = (id: string) => (msg: AttackWsMessage) => {
    setLiveRuns(prev => { const next = new Set(prev); next.delete(id); return next })
    setAssessments(prev => prev.map(a => a.id === id ? {
      ...a,
      status: msg.type === 'completed' ? 'completed' : 'failed',
      total_attacks: msg.total_attacks,
      vulnerable_count: msg.vulnerable_count,
      risk_score: msg.risk_score,
      error_message: msg.error,
    } : a))
  }

  const fw = selectedFramework ? FRAMEWORKS[selectedFramework] : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security Assessments</h1>
          <p className="text-sm text-gray-400 mt-0.5">Red-team your agent against OWASP, NIST AI RMF, and MITRE ATLAS using real adversarial attacks.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">
          <Shield className="w-4 h-4" /> New Assessment
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-2xl mb-4">🔬</div>
          <h2 className="text-base font-semibold text-gray-700 mb-1">No assessments yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-xs">Red-team your agent against real adversarial attack frameworks before deploying to production.</p>
          <button onClick={() => setShowNew(true)} className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">
            + New Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map(a => {
            const badge = STATUS_BADGE[a.status] || STATUS_BADGE.pending
            const riskColor = a.risk_score >= 0.7 ? 'text-red-600' : a.risk_score >= 0.4 ? 'text-amber-500' : 'text-green-600'
            return (
              <div key={a.id} className={`bg-white rounded-2xl border transition-all ${expandedId === a.id ? 'border-red-200 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="p-5 flex items-center gap-4">
                  <div className="text-2xl flex-shrink-0">{FRAMEWORKS[a.framework]?.icon || '🛡'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{a.name}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {a.risk_score != null && (
                      <div className="text-right">
                        <p className={`text-lg font-bold ${riskColor}`}>{Math.round(a.risk_score * 100)}%</p>
                        <p className="text-xs text-gray-400">risk score</p>
                      </div>
                    )}
                    {a.vulnerable_count != null && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        {a.vulnerable_count} vulnerable
                      </div>
                    )}
                    <button onClick={() => expandedId === a.id ? setExpandedId(null) : loadFindings(a.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                      {expandedId === a.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Live attack progress — UX-05 */}
                {liveRuns.has(a.id) && (
                  <div className="px-5 pb-4">
                    <LiveAttack assessmentId={a.id} onDone={onLiveDone(a.id)} />
                  </div>
                )}

                {/* UX-06: failure with next action */}
                {a.status === 'failed' && (
                  <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start gap-2 text-sm text-red-700">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">Assessment failed</p>
                        <p className="text-xs text-red-600 mt-0.5">{a.error_message || 'Check that your agent endpoint is reachable and an LLM attacker is configured.'}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowNew(true)} className="mt-2 text-xs text-red-600 font-semibold underline">Retry →</button>
                  </div>
                )}

                {/* Findings */}
                {expandedId === a.id && findings[a.id] && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 py-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Security Findings</span>
                      <span className="text-xs text-gray-400">{findings[a.id].length} total</span>
                    </div>
                    <div className="space-y-0 divide-y divide-gray-100">
                      {findings[a.id].map(f => (
                        <div key={f.id} className="px-5 py-3 flex items-start gap-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5 ${SEVERITY_BADGE[f.severity] || SEVERITY_BADGE.info}`}>
                            {f.severity}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{f.category}</p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{f.reason}</p>
                            {f.is_vulnerable && (
                              <div className="mt-1">
                                <p className="text-xs text-gray-500 font-medium">Attack prompt:</p>
                                <p className="text-xs text-gray-400 bg-gray-50 rounded p-1.5 mt-0.5 font-mono line-clamp-2">{f.attack_prompt}</p>
                              </div>
                            )}
                          </div>
                          <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${f.is_vulnerable ? 'bg-red-400' : 'bg-green-400'}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New assessment flow */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={() => { setShowNew(false); setStep(1) }} />
          <div className="relative bg-white w-full max-w-lg h-full flex flex-col shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-gray-900">New Security Assessment</h2>
                <button onClick={() => { setShowNew(false); setStep(1) }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              {/* Step indicators */}
              <div className="flex items-center gap-2 text-xs">
                {['Framework', 'Configure', 'Review'].map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {step > i + 1 ? '✓' : i + 1}
                    </div>
                    <span className={step === i + 1 ? 'text-gray-700 font-medium' : 'text-gray-400'}>{s}</span>
                    {i < 2 && <div className="w-6 h-px bg-gray-200" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Select the security framework to test against.</p>
                  {Object.entries(FRAMEWORKS).map(([key, fw]) => (
                    <button key={key} onClick={() => { setSelectedFramework(key); setSelectedCategories([]) }}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${selectedFramework === key ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xl">{fw.icon}</span>
                        <span className="font-semibold text-gray-900 text-sm">{fw.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed ml-8">{fw.description}</p>
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && fw && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attack categories</label>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedCategories.length === 0} onChange={() => setSelectedCategories([])} style={{ width: 'auto' }} />
                        <span className="text-sm font-medium text-gray-700">All categories ({fw.categories.length})</span>
                      </label>
                      {fw.categories.map(cat => (
                        <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer ml-4">
                          <input type="checkbox" checked={selectedCategories.includes(cat) || selectedCategories.length === 0}
                            onChange={e => setSelectedCategories(prev => e.target.checked ? [...prev, cat] : prev.filter(c => c !== cat))}
                            style={{ width: 'auto' }} />
                          <span className="text-sm text-gray-600">{cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Attacks per category</label>
                    <select value={numAttacks} onChange={e => setNumAttacks(Number(e.target.value))}>
                      <option value={3}>3 — Quick scan</option>
                      <option value={5}>5 — Standard</option>
                      <option value={10}>10 — Thorough</option>
                      <option value={20}>20 — Exhaustive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Attacker LLM</label>
                    <select value={attackerId} onChange={e => setAttackerId(e.target.value)}>
                      <option value="">Organization default</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.is_default_attacker ? ' ★' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Judge LLM</label>
                    <select value={judgeId} onChange={e => setJudgeId(e.target.value)}>
                      <option value="">Organization default</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.is_default_judge ? ' ★' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 3 && fw && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Framework</span><span className="font-medium text-gray-800">{fw.label}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Categories</span><span className="font-medium text-gray-800">{selectedCategories.length || fw.categories.length} selected</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Attacks per category</span><span className="font-medium text-gray-800">{numAttacks}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Total attacks</span><span className="font-bold text-gray-900">{(selectedCategories.length || fw.categories.length) * numAttacks}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Attacker</span><span className="font-medium text-gray-800">{providers.find(p => p.id === attackerId)?.name || 'Org default'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Judge</span><span className="font-medium text-gray-800">{providers.find(p => p.id === judgeId)?.name || 'Org default'}</span></div>
                  </div>
                  {startError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{startError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button onClick={() => step > 1 ? setStep(step - 1) : setShowNew(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                {step === 1 ? 'Cancel' : '← Back'}
              </button>
              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} disabled={step === 1 && !selectedFramework}
                  className="flex-1 py-2.5 text-sm bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50">
                  Next →
                </button>
              ) : (
                <button onClick={handleCreate} disabled={starting}
                  className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {starting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {starting ? 'Launching...' : '⚔ Launch Assessment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
