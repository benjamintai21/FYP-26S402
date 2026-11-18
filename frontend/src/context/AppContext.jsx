import { createContext, useContext, useState, useEffect } from 'react';
import { logMetrics, getTrends, getLatestRecommendation, registerUser, loginUser, logoutUser, getMe, saveOnboarding, syncSampleWearable, importLogs, importLogsCsv } from '../api';
import { MEMBER_ROLES } from '../roles';

const AppContext = createContext(null);

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

  useEffect(() => {
    if (!user || !MEMBER_ROLES.includes(user.role)) return undefined;

    let active = true;
    getTrends()
      .then((res) => {
        if (active) setHistory(res.logs || []);
      })
      .catch((err) => {
        if (active) setError(`Could not load trends: ${err.message}`);
      });

    getLatestRecommendation()
      .then((res) => {
        if (active) setLatest(res.recommendation);
      })
      .catch((err) => {
        if (active) setError(`Could not load recommendation: ${err.message}`);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const register = async ({ name, email, password, role, consent }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await registerUser(email, password, name, role, consent);
      setHistory([]);
      setLatest(null);
      setUser(res.user);
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async ({ email, password, profile }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(email, password, profile);
      setHistory([]);
      setLatest(null);
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
    try {
      await logoutUser();
    } finally {
      setUser(null);
      setHistory([]);
      setLatest(null);
      setError(null);
    }
  };

  const completeOnboarding = async (profile) => {
    const result = await saveOnboarding(profile);
    setUser(result.user);
  };

  const refreshUser = async () => {
    const result = await getMe();
    setUser(result.user);
    return result.user;
  };

  const importSampleWearable = async () => {
    const result = await syncSampleWearable();
    const trends = await getTrends();
    setHistory(trends.logs || []);
    return result;
  };

  const importData = async (logs) => {
    setLoading(true);
    setError(null);
    try {
      const result = await importLogs(logs);
      const trends = await getTrends();
      setHistory(trends.logs || []);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const importDataCsv = async (csvText) => {
    setLoading(true);
    setError(null);
    try {
      const result = await importLogsCsv(csvText);
      const trends = await getTrends();
      setHistory(trends.logs || []);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRecommendationAdherence = (id, adherence) => {
    setLatest((current) => current && current.recommendation_id === id ? { ...current, adherence } : current);
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
    refreshUser,
    importSampleWearable,
    importData,
    importDataCsv,
    generatePlan,
    updateRecommendationAdherence,
  };

  return (
    <AppContext.Provider value={value}>{children}</AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);