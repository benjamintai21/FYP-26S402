import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import MetricForm from './components/MetricForm';
import RecommendationCard from './components/RecommendationCard';
import ShapBreakdown from './components/ShapBreakdown';
import WhatIfExplorer from './components/WhatIfExplorer';
import './App.css';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initial load: Fetch default recommendation from Flask API
  useEffect(() => {
    setLoading(true);
    fetch('http://localhost:5000/api/recommendation')
      .then((res) => {
        if (!res.ok) throw new Error('Cannot reach Flask backend (port 5000)');
        return res.json();
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Form submission: POST updated metrics to Flask
  const handleMetricSubmit = (metrics) => {
    setLoading(true);
    setError(null);
    fetch('http://localhost:5000/api/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Prediction API call failed');
        return res.json();
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  return (
    <div className="app-root">
      <Navbar />

      <main className="dashboard-container" id="dashboard">
        <header className="page-header">
          <h1>Explainable AI Health Companion</h1>
          <p>Transparent, personalized lifestyle guidance grounded in verifiable biometric drivers.</p>
        </header>

        {error && (
          <div className="alert-error">
            <strong>Backend Connection Notice:</strong> {error}. Ensure <code>python app.py</code> is running in <code>backend/</code>.
          </div>
        )}

        <div className="content-grid">
          {/* Left Column: Input Form */}
          <div className="grid-col">
            <MetricForm onSubmit={handleMetricSubmit} loading={loading} />
          </div>

          {/* Right Column: Recommendations & Explanations */}
          <div className="grid-col">
            {data && (
              <>
                <RecommendationCard
                  recommendation={data.recommendation}
                  explanation={data.explanation}
                />
                <ShapBreakdown factors={data.shap_factors} />
                <WhatIfExplorer whatIf={data.what_if} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}