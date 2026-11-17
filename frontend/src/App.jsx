import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import LogInPage from './pages/LogInPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import Dashboard from './pages/Dashboard';
import LoggingPage from './pages/LoggingPage';
import ExplorerPage from './pages/ExplorerPage';
import BusinessPage from './pages/BusinessPage';
import ProfilePage from './pages/ProfilePage';
import ProfileEditPage from './pages/ProfileEditPage';
import DevResetPage from './pages/DevResetPage';
import GoalsPage from './pages/GoalsPage';
import MarketplacePage from './pages/MarketplacePage';
import SubscriptionPage from './pages/SubscriptionPage';
import PremiumPage from './pages/PremiumPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { MEMBER_ROLES } from './roles';
import './App.css';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app-root">
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/login" element={<LogInPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dev-reset" element={<DevResetPage />} />
            <Route
              path="/onboarding"
              element={<ProtectedRoute roles={MEMBER_ROLES} requireOnboarded={false}><OnboardingPage /></ProtectedRoute>}
            />
            <Route path="/dashboard" element={<ProtectedRoute roles={MEMBER_ROLES}><Dashboard /></ProtectedRoute>} />
            <Route path="/log" element={<ProtectedRoute roles={MEMBER_ROLES}><LoggingPage /></ProtectedRoute>} />
            <Route path="/explorer" element={<ProtectedRoute roles={MEMBER_ROLES}><ExplorerPage /></ProtectedRoute>} />
            <Route path="/goals" element={<ProtectedRoute roles={MEMBER_ROLES}><GoalsPage /></ProtectedRoute>} />
            <Route path="/subscription" element={<ProtectedRoute roles={MEMBER_ROLES} requireOnboarded={false}><SubscriptionPage /></ProtectedRoute>} />
            <Route path="/premium" element={<ProtectedRoute roles={['premium']}><PremiumPage /></ProtectedRoute>} />
            <Route path="/business" element={<ProtectedRoute roles={['business']} requireOnboarded={false}><BusinessPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute roles={['registered', 'premium', 'business']} requireOnboarded={false}><ProfilePage /></ProtectedRoute>} />
            <Route path="/profile/edit" element={<ProtectedRoute roles={['registered', 'premium', 'business']} requireOnboarded={false}><ProfileEditPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="site-footer">
            Healthy360 • Non-clinical lifestyle guidance only • Not medical advice
          </footer>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}