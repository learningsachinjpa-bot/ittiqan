export default function CurrentPlanPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Current Plan</h1>
      <p className="text-gray-500 text-sm mb-6">Manage your subscription and billing.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { name: 'Free', price: '$0', desc: 'Get started with core evaluations & dashboards.', current: true, features: ['5 agents', '100 evaluations/month', 'Basic metrics', 'Community support'] },
          { name: 'Pro', price: '$49', desc: 'Scheduling, red-team scans & higher limits.', current: false, features: ['25 agents', '10,000 evaluations/month', 'All metrics', 'Security frameworks', 'Priority support'] },
          { name: 'Enterprise', price: 'Custom', desc: 'SSO, isolation & dedicated support.', current: false, features: ['Unlimited agents', 'Unlimited evaluations', 'Custom metrics', 'SSO & isolation', 'Dedicated support'] },
        ].map(plan => (
          <div key={plan.name} className={`rounded-xl border-2 p-6 ${plan.current ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 bg-white'}`}>
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              {plan.current && <span className="text-xs bg-cyan-500 text-white px-2 py-0.5 rounded-full">Current</span>}
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{plan.price}<span className="text-base font-normal text-gray-400">{plan.price !== 'Custom' ? '/mo' : ''}</span></div>
            <p className="text-gray-500 text-sm mb-4">{plan.desc}</p>
            <ul className="space-y-2 mb-6">
              {plan.features.map(f => <li key={f} className="text-sm text-gray-600 flex items-center gap-2"><span className="text-cyan-500">✓</span>{f}</li>)}
            </ul>
            <button className={`w-full py-2.5 rounded-lg text-sm font-medium ${plan.current ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-cyan-500 text-white hover:bg-cyan-600'}`}>
              {plan.current ? 'Current Plan' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
