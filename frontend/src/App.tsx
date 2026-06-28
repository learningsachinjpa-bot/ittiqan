import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardLayout from './layouts/DashboardLayout'
import OverviewPage from './pages/dashboard/OverviewPage'
import AgentsRegistryPage from './pages/dashboard/AgentsRegistryPage'
import ConnectAgentPage from './pages/dashboard/ConnectAgentPage'
import ModelsPage from './pages/dashboard/ModelsPage'
import TeamPage from './pages/dashboard/TeamPage'
import CurrentPlanPage from './pages/dashboard/CurrentPlanPage'
import UsagePage from './pages/dashboard/UsagePage'
import ProjectLayout from './layouts/ProjectLayout'
import ProjectOverviewPage from './pages/project/ProjectOverviewPage'
import MetricsConfigPage from './pages/project/MetricsConfigPage'
import DatasetsPage from './pages/project/DatasetsPage'
import EvaluationsPage from './pages/project/EvaluationsPage'
import SchedulePage from './pages/project/SchedulePage'
import SecurityFrameworksPage from './pages/project/SecurityFrameworksPage'
import SecurityAssessmentsPage from './pages/project/SecurityAssessmentsPage'
import ObservabilityTracesPage from './pages/project/ObservabilityTracesPage'
import ObservabilityAlertsPage from './pages/project/ObservabilityAlertsPage'
import ReliabilityUptimePage from './pages/project/ReliabilityUptimePage'
import ReliabilityIncidentsPage from './pages/project/ReliabilityIncidentsPage'
import TestingValidationsPage from './pages/project/TestingValidationsPage'
import ApprovalsQueuePage from './pages/approvals/ApprovalsQueuePage'
import ApprovalsHistoryPage from './pages/approvals/ApprovalsHistoryPage'
import { AuthProvider, useAuth } from './context/AuthContext'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900">
    <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function OnboardingRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  // If user already has an org, go straight to dashboard
  if (user.org) return <Navigate to="/dashboard" replace />
  return <OnboardingPage />
}

function CatchAllRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.org ? '/dashboard' : '/onboarding'} replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  // Already logged in — send to right place
  if (user) return <Navigate to={user.org ? '/dashboard' : '/onboarding'} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<OverviewPage />} />
              <Route path="agents" element={<AgentsRegistryPage />} />
              <Route path="agents/connect" element={<ConnectAgentPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="plan" element={<CurrentPlanPage />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="approvals" element={<ApprovalsQueuePage />} />
              <Route path="approvals/history" element={<ApprovalsHistoryPage />} />
            </Route>
            <Route path="/project/:id" element={<ProtectedRoute><ProjectLayout /></ProtectedRoute>}>
              <Route index element={<ProjectOverviewPage />} />
              <Route path="metrics" element={<MetricsConfigPage />} />
              <Route path="datasets" element={<DatasetsPage />} />
              <Route path="evaluations" element={<EvaluationsPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="security/frameworks" element={<SecurityFrameworksPage />} />
              <Route path="security/assessments" element={<SecurityAssessmentsPage />} />
              <Route path="observability/traces" element={<ObservabilityTracesPage />} />
              <Route path="observability/alerts" element={<ObservabilityAlertsPage />} />
              <Route path="reliability/uptime" element={<ReliabilityUptimePage />} />
              <Route path="reliability/incidents" element={<ReliabilityIncidentsPage />} />
              <Route path="testing" element={<TestingValidationsPage />} />
            </Route>
            <Route path="*" element={<CatchAllRoute />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
