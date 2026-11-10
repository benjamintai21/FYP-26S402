import { createContext, useContext, useState } from 'react';
import { fetchRecommendation } from '../api';
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
  const [user, setUser] = useState(() => load('h360_user', null));
  const [history, setHistory] = useState(() => load('h360_history', []));
  const [latest, setLatest] = useState(() => load('h360_latest', null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateUser = (next) => {
    setUser(next);
    save('h360_user', next);
  };

  const register = ({ name, email }) =>
    updateUser({ name, email, onboarded: false, baseline: DEFAULT_BASELINE });

  const login = ({ email }) => {
    const existing = load('h360_user', null);
    if (!existing || existing.email !== email) {
      throw new Error('No account found for that email. Please register first.');
    }
    setUser(existing);
  };

  const logout = () => setUser(null);

  const completeOnboarding = (profile) => updateUser({ ...user, ...profile, onboarded: true });

  const generatePlan = async (metrics) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRecommendation(metrics);
      const entry = { date: new Date().toISOString().slice(0, 10), metrics };
      const nextHistory = [...history.filter((h) => h.date !== entry.date), entry].slice(-30);
      const nextLatest = { ...result, metrics };
      setHistory(nextHistory);
      setLatest(nextLatest);
      save('h360_history', nextHistory);
      save('h360_latest', nextLatest);
      return nextLatest;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const value = { user, history, latest, loading, error, register, login, logout, completeOnboarding, generatePlan };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);