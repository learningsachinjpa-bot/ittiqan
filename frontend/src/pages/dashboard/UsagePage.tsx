import { useEffect, useState } from 'react'
import { orgs, agents, datasets, evaluations, security } from '../../lib/api'

interface UsageItem { label: string; used: number; limit: number }

export default function UsagePage() {
  const [items, setItems] = useState<UsageItem[]>([])
  const [resetDate, setResetDate] = useState('')
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [org, agentList, datasetList, evalList, secList] = await Promise.all([
          orgs.me(),
          agents.list(),
          datasets.list(),
          evaluations.list(),
          security.list(),
        ])

        const now = new Date()
        const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        setResetDate(nextReset.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
        setPlan(org.plan)

        setItems([
          { label: 'Agents Connected', used: agentList.length, limit: org.max_agents },
          { label: 'Evaluations Run', used: evalList.length, limit: org.max_evaluations_per_month },
          { label: 'Datasets Uploaded', used: datasetList.length, limit: org.max_datasets },
          { label: 'Security Scans', used: secList.length, limit: 5 },
        ])
      } catch (e) {
        setError((e as Error).message || 'Failed to load usage data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Usage</h1>
      <p className="text-gray-500 text-sm mb-6">Monitor your platform usage and limits.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-2 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Usage</h1>
      <p className="text-gray-500 text-sm mb-6">Monitor your platform usage and limits.</p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => {
          const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0
          const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-cyan-500'
          return (
            <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <span className="text-sm text-gray-500">{item.used} / {item.limit < 0 ? '∞' : item.limit}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-2 ${barColor} rounded-full transition-all`} style={{ width: `${item.limit < 0 ? 0 : pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {item.limit < 0 ? 'Unlimited' : `${item.limit - item.used} remaining`}
              </p>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-cyan-50 border border-cyan-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Reset Period</h2>
        <p className="text-sm text-gray-500">
          Your usage resets on {resetDate}.{' '}
          {plan === 'free' && 'Upgrade to Pro for higher limits.'}
          {plan === 'pro' && 'You are on the Pro plan.'}
          {plan === 'enterprise' && 'You have an Enterprise plan with unlimited usage.'}
        </p>
      </div>
    </div>
  )
}
