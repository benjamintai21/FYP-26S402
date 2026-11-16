import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import RecommendationCard from '../components/RecommendationCard';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';

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

function Trends({ history }) {
  const recent = history.slice(-7);
  return (
    <section className="card">
      <div className="card-header">
        <h3>Last 7 check-ins</h3>
        <span className="sub-text">Sleep hours</span>
      </div>
      {recent.length === 0 ? (
        <p className="sub-text">No history yet.</p>
      ) : (
        <div className="spark">
          {recent.map((h) => (
            <div key={h.date} className="spark-col" title={`${h.date}: ${h.metrics.sleep} hrs`}>
              <div className="spark-bar" style={{ height: `${(h.metrics.sleep / 12) * 100}%` }} />
              <span>{h.date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user, latest, history } = useApp();

  return (
    <main className="dashboard-container" id="dashboard">
      <header className="page-header">
        <h1>Hi {user.name}</h1>
        <p>Transparent, personalized lifestyle guidance grounded in verifiable biometric drivers.</p>
      </header>

      {!latest ? (
        <section className="card empty-state">
          <h3>No plan yet</h3>
          <p className="sub-text">Log today's metrics to get your first recommendation.</p>
          <Link to="/log" className="submit-btn hero-btn">Log today's metrics</Link>
        </section>
      ) : (
        <div className="content-grid">
          <div className="grid-col">
            <RecommendationCard recommendation={latest.recommendation} explanation={latest.explanation} />
            <ShapBreakdown factors={latest.shap_factors} />
            <WhatIfExplorer whatIf={latest.what_if} />
            <Link to="/explorer" className="btn-outline">Open the What-If Explorer</Link>
          </div>
          <div className="grid-col">
            <Trends history={history} />
            <Feedback />
          </div>
        </div>
      )}
    </main>
  );
}