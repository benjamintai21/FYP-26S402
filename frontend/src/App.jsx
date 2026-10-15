import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/recommendation')
      .then((res) => {
        if (!res.ok) throw new Error('Could not connect to Flask API backend');
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <>
      {/* Navigation Bar */}
      <nav className="navbar">
        <div className="nav-brand">
          <span className="brand-badge">CSIT-26-S4-03</span>
          <span className="brand-title">Healthy360</span>
        </div>
        <ul className="nav-links">
          <li><a href="#home" className="active">Home</a></li>
          <li><a href="#recommendations">Recommendations</a></li>
          <li><a href="#what-if">What-If Explorer</a></li>
          <li><a href="#about">About</a></li>
        </ul>
      </nav>

      {/* Main Page Content */}
      <main className="container">
        {/* Hero Section */}
        <section className="hero" id="home">
          <h1>Explainable AI Health Companion</h1>
          <p>
            A lifestyle recommendation system built on transparent reasoning, algorithmic fairness, and human-understandable guidance.
          </p>
        </section>

        {/* Loading / Error States */}
        {loading && <p className="status-msg">Loading daily guidance from backend...</p>}
        {error && (
          <div className="error-msg">
            <strong>Backend Connection Notice:</strong> {error}. Ensure your Flask app is running at <code>http://localhost:5000</code>.
          </div>
        )}

        {/* Live Recommendation Output */}
        {data && (
          <>
            <section className="recommendation-card" id="recommendations">
              <div className="card-label">Today's Focus</div>
              <h2 className="recommendation-title">{data.recommendation}</h2>
              <p className="recommendation-text">
                <strong>Why? </strong>
                {data.explanation}
              </p>
            </section>

            <section className="factors-card">
              <h3>Contributing Biometric Drivers (SHAP Attribution)</h3>
              {data.shap_factors?.map((factor, index) => (
                <div key={index} className="factor-item">
                  <span>{factor.feature}</span>
                  <span className={factor.impact > 0 ? 'impact-positive' : 'impact-negative'}>
                    {factor.impact > 0 ? `+${factor.impact}%` : `${factor.impact}%`}
                  </span>
                </div>
              ))}
            </section>

            <section className="what-if-card" id="what-if">
              <strong>Actionable Recourse: </strong>
              <span>{data.what_if}</span>
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default App;