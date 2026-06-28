import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { orgs } from '../lib/api'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('free')
  const [region, setRegion] = useState('uae')
  const [department, setDepartment] = useState('')
  const [useCase, setUseCase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setOrg } = useAuth()
  const navigate = useNavigate()

  const handleOrgName = (val: string) => {
    setOrgName(val)
    setSlug(val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    try {
      const org = await orgs.create({ name: orgName || 'My Organization', slug, plan, region, department: department || undefined, use_case: useCase || undefined })
      setOrg({ id: org.id, name: org.name, slug: org.slug, plan: org.plan })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to create organization')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Ittiqan</h1>
      <p className="text-gray-500 mb-8">Set up your organization to start validating your AI agents.</p>

      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        <div className={`h-1.5 w-16 rounded-full ${step >= 1 ? 'bg-cyan-500' : 'bg-gray-300'}`} />
        <div className={`h-1.5 w-16 rounded-full ${step >= 2 ? 'bg-cyan-500' : 'bg-gray-300'}`} />
      </div>

      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-lg">
        {step === 1 ? (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Your organization</h2>
            <p className="text-gray-500 text-sm mb-6">This is your isolated workspace — projects, evaluations and data live inside it.</p>

            <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">Organization name <span className="text-red-500">*</span></label>
            <input id="org-name" value={orgName} onChange={e => handleOrgName(e.target.value)} placeholder="e.g. Acme AI" className="w-full border border-cyan-400 rounded-lg px-4 py-2.5 text-sm focus:outline-none mb-4" />

            <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700 mb-1">Workspace URL slug</label>
            <input id="org-slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-ai" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none mb-1" />
            <p className="text-xs text-gray-400 mb-6">Auto-generated from the name. Lowercase letters, numbers and hyphens.</p>

            {/* Region — determines which data residency & AI policies apply */}
            <p className="block text-sm font-medium text-gray-700 mb-3">Data Region</p>
            {(() => {
              const REGIONS = [
                {
                  key: 'uae',
                  flag: '🇦🇪',
                  name: 'UAE / GCC',
                  policy: 'PDPL',
                  desc: 'UAE Personal Data Protection Law. Data stays in-country. Required for government and regulated entities.',
                  tags: ['PDPL compliant', 'In-country storage', 'Arabic support'],
                },
                {
                  key: 'eu',
                  flag: '🇪🇺',
                  name: 'Europe',
                  policy: 'GDPR',
                  desc: 'GDPR compliant. Data processed and stored within the EU.',
                  tags: ['GDPR compliant', 'EU storage', 'Right to erasure'],
                },
                {
                  key: 'us',
                  flag: '🇺🇸',
                  name: 'United States',
                  policy: 'Standard',
                  desc: 'Standard US data handling. Best choice for global SaaS teams.',
                  tags: ['SOC 2 Type II', 'Global CDN', 'No data residency restrictions'],
                },
              ]
              return (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {REGIONS.map(r => (
                    <div key={r.key} onClick={() => setRegion(r.key)}
                      className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${region === r.key ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-cyan-200 hover:bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xl">{r.flag}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${region === r.key ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{r.policy}</span>
                      </div>
                      <p className="font-semibold text-gray-900 text-sm mt-1">{r.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{r.desc}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.tags.map(t => (
                          <span key={t} className={`text-xs px-1.5 py-0.5 rounded ${region === r.key ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-500'}`}>{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            <p className="block text-sm font-medium text-gray-700 mb-3">Plan</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { key: 'free', name: 'Free', desc: 'Get started — core evaluations & dashboards.' },
                { key: 'pro', name: 'Pro', desc: 'Scheduling, red-team scans & higher limits.' },
                { key: 'enterprise', name: 'Enterprise', desc: 'SSO, isolation & dedicated support.' },
              ].map(p => (
                <div key={p.key} onClick={() => setPlan(p.key)} className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${plan === p.key ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-cyan-300 hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                    {plan === p.key && <span className="text-xs bg-cyan-500 text-white px-1.5 py-0.5 rounded">✓</span>}
                  </div>
                  <p className="text-xs text-gray-500">{p.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setStep(2)} disabled={!orgName} className="bg-cyan-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-cyan-600 disabled:opacity-50">
                Continue →
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">A few details</h2>
            <p className="text-gray-500 text-sm mb-6">Optional — helps us tailor your workspace. You can change these later.</p>

            <label htmlFor="onboard-dept" className="block text-sm font-medium text-gray-700 mb-1">Team or department</label>
            <select id="onboard-dept" value={department} onChange={e => setDepartment(e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none mb-4">
              <option value="">Select a team or department...</option>
              <option>Engineering</option>
              <option>QA & Testing</option>
              <option>Product</option>
              <option>Security</option>
              <option>Business Operations</option>
              <option>Data Science</option>
            </select>

            <label htmlFor="onboarding-use-case" className="block text-sm font-medium text-gray-700 mb-1">What will you use Ittiqan for?</label>
            <textarea id="onboarding-use-case" value={useCase} onChange={e => setUseCase(e.target.value)} rows={4} placeholder="e.g. Evaluate our customer-support chatbot for accuracy and safety." className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none resize-none" />

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-50">
                ← Back
              </button>
              <button onClick={handleCreate} disabled={loading} className="bg-cyan-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-cyan-600 disabled:opacity-60">
                {loading ? 'Creating...' : 'Create workspace'}
              </button>
            </div>
          </>
        )}
      </div>

      <button onClick={() => navigate('/login')} className="mt-6 text-sm text-gray-400 hover:text-gray-600">Sign out</button>
    </div>
  )
}
