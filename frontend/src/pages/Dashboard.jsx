import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import RecommendationCard from '../components/RecommendationCard';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';

const Trends = lazy(() => import('../components/Trends'));

function Feedback() {
  const [adhered, setAdhered] = useState(null);
  const [clarity, setClarity] = useState(null);
  const [trust, setTrust] = useState(null);

  const Likert = ({ label, value, onChange }) => (
    <div className="form-group">
      <label>{label}</label>
      <div className="likert">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n === value ? 'chip chip-on' : 'chip'} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="card">
      <div className="card-header">
        <h3>Feedback</h3>
        <span className="sub-text">Helps us evaluate the explanations</span>
      </div>
      <div className="form-group">
        <label>Did you follow today's plan?</label>
        <div className="likert">
          <button type="button" className={adhered === true ? 'chip chip-on' : 'chip'} onClick={() => setAdhered(true)}>Done</button>
          <button type="button" className={adhered === false ? 'chip chip-on' : 'chip'} onClick={() => setAdhered(false)}>Skipped</button>
        </div>
      </div>
      <Likert label="The explanation was clear (1–5)" value={clarity} onChange={setClarity} />
      <Likert label="I trust this recommendation (1–5)" value={trust} onChange={setTrust} />
    </section>
  );
}

export default function Dashboard() {
  const { user, latest, history, error } = useApp();

  return (
    <main className="dashboard-container" id="dashboard">
      {error && <div className="alert-error" role="alert">{error}</div>}
      <header className="page-header">
        <h1>Hi {user.name}</h1>
        <p>Transparent, personalized lifestyle guidance grounded in verifiable biometric drivers.</p>
      </header>

      <div className="content-grid">
        <div className="grid-col">
          {!latest ? (
            <section className="card empty-state">
              <h3>No plan yet</h3>
              <p className="sub-text">Log today's metrics to get your first recommendation.</p>
              <Link to="/log" className="submit-btn hero-btn">Log today's metrics</Link>
            </section>
          ) : (
            <>
              <RecommendationCard recommendation={latest.recommendation} explanation={latest.explanation} />
              <ShapBreakdown factors={latest.shap_factors} />
              <WhatIfExplorer whatIf={latest.what_if} />
              <Link to="/explorer" className="btn-outline">Open the What-If Explorer</Link>
            </>
          )}
        </div>
        <div className="grid-col">
          <Suspense fallback={<section className="card"><p className="sub-text">Loading trends...</p></section>}>
            <Trends history={history} />
          </Suspense>
          {latest && <Feedback />}
        </div>
      </div>
    </main>
  );
}