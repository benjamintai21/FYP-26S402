const API_BASE = 'http://localhost:5000/api';

export async function fetchRecommendation(metrics) {
  const res = await fetch(`${API_BASE}/recommendation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });
  if (!res.ok) throw new Error('Cannot reach Flask backend (port 5000)');
  return res.json();
}