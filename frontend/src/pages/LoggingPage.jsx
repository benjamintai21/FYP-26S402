import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MetricForm from '../components/MetricForm';
import { DEFAULT_BASELINE } from '../constants';
import ActivityLog from '../components/ActivityLog';

const CSV_HEADER = 'date,sleep,heartRate,steps,fatigue';
const CSV_EXAMPLE = `${CSV_HEADER}
2026-11-15,7.2,68,9200,3.5
2026-11-14,6.1,74,5400,6.0
2026-11-13,7.8,64,11800,2.5`;

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function LoggingPage() {
  const { user, generatePlan, importData, importDataCsv, loading, error } = useApp();
  const navigate = useNavigate();
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState(null);
  const [importError, setImportError] = useState(null);

  const runImport = async (send) => {
    setImportError(null);
    setImportMessage(null);
    try {
      const result = await send();
      setImportMessage(`Imported ${result.imported} new log(s), updated ${result.updated} existing, skipped ${result.skipped}.`);
    } catch (err) {
      setImportError(err.message);
    }
  };

  const handleImportCsv = () => {
    const text = importText.trim();
    if (!text) {
      setImportError('Paste a CSV with header date,sleep,heartRate,steps,fatigue first.');
      return;
    }
    runImport(() => importDataCsv(text));
  };

  const handleImportJson = () => {
    const text = importText.trim();
    if (!text) {
      setImportError('Paste a JSON array of logs first.');
      return;
    }
    try {
      const logs = JSON.parse(text);
      runImport(() => importData(logs));
    } catch {
      setImportError('That is not valid JSON. Check the brackets and quotes.');
    }
  };

  const handleFillExample = () => {
    setImportText(CSV_EXAMPLE);
    setImportError(null);
    setImportMessage(null);
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
        <div className="card-header">
          <h2>Import data</h2>
          <p className="sub-text">Load your own historical logs (sleep, resting heart rate, steps, fatigue) and have them scored through the same XAI pipeline.</p>
        </div>
        <textarea
          className="import-textarea"
          rows={7}
          placeholder={`Paste CSV or JSON.\n\nCSV header: ${CSV_HEADER}`}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          aria-label="Logs to import"
        />
        <div className="import-actions">
          <button type="button" className="submit-btn hero-btn" onClick={handleImportCsv} disabled={loading}>
            {loading ? 'Importing...' : 'Import CSV'}
          </button>
          <button type="button" className="btn-outline" onClick={handleImportJson} disabled={loading}>
            Import JSON
          </button>
          <button type="button" className="link-btn" onClick={handleFillExample}>
            Fill example
          </button>
        </div>
        {importMessage && <p className="alert-info" role="status">{importMessage}</p>}
        {importError && <p className="alert-error" role="alert">{importError}</p>}
        <p className="hint-text">Dates are ISO (YYYY-MM-DD). Missing metrics are imputed. Example of 2 weeks: {todayIso()} back.</p>
      </section>
      <ActivityLog />
    </main>
  );
}