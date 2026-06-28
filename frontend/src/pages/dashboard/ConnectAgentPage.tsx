import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { agents as agentsApi, llmProviders } from '../../lib/api'
import type { LLMProvider } from '../../types'

const STEPS = ['Basics', 'Evaluation', 'Metrics', 'API Config', 'LLM Judge']

// id = backend snake_case key — matches DeepEval metric class names
// testCaseType: which DeepEval test case schema this metric requires
//   'llm'           = LLMTestCase (standard input/output)
//   'llm+retrieval' = LLMTestCase with retrieval_context (RAG)
//   'llm+turns'     = ConversationalTestCase (multi-turn chatbot)
//   'llm+tools'     = AgenticTestCase with tools_called (agent/MCP)
// universal = true → applies to every agent type as a safety overlay (bias, toxicity, etc.)
const ALL_METRICS = [
  // ── RAG — require retrieval_context (LLMTestCase + retrieval) ─────────────
  { id: 'faithfulness',           name: 'Faithfulness',               threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Every claim in the answer must be supported by retrieved context. Catches hallucinations grounded in retrieval.' },
  { id: 'contextual_precision',   name: 'Contextual Precision',       threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Are the most relevant chunks ranked first? Penalizes retrievers that bury signal under noise.' },
  { id: 'contextual_recall',      name: 'Contextual Recall',          threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Does the retrieved context contain all facts needed to answer the question?' },
  { id: 'contextual_relevancy',   name: 'Contextual Relevancy',       threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Signal-to-noise ratio of retrieved chunks. Penalizes off-topic or redundant chunks.' },
  { id: 'hallucination',          name: 'Hallucination',              threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Detects factual claims that contradict or are absent from the provided context.' },
  { id: 'summarization',          name: 'Summarization',              threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+retrieval', universal: false, desc: 'Measures summary quality via alignment (no contradictions) + coverage (key points present).' },
  { id: 'citation_quality',       name: 'Citation & Attribution',     threshold: 0.7, category: 'Enterprise Compliance', testCaseType: 'llm+retrieval', universal: false, desc: 'Validates that every factual claim is properly attributed to the correct source document.' },

  // ── Conversational — require ConversationalTestCase (turns) ───────────────
  { id: 'knowledge_retention',    name: 'Knowledge Retention',        threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+turns', universal: false, desc: 'Does the model correctly recall facts stated in earlier turns? Penalizes within-session amnesia.' },
  { id: 'role_adherence',         name: 'Role Adherence',             threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+turns', universal: false, desc: 'Does the model maintain its assigned persona and constraints across all turns?' },
  { id: 'conversation_relevancy', name: 'Turn Relevancy',             threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm+turns', universal: false, desc: "Is each response directly relevant to what the user said in that specific turn?" },
  { id: 'conversation_completeness', name: 'Conversation Completeness', threshold: 0.7, category: 'Quality/Accuracy', testCaseType: 'llm+turns', universal: false, desc: 'Did the conversation reach a natural conclusion that fully satisfied the user goal?' },
  { id: 'escalation_compliance',  name: 'Escalation Compliance',      threshold: 0.8, category: 'Enterprise Compliance', testCaseType: 'llm+turns', universal: false, desc: 'Did the chatbot correctly route sensitive topics or complaints to a human agent?' },

  // ── Agentic — require AgenticTestCase (tools_called / trace) ─────────────
  { id: 'task_completion',        name: 'Task Completion',            threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Did the agent fully achieve the user goal? Holistic end-to-end success measure.' },
  { id: 'tool_correctness',       name: 'Tool Correctness',           threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Did the agent call the right tools in the right order? Exact + semantic matching.' },
  { id: 'argument_correctness',   name: 'Argument Correctness',       threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Were the arguments passed to each tool call logically sound and correctly typed?' },
  { id: 'plan_quality',           name: 'Plan Quality',               threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: "Is the agent's generated plan complete, logically ordered, and feasible?" },
  { id: 'plan_adherence',         name: 'Plan Adherence',             threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Did actual execution match the stated plan? Detects mid-task drift.' },
  { id: 'step_efficiency',        name: 'Step Efficiency',            threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Penalizes redundant tool calls, retry loops, and unnecessary steps.' },
  { id: 'goal_accuracy',          name: 'Goal Accuracy',              threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Did the agent correctly decompose and understand the user goal before executing?' },

  // ── MCP — AgenticTestCase variant with MCP tool schema ────────────────────
  { id: 'mcp_use',                name: 'MCP-Use',                    threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Correct single-turn selection and invocation of MCP tools and resources.' },
  { id: 'multi_turn_mcp_use',     name: 'Multi-Turn MCP-Use',         threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Consistent and correct MCP tool usage across multiple conversation turns.' },
  { id: 'mcp_task_completion',    name: 'MCP Task Completion',        threshold: 0.7, category: 'Agentic/Tool Use',    testCaseType: 'llm+tools', universal: false, desc: 'Did the agent fully complete a task that specifically required MCP resources?' },

  // ── Standard LLM — LLMTestCase, no extra fields needed ────────────────────
  { id: 'answer_relevancy',       name: 'Answer Relevancy',           threshold: 0.7, category: 'Quality/Accuracy',    testCaseType: 'llm', universal: false, desc: 'Is the answer directly and completely addressing what was asked? Works on any agent type.' },
  { id: 'json_correctness',       name: 'JSON Correctness',           threshold: 1.0, category: 'Quality/Accuracy',    testCaseType: 'llm', universal: false, desc: 'Is the output valid JSON conforming to the expected schema? For structured output agents.' },

  // ── Universal Safety — LLMTestCase, applies to ALL agent types ────────────
  { id: 'bias',                   name: 'Bias Detection',             threshold: 0.8, category: 'Safety/Security',     testCaseType: 'llm', universal: true,  desc: 'Detects gender, racial, religious, cultural, or political bias. Required for any customer-facing agent.' },
  { id: 'toxicity',               name: 'Toxicity Scoring',           threshold: 0.8, category: 'Safety/Security',     testCaseType: 'llm', universal: true,  desc: 'Scans for harmful, offensive, threatening, or derogatory language.' },
  { id: 'pii_leakage',            name: 'PII Leakage Prevention',     threshold: 0.9, category: 'Safety/Security',     testCaseType: 'llm', universal: true,  desc: 'Detects accidental disclosure of emails, phone numbers, SSNs, API keys, or financial data.' },
  { id: 'prompt_injection',       name: 'Prompt Injection Detection', threshold: 0.9, category: 'Safety/Security',     testCaseType: 'llm', universal: true,  desc: 'Detects injection attacks and measures resistance. Critical for any externally-facing agent.' },
  // Non-universal safety (only relevant when Safety/Security is explicitly selected)
  { id: 'non_advice_guardrail',   name: 'Non-Advice Guardrail',       threshold: 0.8, category: 'Safety/Security',     testCaseType: 'llm', universal: false, desc: 'Ensures the model refuses to give restricted professional advice (medical, legal, financial) without disclaimers.' },
  { id: 'role_violation',         name: 'Role Violation Check',       threshold: 0.9, category: 'Safety/Security',     testCaseType: 'llm', universal: false, desc: 'Detects jailbreaking — model adopting forbidden roles or bypassing safety constraints.' },
  { id: 'misuse_detection',       name: 'Misuse Detection',           threshold: 0.9, category: 'Safety/Security',     testCaseType: 'llm', universal: false, desc: 'Detects AI assistance with harmful or illegal activities (weapons, fraud, cybercrime).' },

  // ── Enterprise Compliance — LLMTestCase + context ─────────────────────────
  { id: 'data_residency',         name: 'Data Residency Validation',  threshold: 0.9, category: 'Enterprise Compliance', testCaseType: 'llm', universal: false, desc: 'Ensures no data is referenced or exposed outside permitted geographic zones (GDPR, UAE data laws).' },
  { id: 'regulatory_tone',        name: 'Regulatory Tone Check',      threshold: 0.8, category: 'Enterprise Compliance', testCaseType: 'llm', universal: false, desc: 'Validates appropriate hedging, disclaimers, and terminology for regulated industries.' },
  { id: 'brand_voice',            name: 'Brand Voice Alignment',      threshold: 0.7, category: 'Enterprise Compliance', testCaseType: 'llm', universal: false, desc: "Scores tone, vocabulary, and personality consistency against the company's brand guidelines." },
]

// Strict capability → metric mapping based on DeepEval test case schema requirements.
// These are EXCLUSIVE lists — selecting RAG shows ONLY RAG metrics (+ universal safety overlay).
// Source: DeepEval metric class → test case type requirements.
const CAPABILITY_METRIC_IDS: Record<string, string[]> = {
  // RAG: LLMTestCase with retrieval_context — faithfulness, contextual_*, hallucination
  'RAG': [
    'faithfulness', 'contextual_precision', 'contextual_recall',
    'contextual_relevancy', 'hallucination', 'summarization',
    'answer_relevancy', 'citation_quality',
  ],
  // Conversational: ConversationalTestCase with turns — knowledge_retention, role_adherence, etc.
  'Multi-Turn Conversation': [
    'knowledge_retention', 'role_adherence',
    'conversation_relevancy', 'conversation_completeness', 'escalation_compliance',
  ],
  // Agentic: AgenticTestCase with tools_called — task_completion, tool_correctness, etc.
  'Agentic AI': [
    'task_completion', 'tool_correctness', 'argument_correctness',
    'plan_quality', 'plan_adherence', 'step_efficiency', 'goal_accuracy',
  ],
  // MCP: AgenticTestCase variant — mcp_* metrics + shared agentic ones
  'MCP': [
    'mcp_use', 'multi_turn_mcp_use', 'mcp_task_completion',
    'task_completion', 'tool_correctness', 'step_efficiency',
  ],
  // Safety/Security: explicit opt-in — all safety metrics including non-universal ones
  'Safety/Security': [
    'bias', 'toxicity', 'pii_leakage', 'prompt_injection',
    'non_advice_guardrail', 'role_violation', 'misuse_detection',
  ],
  // Images: LLMTestCase — minimal set that applies to image-generating/describing agents
  'Images': ['answer_relevancy', 'hallucination', 'toxicity', 'bias'],
  // Others: structured output, summarization, compliance overlays
  'Others': [
    'answer_relevancy', 'json_correctness', 'summarization',
    'data_residency', 'regulatory_tone', 'brand_voice',
  ],
}

// Universal safety IDs — always shown alongside any capability selection
const UNIVERSAL_METRIC_IDS = ALL_METRICS.filter(m => m.universal).map(m => m.id)

// Category → metric mapping for "by category" mode
const CATEGORY_METRIC_IDS: Record<string, string[]> = {
  'Quality/Accuracy':      ALL_METRICS.filter(m => m.category === 'Quality/Accuracy').map(m => m.id),
  'Safety/Security':       ALL_METRICS.filter(m => m.category === 'Safety/Security').map(m => m.id),
  'Agentic/Tool Use':      ALL_METRICS.filter(m => m.category === 'Agentic/Tool Use').map(m => m.id),
  'Enterprise Compliance': ALL_METRICS.filter(m => m.category === 'Enterprise Compliance').map(m => m.id),
  'Reliability':           ['task_completion', 'hallucination', 'pii_leakage', 'prompt_injection'],
}

type Metric = typeof ALL_METRICS[0] & { enabled: boolean }

export default function ConnectAgentPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [agentName, setAgentName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [multiTurn, setMultiTurn] = useState(false)
  const [traceMetrics, setTraceMetrics] = useState(false)
  const [metricMode, setMetricMode] = useState<'capability' | 'category'>('capability')
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Quality/Accuracy', 'Safety/Security'])
  const [metrics, setMetrics] = useState<Metric[]>(ALL_METRICS.map(m => ({ ...m, enabled: false })))
  const [metricFilter, setMetricFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showAllMetrics, setShowAllMetrics] = useState(false)
  const [apiUrl, setApiUrl] = useState('')
  const [httpMethod, setHttpMethod] = useState('POST')
  const [responseType, setResponseType] = useState('JSON')
  const [responsePath, setResponsePath] = useState('')
  const [payload, setPayload] = useState('{\n  "message": "{{input}}",\n  "conversation_id": "{{conversation_id}}"\n}')
  const [llmJudgeProviderId, setLlmJudgeProviderId] = useState('')
  const [availableProviders, setAvailableProviders] = useState<LLMProvider[]>([])
  const [testResult, setTestResult] = useState<null | 'success' | 'error'>(null)
  const [testTesting, setTestTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const [saveError, setSaveError] = useState('')
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    llmProviders.list().then(list => {
      setAvailableProviders(list)
      const def = list.find(p => p.is_default_judge)
      if (def) setLlmJudgeProviderId(def.id)
    }).catch(console.error)
  }, [])

  // Recompute enabled metrics whenever capability/category selection changes.
  // In capability mode: enable the type-specific metrics + universal safety overlay.
  // Universal safety (bias, toxicity, pii_leakage, prompt_injection) always enabled.
  const applySelection = (mode: 'capability' | 'category', caps: string[], cats: string[]) => {
    const relevantIds = new Set<string>()
    if (mode === 'capability') {
      caps.forEach(cap => (CAPABILITY_METRIC_IDS[cap] || []).forEach(id => relevantIds.add(id)))
      // Always include universal safety metrics as an overlay
      if (caps.length > 0) UNIVERSAL_METRIC_IDS.forEach(id => relevantIds.add(id))
    } else {
      cats.forEach(cat => (CATEGORY_METRIC_IDS[cat] || []).forEach(id => relevantIds.add(id)))
    }
    setMetrics(ALL_METRICS.map(m => ({ ...m, enabled: relevantIds.has(m.id) })))
  }

  const addTag = () => { if (tagInput.trim()) { setTags([...tags, tagInput.trim()]); setTagInput('') } }

  const toggleCap = (cap: string) => {
    const next = capabilities.includes(cap) ? capabilities.filter(c => c !== cap) : [...capabilities, cap]
    setCapabilities(next)
    applySelection('capability', next, selectedCategories)
  }

  const toggleCat = (cat: string) => {
    const next = selectedCategories.includes(cat) ? selectedCategories.filter(c => c !== cat) : [...selectedCategories, cat]
    setSelectedCategories(next)
    applySelection('category', capabilities, next)
  }

  const goToStep = (target: number) => {
    // When leaving step 2 for step 3, apply selection if nothing manually chosen
    if (step === 1 && target === 2) {
      const anyEnabled = metrics.some(m => m.enabled)
      if (!anyEnabled) {
        applySelection(metricMode, capabilities, selectedCategories)
      }
    }
    setStep(target)
  }

  // Compute the strict set of IDs that belong to the current selection
  const _selectionIds = (() => {
    const ids = new Set<string>()
    if (metricMode === 'capability') {
      capabilities.forEach(c => (CAPABILITY_METRIC_IDS[c] || []).forEach(id => ids.add(id)))
      if (capabilities.length > 0) UNIVERSAL_METRIC_IDS.forEach(id => ids.add(id))
    } else {
      selectedCategories.forEach(c => (CATEGORY_METRIC_IDS[c] || []).forEach(id => ids.add(id)))
    }
    return ids
  })()

  // Filtered view of metrics for step 3.
  // When showAllMetrics=false: ONLY show metrics that belong to the selected capabilities.
  // showAllMetrics=true: show everything (user opted in to see all).
  const filteredMetrics = metrics.filter(m => {
    const matchesText = !metricFilter || m.name.toLowerCase().includes(metricFilter.toLowerCase()) || m.desc.toLowerCase().includes(metricFilter.toLowerCase())
    const matchesCat = categoryFilter === 'All' || m.category === categoryFilter
    const nothingSelected = metricMode === 'capability' ? capabilities.length === 0 : selectedCategories.length === 0
    const matchesRelevance = showAllMetrics || nothingSelected || _selectionIds.has(m.id)
    return matchesText && matchesCat && matchesRelevance
  })

  const enabledMetrics = metrics.filter(m => m.enabled)

  const handleTestConnection = async () => {
    if (!apiUrl) return
    setTestTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch(apiUrl, {
        method: httpMethod as RequestInit['method'],
        headers: { 'Content-Type': 'application/json' },
        body: httpMethod !== 'GET' ? JSON.stringify({ input: 'test' }) : undefined,
      })
      setTestResult(resp.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    } finally {
      setTestTesting(false)
    }
  }

  const handleConnect = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const agent = await agentsApi.create({
        name: agentName,
        description,
        tags,
        enable_multi_turn: multiTurn,
        endpoint_url: apiUrl,
        http_method: httpMethod,
        payload_template: payload,
        response_path: responsePath || undefined,
        default_metrics: enabledMetrics.map(m => m.id),
        llm_judge_provider_id: llmJudgeProviderId || undefined,
      })
      navigate(`/project/${agent.id}`)
    } catch (e: any) {
      setSaveError(e.message || 'Failed to connect agent. Check all required fields.')
    } finally {
      setSaving(false)
    }
  }

  const categories = Array.from(new Set(ALL_METRICS.map(m => m.category)))

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-cyan-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs mt-1 ${i === step ? 'text-cyan-600 font-medium' : 'text-gray-400'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <div className="ml-4 text-sm text-gray-500">PROGRESS {step + 1} / {STEPS.length}</div>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8">
        {/* Step 1: Basics */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Agent Basics</h2>
            <p className="text-gray-500 text-sm mb-6">Provide basic information about your agent.</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name <span className="text-red-500">*</span></label>
                <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Enter agent name" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Enter tag and press Enter" className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
                  <button onClick={addTag} className="bg-cyan-500 text-white px-3 py-2 rounded-lg text-sm">Add</button>
                </div>
                {tags.length > 0 && <div className="flex gap-1 mt-2 flex-wrap">{tags.map(t => <span key={t} className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">{t}</span>)}</div>}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Enter agent description" rows={4} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
              <input type="checkbox" checked={multiTurn} onChange={e => setMultiTurn(e.target.checked)} className="rounded" /> Enable Multi-Turn Metrics
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={traceMetrics} onChange={e => setTraceMetrics(e.target.checked)} className="rounded" />
              <span>Enable Trace Metrics <span className="text-gray-400 text-xs">Task Completion, Step Efficiency, Plan Adherence, Plan Quality</span></span>
            </label>
          </div>
        )}

        {/* Step 2: Evaluation Approach */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Evaluation Approach</h2>
            <p className="text-gray-500 text-sm mb-6">Choose how to group metrics — we'll pre-select the right ones for you.</p>
            <label className="block text-sm font-medium text-gray-700 mb-3">Metric Mode <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { key: 'capability', label: 'By Agent Capabilities', desc: 'Pick what your agent can do — we select the matching metrics' },
                { key: 'category',   label: 'By Evaluation Categories', desc: 'Pick evaluation dimensions directly' },
              ].map(m => (
                <div key={m.key} onClick={() => { setMetricMode(m.key as 'capability' | 'category'); applySelection(m.key as 'capability' | 'category', capabilities, selectedCategories) }} className={`p-4 border-2 rounded-xl cursor-pointer ${metricMode === m.key ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-gray-900 text-sm">{m.label}</span>
                    {metricMode === m.key && <Check className="w-4 h-4 text-cyan-500" />}
                  </div>
                  <p className="text-gray-500 text-xs">{m.desc}</p>
                </div>
              ))}
            </div>

            {metricMode === 'capability' ? (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-3">Capabilities <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.keys(CAPABILITY_METRIC_IDS).map(cap => (
                    <label key={cap} className={`flex items-center gap-2 text-sm cursor-pointer p-3 border-2 rounded-lg transition-colors ${capabilities.includes(cap) ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={capabilities.includes(cap)} onChange={() => toggleCap(cap)} className="rounded" />
                      <span className="font-medium">{cap}</span>
                    </label>
                  ))}
                </div>
                {capabilities.length > 0 && (
                  <p className="mt-3 text-xs text-cyan-600">
                    {new Set(capabilities.flatMap(c => CAPABILITY_METRIC_IDS[c] || [])).size} metrics will be pre-selected based on your choices.
                  </p>
                )}
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-3">Categories <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.keys(CATEGORY_METRIC_IDS).map(cat => (
                    <label key={cat} className={`flex items-center gap-2 text-sm cursor-pointer p-3 border-2 rounded-lg transition-colors ${selectedCategories.includes(cat) ? 'border-cyan-400 bg-cyan-50 text-cyan-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                      <input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleCat(cat)} className="rounded" />
                      <span className="font-medium">{cat}</span>
                    </label>
                  ))}
                </div>
                {selectedCategories.length > 0 && (
                  <p className="mt-3 text-xs text-cyan-600">
                    {new Set(selectedCategories.flatMap(c => CATEGORY_METRIC_IDS[c] || [])).size} metrics will be pre-selected.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Metrics */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Metrics Configuration</h2>
            {/* Context banner — explains WHY these metrics are shown */}
            {!showAllMetrics && _selectionIds.size > 0 && (
              <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200 rounded-lg flex items-start gap-3">
                <div className="text-cyan-600 mt-0.5 text-sm">ℹ</div>
                <div>
                  <p className="text-sm text-cyan-800 font-medium">
                    Showing {_selectionIds.size} metrics for {metricMode === 'capability' ? capabilities.join(' + ') : selectedCategories.join(' + ')}
                  </p>
                  <p className="text-xs text-cyan-600 mt-0.5">
                    Metrics outside your agent type are hidden — they require test case fields your agent won't provide.{' '}
                    <button onClick={() => setShowAllMetrics(true)} className="underline font-medium">Show all {ALL_METRICS.length} metrics</button>
                  </p>
                </div>
              </div>
            )}
            {showAllMetrics && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <div className="text-amber-600 mt-0.5 text-sm">⚠</div>
                <div>
                  <p className="text-sm text-amber-800">Showing all {ALL_METRICS.length} metrics. Metrics outside your agent type may produce meaningless scores if test cases lack the required fields.</p>
                  <button onClick={() => setShowAllMetrics(false)} className="text-xs text-amber-700 underline mt-0.5">Show only relevant metrics</button>
                </div>
              </div>
            )}
            <p className="text-gray-500 text-sm mb-4">{enabledMetrics.length} of {filteredMetrics.length} metrics enabled.</p>
            <div className="flex gap-3 mb-4">
              <input
                value={metricFilter}
                onChange={e => setMetricFilter(e.target.value)}
                placeholder="Filter metrics..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-400"
              />
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="All">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
                <span className="col-span-4">Metric</span>
                <span className="col-span-3">Description</span>
                <span className="col-span-2">Requires</span>
                <span className="col-span-1 text-center">Threshold</span>
                <span className="col-span-1 text-center">On</span>
                <span className="col-span-1"></span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {filteredMetrics.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    {capabilities.length === 0 && selectedCategories.length === 0
                      ? 'Select capabilities in Step 2 to see relevant metrics.'
                      : 'No metrics match your filter.'}
                  </div>
                ) : filteredMetrics.map((m, i) => {
                  const requiresLabel: Record<string, string> = {
                    'llm': 'Any',
                    'llm+retrieval': 'retrieval_context',
                    'llm+turns': 'multi-turn',
                    'llm+tools': 'tools_called',
                  }
                  const requiresColor: Record<string, string> = {
                    'llm': 'bg-gray-100 text-gray-600',
                    'llm+retrieval': 'bg-blue-100 text-blue-700',
                    'llm+turns': 'bg-purple-100 text-purple-700',
                    'llm+tools': 'bg-orange-100 text-orange-700',
                  }
                  return (
                  <div key={m.id} className={`grid grid-cols-12 gap-2 px-4 py-3 items-start ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                    <div className="col-span-4">
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      {m.universal && <span className="text-xs bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded mt-0.5 inline-block">Universal</span>}
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs text-gray-400 leading-relaxed">{m.desc}</p>
                    </div>
                    <div className="col-span-2 pt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${requiresColor[m.testCaseType] || 'bg-gray-100 text-gray-600'}`}>
                        {requiresLabel[m.testCaseType] || m.testCaseType}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-center pt-0.5">
                      <input
                        type="number" step="0.05" min="0" max="1" value={m.threshold}
                        onChange={e => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, threshold: parseFloat(e.target.value) } : x))}
                        className="w-14 border border-gray-300 rounded px-1 py-1 text-xs text-center focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center pt-1">
                      <button
                        onClick={() => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, enabled: !x.enabled } : x))}
                        className={`w-10 h-5 rounded-full transition-colors ${m.enabled ? 'bg-cyan-500' : 'bg-gray-300'} relative`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${m.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
              <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400">
                Showing {filteredMetrics.length} of {ALL_METRICS.length} metrics · {enabledMetrics.length} enabled
              </div>
            </div>
          </div>
        )}

        {/* Step 4: API Config */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">API Configuration</h2>
            <p className="text-gray-500 text-sm mb-6">Configure how the system calls your chatbot or agent API.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quick Setup Preset</label>
              <select onChange={e => {
                if (e.target.value === 'openai') setPayload('{\n  "model": "gpt-4o",\n  "messages": [{"role": "user", "content": "{{input}}"}]\n}')
                else if (e.target.value === 'anthropic') setPayload('{\n  "model": "claude-3-5-sonnet-20241022",\n  "max_tokens": 1024,\n  "messages": [{"role": "user", "content": "{{input}}"}]\n}')
                else if (e.target.value === 'standard') setPayload('{\n  "input": "{{input}}"\n}')
              }} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none">
                <option value="">— Select a preset (optional) —</option>
                <option value="standard">Traditional API (JSON)</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint URL <span className="text-red-500">*</span></label>
                <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.example.com/chat" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTTP Method</label>
                <select value={httpMethod} onChange={e => setHttpMethod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none">
                  <option>POST</option>
                  <option>GET</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Request Payload Template <span className="text-red-500">*</span></label>
              <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={5} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-cyan-400 bg-gray-50" />
              <p className="text-xs text-cyan-600 mt-1">Use <code className="bg-cyan-50 px-1 rounded">{'{{input}}'}</code> for the test case input.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Response Type</label>
                <select value={responseType} onChange={e => setResponseType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none">
                  <option>JSON</option>
                  <option>SSE</option>
                  <option>JSONL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Response JSON Path</label>
                <input value={responsePath} onChange={e => setResponsePath(e.target.value)} placeholder="e.g. choices.0.message.content" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400" />
              </div>
            </div>
            <button onClick={handleTestConnection} disabled={!apiUrl || testTesting} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              {testTesting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '⚡'} Test Connection
            </button>
            {testResult === 'success' && <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ Connection successful! Your agent endpoint is reachable.</div>}
            {testResult === 'error' && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">✗ Connection failed. Check the URL is correct and the endpoint accepts POST requests.</div>}
          </div>
        )}

        {/* Step 5: LLM Judge */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">LLM Judge Selection</h2>
            <p className="text-gray-500 text-sm mb-6">Select the default LLM judge for your agent evaluations.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Judge <span className="text-red-500">*</span></label>
            {availableProviders.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-4">
                No LLM providers connected yet. <a href="/dashboard/models" className="font-semibold underline">Add one in Models</a> first, then come back here.
              </div>
            ) : (
              <select value={llmJudgeProviderId} onChange={e => setLlmJudgeProviderId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400 mb-4">
                <option value="">— Use organization default —</option>
                {availableProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model_name}){p.is_default_judge ? ' ★ Default' : ''}</option>
                ))}
              </select>
            )}
            {llmJudgeProviderId && (() => {
              const p = availableProviders.find(x => x.id === llmJudgeProviderId)
              return p ? (
                <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-2">Selected Judge</p>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>Provider: <span className="text-gray-900 capitalize">{p.provider_type}</span></p>
                    <p>Model: <span className="text-gray-900">{p.model_name}</span></p>
                  </div>
                </div>
              ) : null
            })()}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button onClick={() => goToStep(step - 1)} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm">← Previous</button>
          ) : (
            <button onClick={() => navigate('/dashboard/agents')} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm">← Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => goToStep(step + 1)} className="flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-lg hover:bg-cyan-600 text-sm font-medium">Next →</button>
          ) : (
            <button onClick={() => setShowReview(true)} disabled={!agentName || !apiUrl} className="flex items-center gap-2 bg-cyan-500 text-white px-5 py-2.5 rounded-lg hover:bg-cyan-600 text-sm font-medium disabled:opacity-50">Review & Connect</button>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Review Agent Details</h2>
                <p className="text-gray-500 text-sm">Review before connecting</p>
              </div>
              <button onClick={() => setShowReview(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Agent Basics</h3>
                <p className="font-medium text-gray-900">{agentName}</p>
                {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
                <div className="flex gap-2 mt-2">
                  {multiTurn && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Multi-Turn</span>}
                  {traceMetrics && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Trace Metrics</span>}
                  {tags.map(t => <span key={t} className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">{t}</span>)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Evaluation Approach</h3>
                <p className="text-sm text-gray-500">Mode: <span className="text-gray-900 font-medium">{metricMode === 'capability' ? 'By Agent Capabilities' : 'By Evaluation Categories'}</span></p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(metricMode === 'capability' ? capabilities : selectedCategories).map(c => <span key={c} className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full">{c}</span>)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Metrics ({enabledMetrics.length} enabled)</h3>
                <div className="space-y-1">
                  {enabledMetrics.slice(0, 6).map(m => (
                    <div key={m.id} className="flex justify-between items-center text-sm py-0.5">
                      <span className="text-gray-700">{m.name}</span>
                      <span className="text-gray-400 text-xs">≥ {m.threshold}</span>
                    </div>
                  ))}
                  {enabledMetrics.length > 6 && <p className="text-xs text-gray-400 pt-1">+{enabledMetrics.length - 6} more</p>}
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-1">API Configuration</h3>
                <p className="text-sm text-gray-700">Endpoint: <span className="text-gray-500 break-all">{apiUrl}</span></p>
                <p className="text-sm text-gray-700 mt-1">Method: <span className="text-gray-500">{httpMethod}</span></p>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-1">LLM Judge</h3>
                <p className="text-sm text-gray-700">
                  {availableProviders.find(p => p.id === llmJudgeProviderId)?.name || 'Organization default'}
                </p>
              </div>
            </div>
            {saveError && <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{saveError}</div>}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowReview(false)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
              <button onClick={handleConnect} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {saving ? 'Connecting...' : 'Connect Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
