import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MetricForm from '../components/MetricForm';

export default function LoggingPage() {
  const { user, generatePlan, loading, error } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (metrics) => {
    const result = await generatePlan(metrics);
    if (result) navigate('/dashboard');
  };

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
      <MetricForm initial={user.baseline} onSubmit={handleSubmit} loading={loading} />
    </main>
  );
}