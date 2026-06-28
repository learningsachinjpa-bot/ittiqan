import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { datasets as datasetsApi } from '../../lib/api'
import type { Dataset, TestCase } from '../../types'
import { Upload, Plus, Trash2, ChevronRight, ChevronDown, AlertCircle, Database, X } from 'lucide-react'

// ── Template download ────────────────────────────────────────────────────────

function downloadTemplate() {
  const sample = [
    { input: 'What is the capital of France?', expected_output: 'Paris', retrieval_context: ['France is a country in Western Europe. Its capital is Paris.'] },
    { input: 'Who wrote Hamlet?', expected_output: 'William Shakespeare', retrieval_context: ['Hamlet is a tragedy by William Shakespeare, written around 1600.'] },
  ]
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ittiqan-dataset-template.json'
  a.click()
}

// ── Upload drawer ────────────────────────────────────────────────────────────

function UploadDrawer({ onDone, onClose }: { onDone: (d: Dataset) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!name.trim()) return setError('Give this dataset a name.')
    if (!file) return setError('Choose a file to upload.')
    setError('')
    setUploading(true)
    try {
      const d = await datasetsApi.upload(file, name.trim(), description.trim() || undefined)
      onDone(d)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upload Dataset</h2>
            <p className="text-xs text-gray-400 mt-0.5">JSON, JSONL, or CSV — max 50 MB</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {/* Schema hint */}
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-700 mb-2">Expected fields</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">input</code> — the user message / question <span className="text-red-400">*</span></p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">expected_output</code> — reference answer (optional)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">retrieval_context</code> — array of context chunks (RAG)</p>
            <p><code className="bg-white border border-gray-200 px-1 rounded">context</code> — extra JSON metadata (optional)</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Name <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production eval set Q2 2025" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional — what's in this dataset?" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">File <span className="text-red-400">*</span></label>
            <input ref={inputRef} type="file" accept=".json,.jsonl,.csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            <button onClick={() => inputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 text-sm transition-colors ${file ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'}`}>
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Click to choose file'}
            </button>
            {file && <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={uploading}
            className="flex-1 py-2.5 text-sm bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add test case drawer ─────────────────────────────────────────────────────

function AddCaseDrawer({ datasetId, onDone, onClose }: { datasetId: string; onDone: (d: Dataset) => void; onClose: () => void }) {
  const [input, setInput] = useState('')
  const [expected, setExpected] = useState('')
  const [retrieval, setRetrieval] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!input.trim()) return setError('Input is required.')
    setError('')
    setSaving(true)
    try {
      let retrieval_context: string[] | undefined
      if (retrieval.trim()) {
        try { retrieval_context = JSON.parse(retrieval) }
        catch { retrieval_context = retrieval.split('\n').filter(Boolean) }
      }
      const updated = await datasetsApi.addTestCases(datasetId, [{
        input: input.trim(),
        expected_output: expected.trim() || undefined,
        retrieval_context,
      }])
      onDone(updated)
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to add test case')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Add Test Case</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Input <span className="text-red-400">*</span></label>
            <textarea value={input} onChange={e => setInput(e.target.value)} rows={4} placeholder="The user message or question" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Expected output</label>
            <textarea value={expected} onChange={e => setExpected(e.target.value)} rows={3} placeholder="Reference answer (used for answer relevancy scoring)" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Retrieval context <span className="text-gray-300">(RAG only)</span></label>
            <textarea value={retrieval} onChange={e => setRetrieval(e.target.value)} rows={3} placeholder={'JSON array or one chunk per line:\n["chunk 1", "chunk 2"]'} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none font-mono" />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 text-sm bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Adding...' : 'Add case'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dataset card with expandable test cases ──────────────────────────────────

function DatasetCard({ dataset, onDelete, onUpdate }: {
  dataset: Dataset
  onDelete: (id: string) => void
  onUpdate: (d: Dataset) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [loadingCases, setLoadingCases] = useState(false)
  const [showAddCase, setShowAddCase] = useState(false)
  const [deletingCase, setDeletingCase] = useState<string | null>(null)

  const loadCases = async () => {
    if (cases.length > 0) { setExpanded(true); return }
    setLoadingCases(true)
    try {
      const data = await datasetsApi.testCases(dataset.id, 50)
      setCases(data)
      setExpanded(true)
    } catch { /* silent */ } finally {
      setLoadingCases(false)
    }
  }

  const handleDeleteCase = async (caseId: string) => {
    setDeletingCase(caseId)
    try {
      const updated = await datasetsApi.deleteTestCase(dataset.id, caseId)
      setCases(prev => prev.filter(c => c.id !== caseId))
      onUpdate(updated)
    } catch { /* silent */ } finally {
      setDeletingCase(null)
    }
  }

  return (
    <div className={`bg-white rounded-2xl border transition-all ${expanded ? 'border-cyan-200 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
      {/* Header */}
      <div className="p-5 flex items-center gap-4">
        <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Database className="w-5 h-5 text-cyan-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{dataset.name}</h3>
            <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">v{dataset.version}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {(dataset.row_count ?? 0).toLocaleString()} test cases · {dataset.file_format?.toUpperCase() || 'JSON'}
            {dataset.description && ` · ${dataset.description}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowAddCase(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-all">
            <Plus className="w-3.5 h-3.5" /> Add case
          </button>
          <button onClick={() => expanded ? setExpanded(false) : loadCases()}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
            {loadingCases
              ? <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              : expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button onClick={() => onDelete(dataset.id)}
            className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Test cases table */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Test cases {cases.length < dataset.row_count && `(showing ${cases.length} of ${dataset.row_count})`}
            </span>
            {cases.length === 0 && !loadingCases && (
              <span className="text-xs text-gray-400">No test cases yet</span>
            )}
          </div>

          {cases.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-gray-50 border-y border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span className="col-span-5">Input</span>
                <span className="col-span-4">Expected output</span>
                <span className="col-span-2">Context</span>
                <span className="col-span-1"></span>
              </div>
              {cases.map(c => (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 items-start group">
                  <p className="col-span-5 text-xs text-gray-700 truncate">{c.input}</p>
                  <p className="col-span-4 text-xs text-gray-400 truncate">{c.expected_output || '—'}</p>
                  <p className="col-span-2 text-xs text-gray-400">
                    {c.retrieval_context?.length ? `${c.retrieval_context.length} chunks` : '—'}
                  </p>
                  <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    {deletingCase === c.id
                      ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin mt-0.5" />
                      : <button onClick={() => handleDeleteCase(c.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddCase && (
        <AddCaseDrawer
          datasetId={dataset.id}
          onDone={updated => { onUpdate(updated); setCases(prev => [...prev, { id: Date.now().toString(), input: '(new)', expected_output: undefined, retrieval_context: undefined }]) }}
          onClose={() => setShowAddCase(false)}
        />
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  const { id: _projectId } = useParams<{ id: string }>()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    datasetsApi.list()
      .then(setDatasets)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dataset? Any evaluations that used it will retain their snapshot, but you cannot re-run them against this dataset.')) return
    await datasetsApi.delete(id)
    setDatasets(prev => prev.filter(d => d.id !== id))
  }

  const handleUpdate = (updated: Dataset) => {
    setDatasets(prev => prev.map(d => d.id === updated.id ? updated : d))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Datasets</h1>
          <p className="text-sm text-gray-400 mt-0.5">Each test case change bumps the dataset version — eval snapshots track which version was used.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-50">
            ↓ Template
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">
            <Upload className="w-4 h-4" /> Upload Dataset
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-2xl mb-4">🗄️</div>
          <h2 className="text-base font-semibold text-gray-700 mb-1">No datasets yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-xs">Upload a JSON, JSONL, or CSV file with your evaluation test cases.</p>
          <div className="flex gap-3">
            <button onClick={downloadTemplate} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50">↓ Download template</button>
            <button onClick={() => setShowUpload(true)} className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Upload Dataset
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map(d => (
            <DatasetCard key={d.id} dataset={d} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

      {showUpload && <UploadDrawer onDone={d => setDatasets(prev => [d, ...prev])} onClose={() => setShowUpload(false)} />}
    </div>
  )
}
