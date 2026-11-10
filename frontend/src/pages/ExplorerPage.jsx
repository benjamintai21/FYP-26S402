import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchRecommendation } from '../api';
import { METRIC_FIELDS } from '../constants';
import RecommendationCard from '../components/RecommendationCard';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';

export default function ExplorerPage() {
  const { user, latest } = useApp();
  const [metrics, setMetrics] = useState(latest?.metrics ?? user.baseline);
  const [result, setResult] = useState(latest);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...metrics, [name]: parseFloat(value) };
    setMetrics(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResult(await fetchRecommendation(next));
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const changed = latest && result && result.recommendation !== latest.recommendation;

  return (
    <main className="dashboard-container">
      <header className="page-header">
        <h1>What-If Explorer</h1>
        <p>Try different habits and see how tomorrow's plan would change. Nothing here is saved.</p>
      </header>
      {error && <div className="alert-error">{error}</div>}
      <div className="content-grid">
        <div className="grid-col">
          <section className="card">
            <div className="card-header">
              <h2>Scenario</h2>
              <span className="sub-text">{loading ? 'Recalculating...' : 'Drag a slider'}</span>
            </div>
            {METRIC_FIELDS.map((f) => (
              <div className="form-group" key={f.name}>
                <label htmlFor={`x-${f.name}`}>
                  {f.label}: <strong>{f.name === 'steps' ? metrics.steps.toLocaleString() : metrics[f.name]} {f.unit}</strong>
                </label>
                <input id={`x-${f.name}`} type="range" name={f.name} min={f.min} max={f.max} step={f.step} value={metrics[f.name]} onChange={handleChange} />
              </div>
            ))}
          </section>
        </div>
        <div className="grid-col">
          {result ? (
            <>
              {changed && <div className="alert-info">This scenario changes your plan from "{latest.recommendation}".</div>}
              <RecommendationCard recommendation={result.recommendation} explanation={result.explanation} />
              <ShapBreakdown factors={result.shap_factors} />
              <WhatIfExplorer whatIf={result.what_if} />
            </>
          ) : (
            <section className="card"><p className="sub-text">Move a slider to simulate a plan.</p></section>
          )}
        </div>
      </div>
    </main>
  );
}