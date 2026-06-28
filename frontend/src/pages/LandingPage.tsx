import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">I</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">Ittiqan</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <a href="#platform" className="hover:text-gray-900">Platform</a>
          <a href="#how" className="hover:text-gray-900">How it Works</a>
          <a href="#integrate" className="hover:text-gray-900">Integrate</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-gray-700 hover:text-gray-900 px-4 py-2">Login</Link>
          <Link to="/signup" className="text-sm bg-cyan-500 text-white px-4 py-2 rounded-lg hover:bg-cyan-600 font-medium">Sign Up</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-8 py-20 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
            The Operating Layer for{' '}
            <span className="text-cyan-500">Trusted Agentic AI</span>
          </h1>
          <p className="text-gray-600 text-lg mb-8 leading-relaxed">
            Connect any AI agent or agentic workflow to Ittiqan for 360° coverage across evaluation, security, reliability, observability, and continuous testing & monitoring — the confidence, trust, and governance enterprises need to run AI in production.
          </p>
          <div className="flex gap-4">
            <Link to="/signup" className="bg-cyan-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-cyan-600">Request Demo</Link>
            <Link to="/signup" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50">Explore Platform</Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-16 flex flex-wrap gap-8 text-sm text-gray-500 border-t pt-8">
          {[['99.9%', 'Uptime Active'], ['70+', 'Quality Metrics'], ['46', 'Vulnerability Types'], ['6', 'Frameworks'], ['5', 'Reliability Tests'], ['360°', 'Agent Coverage'], ['150+', 'Integrations'], ['10K+', 'Evals/day']].map(([val, label]) => (
            <div key={label}>
              <span className="font-bold text-gray-900 text-base">{val}</span>
              <span className="ml-1">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section id="how" className="bg-gray-50 px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Can You Trust Your AI Agents in Production?</h2>
          <p className="text-gray-600 mb-12">Teams are shipping agents fast — but few can answer the questions that matter.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {[
              { icon: '🔮', title: 'Hallucinations', desc: 'Is it accurate? Does it make up facts?' },
              { icon: '🔒', title: 'Security Risks', desc: 'Is it secure against LLM and agent attacks?' },
              { icon: '⚡', title: 'Unpredictable Agents', desc: 'Is it reliable? Can you observe it in production?' },
              { icon: '📉', title: 'Model Drift', desc: 'Does quality degrade over time?' },
              { icon: '📋', title: 'Compliance Risks', desc: 'Regulatory violations and audit failures from inadequate monitoring.' },
            ].map(item => (
              <div key={item.title} className="flex gap-4 p-4 bg-white rounded-xl border border-gray-200">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-gray-500 text-sm mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform - 5 Layers */}
      <section id="platform" className="px-8 py-20 max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">One Platform. Five Layers of Trust.</h2>
        <p className="text-center text-gray-600 mb-12">Evaluation, Security, Reliability, Observability, and Testing & Monitoring — five integrated layers.</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { name: 'Evaluation', icon: '📊', desc: 'Measure what matters. Improve what facts.' },
            { name: 'Security', icon: '🛡️', desc: 'OWASP, NIST, MITRE framework compliance.' },
            { name: 'Reliability', icon: '⚙️', desc: 'A/B judge tests and score trend tracking.' },
            { name: 'Observability', icon: '👁️', desc: 'Tracing, alerts and live dashboards.' },
            { name: 'Testing & Monitoring', icon: '🧪', desc: 'Smoke tests, performance, scheduling.' },
          ].map(layer => (
            <div key={layer.name} className="p-5 border border-gray-200 rounded-xl hover:border-cyan-400 hover:shadow-md transition-all text-center">
              <div className="text-3xl mb-3">{layer.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{layer.name}</h3>
              <p className="text-gray-500 text-xs">{layer.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Steps */}
      <section className="bg-gray-50 px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">From Agent to Production-Ready in Three Steps</h2>
          <p className="text-gray-600 mb-12">Integrate evaluation, security, observability, and continuous testing into your AI workflow in minutes.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Connect Your AI Agent', desc: 'Point Ittiqan to your agent endpoint via REST API or SDK. Bring any LLM, model, or build-upon workflow — no lock-in.' },
              { step: '2', title: 'Define Evaluation & Security Rules', desc: 'Pick from 50+ METRIC types, set security behaviors (OWASP, MITRE, NIST), define AI quality standards.' },
              { step: '3', title: 'Monitor & Continuously Improve', desc: 'Run automated evaluations, scan all active sessions, get real-time observability, and ship with confidence at scale.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 bg-cyan-500 text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">{s.step}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
          <Link to="/signup" className="mt-10 inline-block bg-cyan-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-cyan-600">
            Get it on your agents — Request a demo →
          </Link>
        </div>
      </section>

      {/* Roles */}
      <section className="px-8 py-20 max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">One Lifecycle, Three Roles</h2>
        <p className="text-center text-gray-600 mb-12">Ittiqan follows your agents across their entire life — developers build and integrate, QA validates before release, and business teams monitor outcomes in production.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { role: 'Developers', icon: '💻', desc: 'Build your agents and integrate them with Ittiqan via REST API or SDK. Run evaluation reports to get deployment-ready agents and stay integration-ready, agents deploy with confidence.' },
            { role: 'QA & Test Engineers', icon: '🔬', desc: 'Validate quality before release. Pre-runs identify and solve risk early via MITRE, NIST, and other frameworks. Never ship blindly.' },
            { role: 'Business & Operations', icon: '📈', desc: 'Monitor agent behavior in production. Track performance, reliability, and cost. Stay aligned with business goals and governance requirements.' },
          ].map(r => (
            <div key={r.role} className="p-6 border border-gray-200 rounded-xl hover:shadow-md transition-all">
              <div className="text-4xl mb-4">{r.icon}</div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">{r.role}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Integration */}
      <section id="integrate" className="bg-gray-900 text-white px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Connect Your Agents in Minutes</h2>
          <p className="text-gray-400 mb-12">During the build phase, developers integrate agents into Ittiqan with a clean REST API and native SDKs.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
            {[
              { title: 'All It Up API', desc: 'Single HTTP endpoint — integrate with any stack.' },
              { title: 'SDK Support', desc: 'Python, Node.js and more. Out of the box.' },
              { title: 'Real-time Results', desc: 'Evaluate performance as evaluations run.' },
              { title: 'Enterprise Security', desc: 'Role access, audit logs, and enterprise-grade SSO.' },
              { title: 'High Performance', desc: 'Sub-second test calls to not slow down your team.' },
              { title: 'Webhooks & Events', desc: 'Trigger notifications or CI/CD when quality dips.' },
            ].map(f => (
              <div key={f.title} className="text-left p-4 bg-gray-800 rounded-xl border border-gray-700">
                <h4 className="font-semibold text-white mb-1">{f.title}</h4>
                <p className="text-gray-400 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-8 text-sm text-gray-400">
            {[['50+', 'Metrics'], ['6', 'Frameworks'], ['REST', 'API'], ['OTel', 'Support']].map(([val, label]) => (
              <div key={label} className="text-center">
                <div className="text-white font-bold text-lg">{val}</div>
                <div>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-20 max-w-4xl mx-auto text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">Run Agentic AI Your Enterprise Can Trust.</h2>
        <p className="text-gray-600 mb-8">Make Ittiqan the operating layer for your AI — evaluate, secure, and continuously monitor every agent from development to production.</p>
        <div className="flex justify-center gap-4">
          <Link to="/signup" className="bg-cyan-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-cyan-600">Request Demo</Link>
          <Link to="/signup" className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-medium hover:bg-gray-50">Contact Sales</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 px-8 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">I</span>
                </div>
                <span className="font-bold text-gray-900">Ittiqan</span>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">Ittiqan is the operating layer for trusted Agentic AI — evaluation, security, reliability, observability, and continuous testing & monitoring in one platform.</p>
            </div>
            {[
              { title: 'PRODUCT', links: ['Features', 'Pricing', 'Documentation', 'API Reference'] },
              { title: 'COMPANY', links: ['About Us', 'Blog', 'Careers', 'Contact'] },
              { title: 'RESOURCES', links: ['Help Center', 'Community', 'Case Studies', 'Webinars'] },
              { title: 'LEGAL', links: ['Privacy Policy', 'Terms of Service', 'Security', 'Compliance'] },
            ].map(col => (
              <div key={col.title}>
                <h4 className="text-xs font-semibold text-gray-400 mb-3 tracking-wider">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map(link => (
                    <li key={link}><a href="#" className="text-sm text-gray-600 hover:text-gray-900">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-6 flex justify-between items-center text-xs text-gray-400">
            <span>© 2026 Ittiqan. All rights reserved.</span>
            <span className="flex items-center gap-1">🛡️ Security & trust by design</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
