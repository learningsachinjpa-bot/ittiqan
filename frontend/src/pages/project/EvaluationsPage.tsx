import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { evaluations as evalsApi, datasets as datasetsApi, llmProviders, getWsUrl } from '../../lib/api'
import type { Evaluation, EvaluationResult, Dataset, LLMProvider, MetricInfo } from '../../types'
import { Play, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'


const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:      { label: 'Queued',        cls: 'bg-gray-100 text-gray-600' },
  running:      { label: 'Running',       cls: 'bg-blue-100 text-blue-600' },
  judge_running:{ label: 'Judging',       cls: 'bg-purple-100 text-purple-600' },
  completed:    { label: 'Completed',     cls: 'bg-green-100 text-green-700' },
  failed:       { label: 'Failed',        cls: 'bg-red-100 text-red-700' },
  cancelled:    { label: 'Cancelled',     cls: 'bg-gray-100 text-gray-500' },
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-semibold ${pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
    </div>
  )
}

type WsMessage = { type: 'progress' | 'completed' | 'failed'; done?: number; total?: number; result?: { cost_usd?: number }; overall_score?: number; metric_scores?: Record<string, number>; passed_count?: number; failed_count?: number; error?: string; action?: string }

function LiveProgress({ evalId, total, onDone }: { evalId: string; total: number; onDone: (result: WsMessage) => void }) {
  const [done, setDone] = useState(0)
  const [status, setStatus] = useState('running')
  const [cost, setCost] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(getWsUrl(`/evaluations/${evalId}/ws`))
    wsRef.current = ws
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as WsMessage
      if (msg.type === 'progress') {
        setDone(msg.done ?? 0)
        if (msg.result?.cost_usd) setCost(c => c + msg.result!.cost_usd!)
      } else if (msg.type === 'completed') {
        setStatus('completed')
        onDone(msg)
      } else if (msg.type === 'failed') {
        setStatus('failed')
        onDone(msg)
      }
    }
    return () => ws.close()
  }, [evalId])

  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const filled = Math.round(pct / 5)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {status === 'judge_running' ? 'Scoring with LLM judge...' : 'Running test cases...'}
        </span>
        <span className="text-xs text-gray-400">${cost.toFixed(4)} so far</span>
      </div>
      <div className="font-mono text-sm text-cyan-600 mb-1">
        {'█'.repeat(filled)}{'░'.repeat(20 - filled)} {pct}%
      </div>
      <div className="text-xs text-gray-400">{done} / {total} test cases complete</div>
    </div>
  )
}

function ResultRow({ result, registry }: { result: EvaluationResult; registry: Record<string, { name: string; category: string }> }) {
  const [open, setOpen] = useState(false)
  const metrics = Object.entries(result.metric_results || {})
  const passed = result.overall_passed

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 text-left">
        {passed ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
        <span className="text-sm text-gray-700 flex-1 truncate">{result.input}</span>
        <span className="text-xs text-gray-400">{result.latency_ms}ms</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-300" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">Actual output</p>
              <p className="text-gray-700 bg-gray-50 rounded-lg p-2 text-xs leading-relaxed">{result.actual_output || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Expected output</p>
              <p className="text-gray-700 bg-gray-50 rounded-lg p-2 text-xs leading-relaxed">{result.expected_output || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Metric results</p>
            <div className="space-y-2">
              {(metrics as [string, import('../../types').MetricResult][]).map(([id, val]) => {
                const displayName = registry[id]?.name || id
                const pct = Math.round((val.score || 0) * 100)
                const isLowConfidence = val.confidence != null && val.confidence < 0.7
                return (
                  <div key={id} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                      {val.passed
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      <span className="text-xs font-semibold text-gray-800">{displayName}</span>
                      <span className={`text-xs font-bold ml-auto ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{pct}%</span>
                      {isLowConfidence && (
                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                          low confidence
                        </span>
                      )}
                    </div>
                    {/* Score bar */}
                    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {/* Reason */}
                    {val.reason && <p className="text-xs text-gray-500 leading-relaxed">{val.reason}</p>}
                    {/* Criteria sub-scores */}
                    {val.criteria_scores && Object.keys(val.criteria_scores).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {Object.entries(val.criteria_scores).map(([k, v]: [string, any]) => (
                          <span key={k} className="text-xs bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {k.replace(/_/g, ' ')}: <strong>{Math.round(Number(v) * 100)}%</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Failure types */}
                    {(val.failure_types?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(val.failure_types ?? []).map((t: string) => (
                          <span key={t} className="text-xs bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded">{t.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                    {/* Failure attribution */}
                    {val.failure_attribution && !val.passed && (
                      <p className="text-xs text-gray-400">
                        Attribution: <span className="font-medium text-gray-600">{val.failure_attribution.replace(/_/g, ' ')}</span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EvaluationsPage() {
  const { id: agentId } = useParams<{ id: string }>()
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([])
  const [metricRegistry, setMetricRegistry] = useState<Record<string, Pick<MetricInfo, 'name' | 'category'>>>({})
  const [loading, setLoading] = useState(true)

  // Run config drawer
  const [showRun, setShowRun] = useState(false)
  const [runName, setRunName] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [judgeId, setJudgeId] = useState('')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  // Active live runs: evalId → total cases
  const [liveRuns, setLiveRuns] = useState<Record<string, number>>({})

  // Expanded eval for results
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, EvaluationResult[]>>({})

  useEffect(() => {
    if (!agentId) return
    Promise.all([
      evalsApi.list(agentId),
      datasetsApi.list(),
      llmProviders.list(),
      evalsApi.metrics(),
    ]).then(([ev, ds, pr, mt]) => {
      setEvals(ev)
      setDatasets(ds)
      setProviders(pr)
      setAvailableMetrics(mt.metrics || [])
      setMetricRegistry(mt.registry || {})
      setSelectedMetrics(mt.metrics || [])
      // Default judge
      const def = pr.find(p => p.is_default_judge)
      if (def) setJudgeId(def.id)
    }).catch(console.error).finally(() => setLoading(false))
  }, [agentId])

  const handleRun = async () => {
    if (!datasetId) return setStartError('Select a dataset.')
    if (selectedMetrics.length === 0) return setStartError('Select at least one metric.')
    setStarting(true)
    setStartError('')
    try {
      const ev = await evalsApi.run({
        agent_id: agentId!,
        dataset_id: datasetId,
        name: runName || `Run ${new Date().toLocaleString()}`,
        metrics: selectedMetrics,
        llm_judge_provider_id: judgeId || undefined,
      })
      setEvals(prev => [ev, ...prev])
      setLiveRuns(prev => ({ ...prev, [ev.id]: ev.total_cases }))
      setShowRun(false)
      setRunName('')
    } catch (e: any) {
      setStartError(e.message || 'Failed to start evaluation.')
    } finally {
      setStarting(false)
    }
  }

  const loadResults = async (evalId: string) => {
    if (results[evalId]) { setExpandedId(evalId); return }
    const r = await evalsApi.results(evalId)
    setResults(prev => ({ ...prev, [evalId]: r }))
    setExpandedId(evalId)
  }

  const onLiveDone = (evalId: string) => (msg: WsMessage) => {
    setLiveRuns(prev => { const next = { ...prev }; delete next[evalId]; return next })
    setEvals(prev => prev.map(e => e.id === evalId ? {
      ...e,
      status: msg.type === 'completed' ? 'completed' : 'failed',
      overall_score: msg.overall_score ?? e.overall_score,
      metric_scores: msg.metric_scores ?? e.metric_scores,
      passed_count: msg.passed_count ?? e.passed_count,
      failed_count: msg.failed_count ?? e.failed_count,
      error_message: msg.error ?? e.error_message,
      error_action: msg.action ?? e.error_action,
    } : e))
  }

  const badge = (status: string) => STATUS_BADGE[status] || STATUS_BADGE.pending

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Evaluation Runs</h1>
          <p className="text-sm text-gray-400 mt-0.5">Every run stores an immutable snapshot of agent, dataset, judge, and prompt versions.</p>
        </div>
        <button onClick={() => setShowRun(true)} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">
          <Play className="w-4 h-4" /> Run Evaluation
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : evals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-2xl mb-4">📊</div>
          <h2 className="text-base font-semibold text-gray-700 mb-1">No evaluations yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-xs">Run your first evaluation to measure quality, safety, and performance across all 39 metrics.</p>
          <button onClick={() => setShowRun(true)} className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">
            <Play className="w-4 h-4" /> Run Evaluation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {evals.map(ev => (
            <div key={ev.id} className={`bg-white rounded-2xl border transition-all ${expandedId === ev.id ? 'border-cyan-200 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
              {/* Row */}
              <div className="p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{ev.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge(ev.status).cls}`}>{badge(ev.status).label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(ev.created_at).toLocaleString()}</span>
                    <span>{ev.metrics?.length || 0} metrics</span>
                    {/* EVAL-07: version info */}
                    {ev.judge_prompt_version && <span className="font-mono">rubric v{ev.judge_prompt_version}</span>}
                    {ev.dataset_version && <span className="font-mono">dataset v{ev.dataset_version}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  {ev.overall_score != null && <ScoreBar score={ev.overall_score} />}
                  {ev.overall_score == null && ev.status !== 'failed' && (
                    <div className="text-xs text-gray-400">{ev.completed_cases || 0}/{ev.total_cases} done</div>
                  )}
                  <button onClick={() => expandedId === ev.id ? setExpandedId(null) : loadResults(ev.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                    {expandedId === ev.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Live progress — UX-05 */}
              {liveRuns[ev.id] !== undefined && (
                <div className="px-5 pb-4">
                  <LiveProgress evalId={ev.id} total={liveRuns[ev.id]} onDone={onLiveDone(ev.id)} />
                </div>
              )}

              {/* UX-06: failure with next action */}
              {ev.status === 'failed' && (
                <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-0.5">Evaluation failed</p>
                      <p className="text-xs text-red-600">{ev.error_action || ev.error_message}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowRun(true)} className="mt-2 text-xs text-red-600 font-semibold underline">Retry with same config →</button>
                </div>
              )}

              {/* Metric summary when completed */}
              {ev.status === 'completed' && ev.metric_scores && expandedId !== ev.id && (
                <div className="px-5 pb-4 flex flex-wrap gap-2">
                  {Object.entries(ev.metric_scores).slice(0, 6).map(([id, score]: [string, any]) => (
                    <div key={id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1">
                      <span className="text-xs text-gray-500">{metricRegistry[id]?.name || id}</span>
                      <span className={`text-xs font-semibold ${score >= 0.8 ? 'text-green-600' : score >= 0.6 ? 'text-amber-500' : 'text-red-500'}`}>{Math.round(score * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-case results */}
              {expandedId === ev.id && results[ev.id] && (
                <div className="border-t border-gray-100">
                  <div className="px-5 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Per-case results</span>
                    <span className="text-xs text-gray-400">{results[ev.id].length} cases</span>
                  </div>
                  {results[ev.id].map(r => <ResultRow key={r.id} result={r} registry={metricRegistry} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Run drawer */}
      {showRun && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setShowRun(false)} />
          <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Run Evaluation</h2>
                <p className="text-xs text-gray-400 mt-0.5">Snapshots agent, dataset, and judge versions at run time</p>
              </div>
              <button onClick={() => setShowRun(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Run name (optional)</label>
                <input value={runName} onChange={e => setRunName(e.target.value)} placeholder={`Run ${new Date().toLocaleDateString()}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Dataset <span className="text-red-500">*</span></label>
                {datasets.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    No datasets yet. <a href="#" className="font-semibold underline">Upload one in Datasets</a> first.
                  </div>
                ) : (
                  <select value={datasetId} onChange={e => setDatasetId(e.target.value)}>
                    <option value="">Select dataset...</option>
                    {datasets.map(d => (
                      <option key={d.id} value={d.id}>{d.name} (v{d.version}, {d.row_count} cases)</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">LLM Judge</label>
                <select value={judgeId} onChange={e => setJudgeId(e.target.value)}>
                  <option value="">Organization default</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.model_name}{p.is_default_judge ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Metrics ({selectedMetrics.length}/{availableMetrics.length})</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedMetrics(availableMetrics)} className="text-xs text-cyan-500 font-semibold">All</button>
                    <button onClick={() => setSelectedMetrics([])} className="text-xs text-gray-400">None</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 rounded-xl p-2">
                  {availableMetrics.map(m => (
                    <label key={m} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedMetrics.includes(m)} onChange={e => setSelectedMetrics(prev => e.target.checked ? [...prev, m] : prev.filter(x => x !== m))} style={{ width: 'auto' }} />
                      <span className="text-sm text-gray-700">{metricRegistry[m]?.name || m}</span>
                      <span className="text-xs text-gray-300 ml-auto">{metricRegistry[m]?.category?.split('/')[0]}</span>
                    </label>
                  ))}
                </div>
              </div>
              {startError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{startError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button onClick={() => setShowRun(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleRun} disabled={starting || !datasetId} className="flex-1 py-2.5 text-sm bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {starting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {starting ? 'Starting...' : '▶ Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
