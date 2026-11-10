import { useState } from 'react';
import { METRIC_FIELDS } from '../constants';

export default function MetricForm({
  onSubmit,
  loading,
  initial = { sleep: 6.5, heartRate: 72, steps: 7500, fatigue: 5 },
  title = 'Daily Health Check-In',
  subtitle = 'Record your daily biometric signals',
  submitLabel = 'Generate Personalized Plan',
}) {
  const [metrics, setMetrics] = useState(initial);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setMetrics((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(metrics);
  };

  return (
    <section className="card form-card">
      <div className="card-header">
        <h2>{title}</h2>
        <span className="sub-text">{subtitle}</span>
      </div>
      <form onSubmit={handleSubmit}>
        {METRIC_FIELDS.map((f) => (
          <div className="form-group" key={f.name}>
            <label htmlFor={f.name}>
              {f.label}:{' '}
              <strong>
                {f.name === 'steps' ? metrics.steps.toLocaleString() : metrics[f.name]} {f.unit}
              </strong>
            </label>
            <input
              id={f.name}
              type="range"
              name={f.name}
              min={f.min}
              max={f.max}
              step={f.step}
              value={metrics[f.name]}
              onChange={handleChange}
            />
          </div>
        ))}
        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Analyzing with XAI Engine...' : submitLabel}
        </button>
      </form>
    </section>
  );
}