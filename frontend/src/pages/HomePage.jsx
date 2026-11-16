import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { homeForRole } from '../roles';
import { getPublicFeedback } from '../api';

const FEATURES = [
  { title: 'Personalized Pacing', text: 'Daily activity and recovery guidance from your sleep, heart rate, steps and fatigue.' },
  { title: 'Explainable by Design', text: 'SHAP bars show exactly which metrics drove today\'s recommendation.' },
  { title: 'What-If Recourse', text: 'Test habit changes and see what it takes to unlock a higher-intensity plan.' },
  { title: 'Fair and Private', text: 'Fairness-audited models, PDPA-aligned data handling, non-clinical scope.' },
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
  return (
    <main className="dashboard-container">
      <section className="hero">
        <h1>Health guidance you can actually understand</h1>
        <p>Healthy360 explains every recommendation, so you know why, not just what.</p>
        <div className="hero-actions">
          {user ? (
            <Link to={homeForRole(user.role)} className="submit-btn hero-btn">Go to your account</Link>
          ) : (
            <>
              <Link to="/register" className="submit-btn hero-btn">Get started</Link>
              <Link to="/login" className="btn-outline">Log in</Link>
            </>
          )}
        </div>
      </section>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <section className="card" key={f.title}>
            <h3>{f.title}</h3>
            <p className="sub-text">{f.text}</p>
          </section>
        ))}
      </div>
      <section className="card">
        <h2>Public feedback</h2>
        <p className="sub-text">Feedback is shared by users and is not moderated.</p>
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