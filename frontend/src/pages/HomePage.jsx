import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const FEATURES = [
  { title: 'Personalized Pacing', text: 'Daily activity and recovery guidance from your sleep, heart rate, steps and fatigue.' },
  { title: 'Explainable by Design', text: 'SHAP bars show exactly which metrics drove today\'s recommendation.' },
  { title: 'What-If Recourse', text: 'Test habit changes and see what it takes to unlock a higher-intensity plan.' },
  { title: 'Fair and Private', text: 'Fairness-audited models, PDPA-aligned data handling, non-clinical scope.' },
];

export default function HomePage() {
  const { user } = useApp();
  return (
    <main className="dashboard-container">
      <section className="hero">
        <h1>Health guidance you can actually understand</h1>
        <p>Healthy360 explains every recommendation, so you know why, not just what.</p>
        <div className="hero-actions">
          {user ? (
            <Link to="/dashboard" className="submit-btn hero-btn">Go to Dashboard</Link>
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
    </main>
  );
}