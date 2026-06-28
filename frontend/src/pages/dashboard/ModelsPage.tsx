import { useState, useEffect, useRef } from 'react'
import { llmProviders } from '../../lib/api'
import type { LLMProvider } from '../../types'
import { Plus, Zap, Trash2, Eye, EyeOff, CheckCircle, XCircle, ChevronDown, ChevronUp, Check, X } from 'lucide-react'

// ── Brand logos ───────────────────────────────────────────────────────────────

const Logo = ({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) => {
  const cls = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  switch (type) {
    // ── Anthropic — terracotta "A" mark ──
    case 'anthropic': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#CC785C"/>
        <path d="M19.2 8h-3L11 24h3l1.3-3.5h5.4L22 24h3L19.2 8zm-3.1 9.8 1.9-5.3 1.9 5.3h-3.8z" fill="white"/>
      </svg>
    )
    // ── OpenAI — swirl on black ──
    case 'openai': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#000"/>
        <path d="M22.5 13.1a5.3 5.3 0 0 0-.5-4.4 5.5 5.5 0 0 0-5.9-2.6A5.5 5.5 0 0 0 12 4.5a5.5 5.5 0 0 0-5.2 3.8 5.5 5.5 0 0 0-3.6 2.6 5.5 5.5 0 0 0 .7 6.5 5.3 5.3 0 0 0 .5 4.4 5.5 5.5 0 0 0 5.9 2.6A5.5 5.5 0 0 0 14 25.5a5.5 5.5 0 0 0 5.2-3.8 5.5 5.5 0 0 0 3.6-2.6 5.5 5.5 0 0 0-.3-6zM14 23.8c-1 0-1.8-.3-2.5-.9l.1-.1 4.2-2.4c.2-.1.3-.3.3-.5v-5.8l1.8 1v4.7A3.8 3.8 0 0 1 14 23.8zm-8.2-3.5a3.8 3.8 0 0 1-.5-2.6l.1.1 4.2 2.4c.2.1.4.1.6 0l5.1-3v2l-4.2 2.4a3.8 3.8 0 0 1-5.3-1.3zm-1-8.8a3.8 3.8 0 0 1 2-1.7v4.9c0 .2.1.4.3.5l5.1 2.9-1.8 1.1-4.2-2.4a3.8 3.8 0 0 1-1.4-5.3zm14.8 3.3-5.1-3 1.8-1 4.2 2.4a3.8 3.8 0 0 1-.6 6.9v-4.9a.6.6 0 0 0-.3-.4zm1.7-2.6-.1-.1-4.2-2.4a.6.6 0 0 0-.6 0l-5.1 3V11.6l4.2-2.4a3.8 3.8 0 0 1 5.8 4zm-11.1 3.7-1.8-1V10c0-.2.1-.4.3-.5a3.8 3.8 0 0 1 5.8 1.5l-.1.1-4.2 2.3v.8z" fill="white"/>
      </svg>
    )
    // ── Google Gemini — sparkle star ──
    case 'gemini': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#1A73E8"/>
        <path d="M16 4c0 6.6-5.4 12-12 12 6.6 0 12 5.4 12 12 0-6.6 5.4-12 12-12-6.6 0-12-5.4-12-12z" fill="white"/>
      </svg>
    )
    // ── Mistral — pixel blocks in orange ──
    case 'mistral': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#F7431C"/>
        <rect x="5" y="7" width="5" height="5" fill="white" rx="0.5"/>
        <rect x="12" y="7" width="5" height="5" fill="white" rx="0.5"/>
        <rect x="19" y="7" width="7" height="5" fill="white" rx="0.5"/>
        <rect x="5" y="14" width="5" height="5" fill="white" rx="0.5"/>
        <rect x="19" y="14" width="7" height="5" fill="white" rx="0.5"/>
        <rect x="5" y="21" width="5" height="4" fill="white" rx="0.5"/>
        <rect x="12" y="21" width="5" height="4" fill="white" rx="0.5"/>
        <rect x="19" y="21" width="7" height="4" fill="white" rx="0.5"/>
      </svg>
    )
    // ── Groq — lightning bolt ──
    case 'groq': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#F55036"/>
        <path d="M19 5l-8 12h6l-4 10 10-13h-6z" fill="white"/>
      </svg>
    )
    // ── Ollama — two eyes / llama face ──
    case 'ollama': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#1C1C1C"/>
        <circle cx="11.5" cy="13" r="3" fill="white"/>
        <circle cx="20.5" cy="13" r="3" fill="white"/>
        <circle cx="11.5" cy="13" r="1.2" fill="#1C1C1C"/>
        <circle cx="20.5" cy="13" r="1.2" fill="#1C1C1C"/>
        <path d="M10 21c1 1.5 2.5 2.5 6 2.5s5-1 6-2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    )
    // ── Azure OpenAI — Azure A on blue ──
    case 'azure_openai': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#0078D4"/>
        <path d="M10 22l5-14 2.5 7H14l-1.5 3.5z" fill="white"/>
        <path d="M17.5 22l5-14 1.5 14-2-.3-1-4-3 4.3z" fill="white" opacity="0.85"/>
      </svg>
    )
    // ── AWS Bedrock — orange smile ──
    case 'bedrock': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#FF9900"/>
        <path d="M8 16a8 8 0 0 0 16 0" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M16 8v4M12 9.5l2 3.5M20 9.5l-2 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
    // ── Google Vertex AI — multicolor G ──
    case 'vertex_ai': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1"/>
        <path d="M22 16.5h-6.5V19H20a4 4 0 0 1-4 3 5 5 0 1 1 0-10c1.3 0 2.4.5 3.3 1.3l1.9-1.9A8 8 0 0 0 16 9a8 8 0 0 0 0 16 7.5 7.5 0 0 0 6-12.5z" fill="#4285F4"/>
        <path d="M8 12l4 4-4 4V12z" fill="#34A853"/>
        <path d="M8 12l4 4H8V12z" fill="#FBBC05"/>
        <path d="M8 20l4-4H8v4z" fill="#EA4335"/>
      </svg>
    )
    // ── Together AI — two dots ──
    case 'together': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#0D0D0D"/>
        <circle cx="12" cy="16" r="4" fill="white"/>
        <circle cx="20" cy="16" r="4" fill="#6366F1"/>
        <ellipse cx="16" cy="16" rx="2" ry="4" fill="#818CF8"/>
      </svg>
    )
    // ── Perplexity — star/compass ──
    case 'perplexity': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#20B2AA"/>
        <path d="M16 5l2.5 8H26l-6.5 4.5 2.5 8L16 21l-6 4.5 2.5-8L6 13h7.5z" fill="white"/>
      </svg>
    )
    // ── xAI / Grok — X mark ──
    case 'xai': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#000"/>
        <path d="M8 8l7.5 9.5L8 25h2.5l6.2-6.7L22.5 25H27l-8-10.2L26.5 8H24l-5.8 6.2L13 8z" fill="white"/>
      </svg>
    )
    // ── Cerebras — circuit chip ──
    case 'cerebras': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#FF4F00"/>
        <rect x="10" y="10" width="12" height="12" rx="2" fill="white"/>
        <rect x="13" y="13" width="6" height="6" rx="1" fill="#FF4F00"/>
        <path d="M13 8v2M16 8v2M19 8v2M13 22v2M16 22v2M19 22v2M8 13h2M8 16h2M8 19h2M22 13h2M22 16h2M22 19h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
    // ── Cohere — coral wave ──
    case 'cohere': return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#39594D"/>
        <circle cx="16" cy="16" r="6" fill="none" stroke="white" strokeWidth="2"/>
        <circle cx="16" cy="16" r="3" fill="white"/>
        <path d="M16 7v3M25 16h-3M16 25v-3M7 16h3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
    default: return (
      <svg viewBox="0 0 32 32" className={`${cls} flex-shrink-0`}>
        <rect width="32" height="32" rx="8" fill="#6B7280"/>
        <circle cx="16" cy="16" r="5" stroke="white" strokeWidth="1.5" fill="none"/>
        <path d="M16 7v3M16 22v3M7 16h3M22 16h3" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    )
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_NAMES: Record<string, string> = {
  anthropic:   'Anthropic',
  openai:      'OpenAI',
  gemini:      'Google Gemini',
  mistral:     'Mistral AI',
  groq:        'Groq',
  ollama:      'Ollama',
  azure_openai:'Azure OpenAI',
  bedrock:     'AWS Bedrock',
  vertex_ai:   'Vertex AI',
  together:    'Together AI',
  perplexity:  'Perplexity',
  xai:         'xAI / Grok',
  cerebras:    'Cerebras',
  cohere:      'Cohere',
  custom:      'Custom',
}

const NEEDS_BASE_URL = new Set(['ollama', 'azure_openai', 'bedrock', 'vertex_ai', 'custom'])

// ── Inline key field ──────────────────────────────────────────────────────────

function UpdateKeyField({ hasKey, onSave }: { hasKey: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span className={`text-sm font-mono ${hasKey ? 'text-gray-400' : 'text-amber-500 font-sans'}`}>
          {hasKey ? '••••••••••••••••' : 'No key — provider will not work'}
        </span>
        <button onClick={() => setEditing(true)} className="text-xs text-cyan-500 hover:text-cyan-600 font-semibold underline underline-offset-2">
          {hasKey ? 'Update' : 'Add key'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)}
          placeholder="Paste new key..." autoFocus style={{ paddingRight: '2.5rem' }}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(false); setValue('') } }} />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <button onClick={() => { if (value) { onSave(value); setEditing(false); setValue('') } }} disabled={!value}
        className="p-2 text-green-500 hover:text-green-600 disabled:opacity-30 rounded-lg hover:bg-green-50">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={() => { setEditing(false); setValue('') }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({ provider, supportedModels, onUpdate, onDelete }: {
  provider: LLMProvider
  supportedModels: Record<string, string[]>
  onUpdate: (id: string, data: Partial<LLMProvider & { api_key: string }>) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [editName, setEditName] = useState(false)
  const [nameDraft, setNameDraft] = useState(provider.name)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editName) nameRef.current?.focus() }, [editName])

  const save = async (field: string, value: string | boolean) => {
    setSaving(true)
    try { await onUpdate(provider.id, { [field]: value }) }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await llmProviders.test(provider.id)
      setTestResult({
        success: result.success,
        message: result.success ? (result.response?.slice(0, 100) || 'Connected') : (result.error ?? 'Connection failed'),
      })
    } catch (e: any) {
      setTestResult({ success: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  const models = supportedModels[provider.provider_type] || []

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 ${expanded ? 'border-cyan-200 shadow-lg' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>

      {/* ── Card header ── */}
      <div className="p-5 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <Logo type={provider.provider_type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-gray-900 truncate">{provider.name}</span>
            {saving && <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          </div>
          <span className="text-xs text-gray-400">{PROVIDER_NAMES[provider.provider_type]} &middot; <code className="font-mono">{provider.model_name}</code></span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {provider.is_default_judge && (
            <span className="hidden sm:inline text-xs font-medium bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full">Judge</span>
          )}
          {provider.is_default_attacker && (
            <span className="hidden sm:inline text-xs font-medium bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full">Attacker</span>
          )}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${provider.has_api_key ? 'bg-green-400' : 'bg-amber-400'}`} />
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-50">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Test result ── */}
      {testResult && (
        <div className={`mx-5 mb-3 px-4 py-3 rounded-xl text-sm flex items-start gap-2.5 border ${testResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {testResult.success
            ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
            : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />}
          <span className="leading-relaxed">{testResult.message}</span>
        </div>
      )}

      {/* ── Expanded edit area ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pt-5 pb-5 space-y-5">

          {/* Name + model in one row */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Display name</label>
              {editName ? (
                <div className="flex items-center gap-1.5">
                  <input ref={nameRef} value={nameDraft} onChange={e => setNameDraft(e.target.value)} className="text-sm py-1.5 px-2"
                    onKeyDown={e => { if (e.key === 'Enter') { save('name', nameDraft); setEditName(false) } if (e.key === 'Escape') setEditName(false) }} />
                  <button onClick={() => { save('name', nameDraft); setEditName(false) }} className="text-green-500 p-1 rounded hover:bg-green-50"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditName(false)} className="text-gray-400 p-1 rounded hover:bg-gray-50"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setNameDraft(provider.name); setEditName(true) }}>
                  <span className="text-sm text-gray-800">{provider.name}</span>
                  <svg className="w-3 h-3 text-gray-300 group-hover:text-cyan-400 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-9 9a1 1 0 0 1-.5.3l-3 .7a.5.5 0 0 1-.6-.6l.7-3a1 1 0 0 1 .3-.5l9-9z"/>
                  </svg>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Model</label>
              {models.length > 0 ? (
                <select defaultValue={provider.model_name} onChange={e => save('model_name', e.target.value)} className="text-sm py-1.5" style={{ width: '100%' }}>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input defaultValue={provider.model_name} onBlur={e => { if (e.target.value !== provider.model_name) save('model_name', e.target.value) }} className="text-sm py-1.5" />
              )}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">API Key</label>
            <UpdateKeyField hasKey={provider.has_api_key} onSave={v => save('api_key', v)} />
          </div>

          {/* Base URL if needed */}
          {NEEDS_BASE_URL.has(provider.provider_type) && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Base URL</label>
              <input defaultValue={provider.base_url || ''} placeholder={provider.provider_type === 'ollama' ? 'http://localhost:11434' : 'https://...'}
                onBlur={e => { if (e.target.value !== (provider.base_url || '')) save('base_url', e.target.value) }} className="text-sm py-1.5" />
            </div>
          )}

          {/* Role toggles */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${provider.is_default_judge ? 'bg-purple-500 border-purple-500' : 'border-gray-300 hover:border-purple-300'}`}
                onClick={() => save('is_default_judge', !provider.is_default_judge)}>
                {provider.is_default_judge && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-sm text-gray-700">Default judge</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${provider.is_default_attacker ? 'bg-red-500 border-red-500' : 'border-gray-300 hover:border-red-300'}`}
                onClick={() => save('is_default_attacker', !provider.is_default_attacker)}>
                {provider.is_default_attacker && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-sm text-gray-700">Default attacker</span>
            </label>
          </div>

          {/* Usage stats */}
          <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3">
            <div><p className="text-xs text-gray-400 mb-0.5">Total calls</p><p className="text-sm font-medium text-gray-700">{(provider.total_calls ?? 0).toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-400 mb-0.5">Tokens used</p><p className="text-sm font-medium text-gray-700">{(provider.total_tokens_used ?? 0).toLocaleString()}</p></div>
            <div><p className="text-xs text-gray-400 mb-0.5">Total cost</p><p className="text-sm font-medium text-gray-700">${(provider.total_cost_usd ?? 0).toFixed(4)}</p></div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-1">
        <button onClick={handleTest} disabled={testing || !provider.has_api_key}
          title={!provider.has_api_key ? 'Add API key first' : ''}
          className="flex-1 flex items-center justify-center gap-2 text-sm py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          {testing ? <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
          {testing ? 'Testing...' : 'Test connection'}
        </button>
        <button onClick={() => onDelete(provider.id)} className="p-2 rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Add provider drawer (right slide-in) ──────────────────────────────────────

function AddDrawer({ supportedModels, onAdd, onClose }: {
  supportedModels: Record<string, string[]>
  onAdd: (data: { name: string; provider_type: string; model_name: string; api_key: string; base_url: string; is_default_judge: boolean; is_default_attacker: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: '', provider_type: 'anthropic', model_name: '',
    api_key: '', base_url: '', is_default_judge: false, is_default_attacker: false,
  })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const models = supportedModels[form.provider_type] || []

  const submit = async () => {
    if (!form.name.trim()) return setError('Give this provider a display name.')
    if (!form.model_name.trim()) return setError('Select or enter a model name.')
    setError('')
    setSaving(true)
    try { await onAdd(form); onClose() }
    catch (e: any) { setError(e.message || 'Failed to add provider') }
    finally { setSaving(false) }
  }

  const setField = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">

        <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Add LLM Provider</h2>
              <p className="text-xs text-gray-400 mt-0.5">API keys encrypted with AES-256 — never logged or exposed</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

          {/* Provider grid */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Provider</label>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(PROVIDER_NAMES).map(([key, name]) => (
                <button key={key} onClick={() => setForm(f => ({ ...f, provider_type: key, model_name: '', name: f.name || '' }))}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${form.provider_type === key ? 'border-cyan-400 bg-cyan-50' : 'border-gray-100 hover:border-gray-200 bg-gray-50'}`}>
                  <Logo type={key} size="sm" />
                  <span className="text-xs text-gray-600 font-medium leading-tight text-center">{name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Display name</label>
            <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder={`e.g. ${PROVIDER_NAMES[form.provider_type]} Judge`} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Model</label>
            {models.length > 0 ? (
              <select value={form.model_name} onChange={e => setField('model_name', e.target.value)}>
                <option value="">Select model...</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={form.model_name} onChange={e => setField('model_name', e.target.value)} placeholder="Enter model name" />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">API Key</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={form.api_key} onChange={e => setField('api_key', e.target.value)}
                placeholder={form.provider_type === 'ollama' ? 'Leave empty for local Ollama' : 'sk-...'} style={{ paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {NEEDS_BASE_URL.has(form.provider_type) && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Base URL</label>
              <input value={form.base_url} onChange={e => setField('base_url', e.target.value)}
                placeholder={form.provider_type === 'ollama' ? 'http://localhost:11434' : 'https://your-endpoint'} />
            </div>
          )}

          <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Role</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.is_default_judge ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}
                onClick={() => setField('is_default_judge', !form.is_default_judge)}>
                {form.is_default_judge && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Default judge</p>
                <p className="text-xs text-gray-400 mt-0.5">This model will score every evaluation metric across all agents in your org</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.is_default_attacker ? 'bg-red-500 border-red-500' : 'border-gray-300'}`}
                onClick={() => setField('is_default_attacker', !form.is_default_attacker)}>
                {form.is_default_attacker && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Default attacker</p>
                <p className="text-xs text-gray-400 mt-0.5">This model generates adversarial prompts for red-team security assessments</p>
              </div>
            </label>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-medium">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 text-sm bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Connecting...' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [supportedModels, setSupportedModels] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    Promise.all([llmProviders.list(), llmProviders.supportedModels()])
      .then(([list, models]) => { setProviders(list); setSupportedModels(models) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async (data: Parameters<typeof llmProviders.create>[0]) => {
    const p = await llmProviders.create(data)
    setProviders(prev => [...prev, p])
  }

  const handleUpdate = async (id: string, data: Parameters<typeof llmProviders.update>[1]) => {
    const updated = await llmProviders.update(id, data)
    setProviders(prev => prev.map(p => p.id === id ? updated : p))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this provider? Evaluations using it will fall back to the next available provider.')) return
    await llmProviders.delete(id)
    setProviders(prev => prev.filter(p => p.id !== id))
  }

  const defaultJudge = providers.find(p => p.is_default_judge)
  const defaultAttacker = providers.find(p => p.is_default_attacker)

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LLM Providers</h1>
          <p className="text-gray-400 text-sm mt-1">Connect models as evaluation judge or red-team attacker.<br/>Keys are encrypted at rest with AES-256.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors flex-shrink-0 ml-4">
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      {/* Live status bar */}
      {providers.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-6 px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-gray-400">Judge</span>
            <span className="font-medium text-gray-800">{defaultJudge?.name ?? <span className="text-amber-500 font-normal">Not set</span>}</span>
          </div>
          <div className="w-px bg-gray-100 self-stretch" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-gray-400">Attacker</span>
            <span className="font-medium text-gray-800">{defaultAttacker?.name ?? <span className="text-amber-500 font-normal">Not set</span>}</span>
          </div>
          <div className="w-px bg-gray-100 self-stretch" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-gray-400">{providers.filter(p => p.has_api_key).length}/{providers.length} connected</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : providers.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-semibold text-gray-700 mb-1">No providers connected</p>
          <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">Connect at least one LLM to run evaluations and red-team assessments.</p>
          <button onClick={() => setShowAdd(true)} className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800">Add your first provider</button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(p => (
            <ProviderCard key={p.id} provider={p} supportedModels={supportedModels} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showAdd && <AddDrawer supportedModels={supportedModels} onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
