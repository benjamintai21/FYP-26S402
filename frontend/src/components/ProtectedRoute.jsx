import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { homeForRole } from '../roles';

export default function ProtectedRoute({ children, roles, requireOnboarded = true }) {
  const { user, loading } = useApp();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  if (requireOnboarded && !user.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}