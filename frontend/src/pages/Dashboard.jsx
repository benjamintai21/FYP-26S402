import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import RecommendationCard from '../components/RecommendationCard';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';
import { submitFeedback } from '../api';

const Trends = lazy(() => import('../components/Trends'));

function Likert({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="likert">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n === value ? 'chip chip-on' : 'chip'} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function Feedback({ recommendation, onAdherenceSaved }) {
  const [adhered, setAdhered] = useState(recommendation.adherence === 'completed' ? true : recommendation.adherence === 'skipped' ? false : null);
  const [clarity, setClarity] = useState(null);
  const [trust, setTrust] = useState(null);
  const [comment, setComment] = useState('');
  const [publish, setPublish] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMessage('');
    try {
      const result = await submitFeedback({ clarity, trust, comment, public: publish,
        recommendation_id: recommendation.recommendation_id,
        adherence: adhered === null ? null : adhered ? 'completed' : 'skipped' });
      if (adhered !== null) onAdherenceSaved(recommendation.recommendation_id, adhered ? 'completed' : 'skipped');
      setMessage(result.message);
    } catch (err) { setError(err.message); }
  };

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
      <div className="form-group"><label htmlFor="feedback-comment">Comment (optional)</label><textarea id="feedback-comment" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      <label className="consent"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /><span>Share this feedback publicly without my name. Do not include personal information.</span></label>
      <button type="button" className="btn-outline" onClick={submit}>Submit feedback</button>
      <p className="sub-text">Submit to save your selection and feedback.</p>
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
    </section>
  );
}

export default function Dashboard() {
  const { user, latest, history, error, updateRecommendationAdherence } = useApp();

  return (
    <main className="dashboard-container" id="dashboard">
      {error && <div className="alert-error" role="alert">{error}</div>}
      {history.some((entry) => entry.is_simulated) && <div className="alert-info">Your trends include simulated wearable data, not readings from a device.</div>}
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
              {user.role === 'premium' && <section className="card">
                <h3>Detailed explanation</h3>
                <p>{latest.explanation}</p>
                <ul>{latest.shap_factors.map((factor) => <li key={factor.key}>{factor.feature}: {String(factor.value)}, attribution {factor.impact}%</li>)}</ul>
                <p className="sub-text">Attributions describe this model output, not causation or medical advice.</p>
              </section>}
              <WhatIfExplorer whatIf={latest.what_if} />
              <Link to="/explorer" className="btn-outline">Open the What-If Explorer</Link>
            </>
          )}
        </div>
        <div className="grid-col">
          <Suspense fallback={<section className="card"><p className="sub-text">Loading trends...</p></section>}>
            <Trends history={history} />
          </Suspense>
          {latest && <Feedback key={latest.recommendation_id} recommendation={latest} onAdherenceSaved={updateRecommendationAdherence} />}
        </div>
      </div>
    </main>
  );
}