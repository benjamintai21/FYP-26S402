import { useState } from 'react';

export default function MetricForm({ onSubmit, loading }) {
  const [metrics, setMetrics] = useState({
    sleep: 6.5,
    heartRate: 72,
    steps: 7500,
    fatigue: 5,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setMetrics((prev) => ({ ...prev, [name]: parseFloat(value) || value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(metrics);
  };

  return (
    <section className="card form-card" id="log-metrics">
      <div className="card-header">
        <h2>Daily Health Check-In</h2>
        <span className="sub-text">Record your daily biometric signals</span>
      </div>
      <form onSubmit={handleSubmit} className="metric-grid">
        <div className="form-group">
          <label>Sleep Duration: <strong>{metrics.sleep} hrs</strong></label>
          <input
            type="range"
            name="sleep"
            min="3"
            max="12"
            step="0.5"
            value={metrics.sleep}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Resting Heart Rate: <strong>{metrics.heartRate} bpm</strong></label>
          <input
            type="range"
            name="heartRate"
            min="45"
            max="110"
            step="1"
            value={metrics.heartRate}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Daily Step Count: <strong>{metrics.steps.toLocaleString()}</strong></label>
          <input
            type="range"
            name="steps"
            min="1000"
            max="20000"
            step="500"
            value={metrics.steps}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Perceived Fatigue (1–10): <strong>{metrics.fatigue}</strong></label>
          <input
            type="range"
            name="fatigue"
            min="1"
            max="10"
            step="1"
            value={metrics.fatigue}
            onChange={handleChange}
          />
        </div>

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Analyzing with XAI Engine...' : 'Generate Personalized Plan'}
        </button>
      </form>
    </section>
  );
}