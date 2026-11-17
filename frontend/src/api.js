const isAndroid = /Android/i.test(navigator.userAgent);
export const API_BASE = isAndroid
  ? 'http://10.0.2.2:5000/api'
  : 'http://localhost:5000/api';

const getToken = () => localStorage.getItem('h360_token');

const apiCall = async (url, options = {}) => {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export async function registerUser(email, password, name, role, consent) {
  const data = await apiCall('/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, role, consent }),
  });
  if (data.token) localStorage.setItem('h360_token', data.token);
  return data;
}

export async function loginUser(email, password, profile) {
  const data = await apiCall('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, profile }),
  });
  if (data.token) localStorage.setItem('h360_token', data.token);
  return data;
}

export async function logoutUser() {
  try {
    await apiCall('/logout', { method: 'POST' });
  } finally {
    localStorage.removeItem('h360_token');
  }
}

export async function getMe() {
  return apiCall('/me', { method: 'GET' });
}

export async function saveOnboarding(profile) {
  return apiCall('/onboarding', { method: 'POST', body: JSON.stringify(profile) });
}

export async function changePassword(currentPassword, newPassword) {
  const result = await apiCall('/change-password', {
    method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
  });
  localStorage.setItem('h360_token', result.token);
  return result;
}

export async function syncSampleWearable() {
  return apiCall('/wearable/sync', { method: 'POST' });
}

export async function requestSimulatedReset(email) {
  return apiCall('/dev/password-reset', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function confirmSimulatedReset(email, token, password) {
  return apiCall('/dev/password-reset/confirm', {
    method: 'POST', body: JSON.stringify({ email, token, password }),
  });
}

export const getPreferences = () => apiCall('/preferences', { method: 'GET' });
export const savePreferences = (preferences) => apiCall('/preferences', {
  method: 'PUT', body: JSON.stringify(preferences),
});
export const getGoals = () => apiCall('/goals', { method: 'GET' });
export const saveGoal = (goal, id) => apiCall(id ? `/goals/${id}` : '/goals', {
  method: id ? 'PUT' : 'POST', body: JSON.stringify(goal),
});
export const deleteGoal = (id) => apiCall(`/goals/${id}`, { method: 'DELETE' });
export const getBusinessItems = (resource) => apiCall(`/business/${resource}`, { method: 'GET' });
export const saveBusinessItem = (resource, item, id) => apiCall(id ? `/business/${resource}/${id}` : `/business/${resource}`, {
  method: id ? 'PUT' : 'POST', body: JSON.stringify(item),
});
export const deleteBusinessItem = (resource, id) => apiCall(`/business/${resource}/${id}`, { method: 'DELETE' });
export const getMarketplace = () => apiCall('/marketplace', { method: 'GET' });
export const reserveOffering = (resource, id) => apiCall(`/marketplace/${resource}/${id}/reserve`, { method: 'POST' });
export const getEventNotifications = () => apiCall('/event-notifications', { method: 'GET' });
export const getPublicFeedback = () => apiCall('/feedback/public', { method: 'GET' });
export const submitFeedback = (feedback) => apiCall('/feedback', { method: 'POST', body: JSON.stringify(feedback) });
export const getSubscription = () => apiCall('/subscription', { method: 'GET' });
export const updateSubscription = (action) => apiCall('/subscription', { method: 'POST', body: JSON.stringify({ action }) });
export const getPremiumPlans = () => apiCall('/premium/plans', { method: 'GET' });
export const generatePremiumPlan = (type) => apiCall('/premium/plans', { method: 'POST', body: JSON.stringify({ type }) });
export const getPremiumArticles = () => apiCall('/articles', { method: 'GET' });
export const getGoalInsights = () => apiCall('/premium/goal-insights', { method: 'GET' });
export const getChallenges = () => apiCall('/challenges', { method: 'GET' });
export const getBusinessChallenges = () => apiCall('/business/challenges', { method: 'GET' });
export const createChallenge = (challenge) => apiCall('/business/challenges', { method: 'POST', body: JSON.stringify(challenge) });
export const getLeaderboard = (id) => apiCall(`/challenges/${id}/leaderboard`, { method: 'GET' });
export const joinChallenge = (id) => apiCall(`/challenges/${id}/participation`, { method: 'POST', body: JSON.stringify({ consent: true }) });
export const leaveChallenge = (id) => apiCall(`/challenges/${id}/participation`, { method: 'DELETE' });
export const getCohorts = () => apiCall('/cohorts', { method: 'GET' });
export const enableCohort = () => apiCall('/business/cohort', { method: 'POST' });
export const getBusinessCohort = () => apiCall('/business/cohort', { method: 'GET' });
export const getBusinessAnalytics = () => apiCall('/business/analytics', { method: 'GET' });
export const joinCohort = (id) => apiCall(`/cohorts/${id}/participation`, { method: 'POST', body: JSON.stringify({ consent: true }) });
export const leaveCohort = (id) => apiCall(`/cohorts/${id}/participation`, { method: 'DELETE' });
export const getActivities = () => apiCall('/activities', { method: 'GET' });
export const saveActivity = (activity) => apiCall('/activities', { method: 'POST', body: JSON.stringify(activity) });
export const deleteActivity = (id) => apiCall(`/activities/${id}`, { method: 'DELETE' });

export async function logMetrics(metrics) {
  return apiCall('/log-metrics', {
    method: 'POST',
    body: JSON.stringify(metrics),
  });
}

export async function getTrends() {
  return apiCall('/trends', { method: 'GET' });
}

export async function getLatestRecommendation() {
  return apiCall('/recommendations/latest', { method: 'GET' });
}

export async function fetchRecommendation(metrics) {
  return apiCall('/recommendation', {
    method: 'POST',
    body: JSON.stringify(metrics),
  });
}

export async function fetchWhatIf(metrics) {
  return apiCall('/whatif', {
    method: 'POST',
    body: JSON.stringify(metrics),
  });
}