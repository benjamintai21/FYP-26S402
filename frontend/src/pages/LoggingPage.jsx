import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MetricForm from '../components/MetricForm';
import { DEFAULT_BASELINE } from '../constants';
import ActivityLog from '../components/ActivityLog';

export default function LoggingPage() {
  const { user, generatePlan, importSampleWearable, loading, error } = useApp();
  const navigate = useNavigate();
  const [syncMessage, setSyncMessage] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const handleSampleSync = async () => {
    setSyncError(null);
    setSyncMessage(null);
    try {
      const result = await importSampleWearable();
      setSyncMessage(result.message);
    } catch (err) {
      setSyncError(err.message);
    }
  };

  const handleSubmit = async (metrics) => {
    const result = await generatePlan(metrics);
    if (result) navigate('/dashboard');
  };

  const baseline = user?.baseline || DEFAULT_BASELINE;

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>Daily check-in</h1>
        <p>Sliders start at your baseline. Adjust to how today really is.</p>
      </header>
      {error && (
        <div className="alert-error">
          <strong>Backend Connection Notice:</strong> {error}. Ensure <code>python app.py</code> is running in <code>backend/</code>.
        </div>
      )}
      <MetricForm initial={baseline} onSubmit={handleSubmit} loading={loading} />
      <section className="card">
        <h2>Wearable sync simulation</h2>
        <p className="sub-text">Import sample sleep, resting heart rate and steps. No device is connected.</p>
        <button type="button" className="btn-outline" onClick={handleSampleSync}>Import sample wearable data</button>
        {syncMessage && <p role="status">{syncMessage}</p>}
        {syncError && <p className="alert-error" role="alert">{syncError}</p>}
      </section>
      <ActivityLog />
    </main>
  );
}