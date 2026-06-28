import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { billing } from '../../lib/api'

interface BillingStatus {
  plan: 'free' | 'pro' | 'enterprise'
  subscription_status: string | null
  current_period_end: number | null
  max_agents: number
  max_evaluations_per_month: number
  max_datasets: number
  stripe_enabled: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  pro_price_id: string | null
  enterprise_price_id: string | null
}

const PLANS = [
  {
    id: 'free' as const,
    name: 'Free',
    price: '$0',
    desc: 'Get started with core evaluations & dashboards.',
    features: ['5 agents', '100 evaluations/month', '5 datasets', 'Basic metrics', 'Community support'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '$49',
    desc: 'Scheduling, red-team scans & higher limits.',
    features: ['25 agents', '10,000 evaluations/month', '100 datasets', 'All metrics', 'Security frameworks', 'Priority support'],
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 'Custom',
    desc: 'SSO, Approval Gateway & dedicated support.',
    features: ['Unlimited agents', 'Unlimited evaluations', 'Custom metrics', 'Approval Gateway', 'SSO & isolation', 'Dedicated support'],
  },
]

export default function CurrentPlanPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [searchParams] = useSearchParams()

  const successMsg = searchParams.get('success') === '1' ? 'Subscription activated! Your plan has been upgraded.' : ''
  const cancelledMsg = searchParams.get('cancelled') === '1' ? 'Checkout cancelled — no changes made.' : ''

  useEffect(() => {
    billing.status()
      .then(setStatus)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load billing info'))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpgrade(priceId: string | null) {
    if (!priceId) {
      window.open('mailto:sales@ittiqan.ai?subject=Enterprise%20Inquiry', '_blank')
      return
    }
    setActionLoading(true)
    setActionError('')
    try {
      const res = await billing.checkout(priceId)
      window.location.href = res.checkout_url
    } catch (e: any) {
      setActionError(e instanceof Error ? e.message : 'Failed to start checkout')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleManage() {
    setActionLoading(true)
    setActionError('')
    try {
      const res = await billing.portal()
      window.location.href = res.portal_url
    } catch (e: any) {
      setActionError(e instanceof Error ? e.message : 'Failed to open billing portal')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (error) return (
    <div className="p-8 max-w-md">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
    </div>
  )

  const currentPlan = status?.plan ?? 'free'
  const hasSub = Boolean(status?.stripe_subscription_id)
  const periodEnd = status?.current_period_end
    ? new Date(status.current_period_end * 1000).toLocaleDateString()
    : null

  function priceIdForPlan(id: string): string | null {
    if (id === 'pro') return status?.pro_price_id ?? null
    if (id === 'enterprise') return status?.enterprise_price_id ?? null
    return null
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Current Plan</h1>
      <p className="text-gray-500 text-sm mb-6">Manage your subscription and billing.</p>

      {successMsg && (
        <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">{successMsg}</div>
      )}
      {cancelledMsg && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">{cancelledMsg}</div>
      )}
      {actionError && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{actionError}</div>
      )}

      <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Active Plan</p>
          <p className="text-lg font-bold text-gray-900 capitalize">{currentPlan}</p>
          {periodEnd && <p className="text-xs text-gray-400 mt-0.5">Renews {periodEnd}</p>}
          {status?.subscription_status === 'past_due' && (
            <p className="text-xs text-red-600 mt-0.5 font-medium">⚠ Payment past due — update payment method</p>
          )}
        </div>
        <div className="text-right text-sm text-gray-500 space-y-0.5">
          <p>{status?.max_agents === 0 ? 'Unlimited' : status?.max_agents} agents</p>
          <p>{status?.max_evaluations_per_month === 0 ? 'Unlimited' : `${status?.max_evaluations_per_month?.toLocaleString()}/mo`} evaluations</p>
          {hasSub && (
            <button
              onClick={handleManage}
              disabled={actionLoading}
              className="mt-2 text-xs text-cyan-600 hover:underline font-medium"
            >
              Manage subscription →
            </button>
          )}
        </div>
      </div>

      {!status?.stripe_enabled && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Billing is not configured. Set <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code> and price IDs in the backend <code>.env</code> to enable upgrades.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan
          const priceId = priceIdForPlan(plan.id)
          const canUpgrade = status?.stripe_enabled && !isCurrent && plan.id !== 'free'
          const isEnterprise = plan.id === 'enterprise'

          return (
            <div
              key={plan.id}
              className={`rounded-xl border-2 p-6 ${isCurrent ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                {isCurrent && <span className="text-xs bg-cyan-500 text-white px-2 py-0.5 rounded-full">Current</span>}
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {plan.price}
                <span className="text-base font-normal text-gray-400">{plan.price !== 'Custom' ? '/mo' : ''}</span>
              </div>
              <p className="text-gray-500 text-sm mb-4">{plan.desc}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="text-cyan-500">✓</span>{f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <button className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
                  Current Plan
                </button>
              ) : plan.id === 'free' ? (
                <button className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
                  Downgrade via portal
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(isEnterprise ? null : priceId)}
                  disabled={actionLoading || (!canUpgrade && !isEnterprise)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Loading…' : isEnterprise ? 'Contact Sales' : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
