const API_BASE = 'http://localhost:5000/api';

const getToken = () => localStorage.getItem('h360_token');

const apiCall = async (url, options = {}) => {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export async function registerUser(email, password, name) {
  const data = await apiCall('/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  if (data.token) localStorage.setItem('h360_token', data.token);
  return data;
}

export async function loginUser(email, password) {
  const data = await apiCall('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) localStorage.setItem('h360_token', data.token);
  return data;
}

export async function logoutUser() {
  localStorage.removeItem('h360_token');
}

export async function getMe() {
  return apiCall('/me', { method: 'GET' });
}

export async function logMetrics(metrics) {
  return apiCall('/log-metrics', {
    method: 'POST',
    body: JSON.stringify(metrics),
  });
}

export async function getTrends() {
  return apiCall('/trends', { method: 'GET' });
}

export async function fetchRecommendation(metrics) {
  const res = await fetch(`${API_BASE}/recommendation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });
  if (!res.ok) throw new Error('Cannot reach Flask backend (port 5000)');
  return res.json();
}