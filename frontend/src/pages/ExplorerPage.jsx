import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWhatIf } from '../api';
import { DEFAULT_BASELINE, METRIC_FIELDS } from '../constants';
import RecommendationCard from '../components/RecommendationCard';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';

export default function ExplorerPage() {
  const { user, latest } = useApp();
  const [metrics, setMetrics] = useState(latest?.metrics ?? user.baseline ?? DEFAULT_BASELINE);
  const [result, setResult] = useState(latest);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const timer = useRef(null);
  const requestId = useRef(0);

  useEffect(() => () => {
    clearTimeout(timer.current);
    requestId.current += 1;
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...metrics, [name]: parseFloat(value) };
    const currentRequestId = ++requestId.current;
    setMetrics(next);
    setError(null);
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const nextResult = await fetchWhatIf(next);
        if (currentRequestId === requestId.current) setResult(nextResult);
      } catch (err) {
        if (currentRequestId === requestId.current) {
          setError(err.message);
          setResult(null);
        }
      } finally {
        if (currentRequestId === requestId.current) setLoading(false);
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
              <span className="sub-text" aria-live="polite">{loading ? 'Recalculating...' : 'Drag a slider'}</span>
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
          {result && <button className="btn-outline" type="button" disabled={loading || savedScenarios.length >= (user.role === 'premium' ? 6 : 2)}
            onClick={() => setSavedScenarios((current) => [...current, { metrics: { ...metrics }, result }])}>
            Add scenario to comparison ({savedScenarios.length}/{user.role === 'premium' ? 6 : 2})
          </button>}
          {savedScenarios.length > 0 && <section className="card">
            <h2>Scenario comparison</h2>
            {savedScenarios.map((scenario, index) => <div className="form-group" key={index}>
              <strong>Scenario {index + 1}: {scenario.result.recommendation}</strong>
              <span>Sleep {scenario.metrics.sleep}h · HR {scenario.metrics.heartRate} · Steps {scenario.metrics.steps} · Fatigue {scenario.metrics.fatigue}</span>
              <p>{scenario.result.explanation}</p>
              <button type="button" className="btn-outline" onClick={() => setSavedScenarios((current) => current.filter((_, i) => i !== index))}>Remove</button>
            </div>)}
          </section>}
        </div>
      </div>
    </main>
  );
}