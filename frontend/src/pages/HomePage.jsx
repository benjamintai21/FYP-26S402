import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { homeForRole } from '../roles';
import { getPublicFeedback } from '../api';
import Icon from '../components/Icon';

const FEATURES = [
  {
    title: 'Personalized Pacing',
    text: 'Daily activity and recovery guidance from your sleep, heart rate, steps and fatigue.',
    icon: 'activity'
  },
  {
    title: 'Explainable by Design',
    text: 'SHAP bars show exactly which metrics drove today\'s recommendation.',
    icon: 'chart'
  },
  {
    title: 'What-If Recourse',
    text: 'Test habit changes and see what it takes to unlock a higher-intensity plan.',
    icon: 'compass'
  },
  {
    title: 'Fair and Private',
    text: 'Fairness-audited models, PDPA-aligned data handling, non-clinical scope.',
    icon: 'shield'
  },
];

const TRUST_SIGNALS = [
  { label: 'Models audited with', value: 'fairlearn', desc: 'Demographic parity & disparate impact checks' },
  { label: 'Data governed by', value: 'PDPA', desc: 'Singapore privacy law compliance' },
  { label: 'Explainability via', value: 'SHAP', desc: 'TreeSHAP attributions per recommendation' },
  { label: 'Latency target', value: '< 2s', desc: 'End-to-end inference + XAI pipeline' },
];

const HOW_IT_WORKS = [
  { step: 1, title: 'Log your day', text: 'Sleep, heart rate, steps, fatigue — 30 seconds each morning' },
  { step: 2, title: 'Get a recommendation', text: 'Activity tier with plain-English rationale from XGBoost + SHAP' },
  { step: 3, title: 'Explore alternatives', text: 'What-If simulates habit changes to unlock higher tiers' },
  { step: 4, title: 'Track trends', text: '7- and 30-day charts show adherence and progress over time' },
];

export default function HomePage() {
  const { user } = useApp();
  const [feedback, setFeedback] = useState([]);
  const [feedbackError, setFeedbackError] = useState('');
  useEffect(() => {
    let active = true;
    getPublicFeedback().then((result) => { if (active) setFeedback(result.feedback); })
      .catch((err) => { if (active) setFeedbackError(err.message); });
    return () => { active = false; };
  }, []);

  const destination = user ? homeForRole(user.role) : '/register';
  const ctaLabel = user ? 'Go to your account' : 'Get started free';

  return (
    <main className="dashboard-container">
      <section className="hero">
        <div className="hero-badge">Non-clinical lifestyle guidance · Not medical advice</div>
        <h1>Health guidance you can actually understand</h1>
        <p className="hero-sub">Healthy360 explains every recommendation, so you know why — not just what.</p>
        <div className="hero-actions">
          <Link to={destination} className="submit-btn hero-btn primary">{ctaLabel}</Link>
          {!user && <Link to="/login" className="btn-outline hero-btn">Log in</Link>}
          {!user && <Link to="/about" className="btn-outline hero-btn">Learn more</Link>}
        </div>
        <div className="hero-trust">
          <span className="trust-item">Fairlearn-audited</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">PDPA-compliant</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">SHAP explainability</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">{'<'} 2s latency</span>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-header">
          <h2>How it works</h2>
          <p className="sub-text">Four steps from daily check-in to actionable insight</p>
        </div>
        <div className="steps-grid">
          {HOW_IT_WORKS.map((s) => (
            <article className="step-card card" key={s.step}>
              <div className="step-number">{s.step}</div>
              <h3>{s.title}</h3>
              <p className="sub-text">{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features-section">
        <div className="section-header">
          <h2>Built for clarity and control</h2>
          <p className="sub-text">Every feature designed around explainability and user agency</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <section className="card feature-card" key={f.title}>
              <div className="feature-icon">
                <Icon name={f.icon} size={28} />
              </div>
              <h3>{f.title}</h3>
              <p className="sub-text">{f.text}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="trust-section">
        <div className="section-header">
          <h2>Trust signals</h2>
          <p className="sub-text">Technical safeguards built into every recommendation</p>
        </div>
        <div className="trust-grid">
          {TRUST_SIGNALS.map((t, i) => (
            <div className="trust-card card" key={i}>
              <div className="trust-label">{t.label}</div>
              <div className="trust-value">{t.value}</div>
              <p className="sub-text">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card cta-section">
        <h2>Ready to understand your health data?</h2>
        <p className="sub-text">Join hundreds of users getting explainable, non-clinical lifestyle guidance daily.</p>
        <div className="hero-actions">
          <Link to={destination} className="submit-btn hero-btn primary">{ctaLabel}</Link>
          {!user && <Link to="/login" className="btn-outline hero-btn">Log in</Link>}
        </div>
      </section>

      <section className="card">
        <h2>Public feedback</h2>
        <p className="sub-text">Feedback is shared by other real users</p>
        {feedbackError && <p className="alert-error" role="alert">Could not load feedback: {feedbackError}</p>}
        {!feedbackError && feedback.length === 0 && <p className="sub-text">No public feedback yet.</p>}
        {feedback.map((item) => <div className="form-group" key={item.id}>
          <p>{item.comment || 'No written comment.'}</p>
          <span className="sub-text">{item.clarity ? `Clarity: ${item.clarity}/5` : ''} {item.trust ? `Trust: ${item.trust}/5` : ''}</span>
        </div>)}
      </section>
    </main>
  );
}