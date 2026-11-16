import { createContext, useContext, useState, useEffect } from 'react';
import { logMetrics, getTrends, registerUser, loginUser, logoutUser, getMe } from '../api';
import { DEFAULT_BASELINE } from '../constants';

const AppContext = createContext(null);

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('h360_token');
    if (token) {
      getMe()
        .then((res) => setUser(res.user))
        .catch(() => localStorage.removeItem('h360_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const register = async ({ name, email, password }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await registerUser(email, password, name);
      setUser(res.user);
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(email, password);
      setUser(res.user);
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setHistory([]);
    setLatest(null);
  };

  const completeOnboarding = (profile = {}) => {
    if (user) setUser({ ...user, onboarded: true, ...profile });
  };

  const generatePlan = async (metrics) => {
    setLoading(true);
    setError(null);
    try {
      const result = await logMetrics(metrics);
      const trends = await getTrends();
      setHistory(trends.logs || []);
      const nextLatest = { ...result, metrics };
      setLatest(nextLatest);
      return nextLatest;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    history,
    latest,
    loading,
    error,
    register,
    login,
    logout,
    completeOnboarding,
    generatePlan,
  };

  return (
    <AppContext.Provider value={value}>{children}</AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);