import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MetricForm from '../components/MetricForm';
import { DEFAULT_BASELINE } from '../constants';
import ActivityLog from '../components/ActivityLog';
import Icon from '../components/Icon';

const CSV_HEADER = 'date,sleep,heartRate,steps,fatigue';
const CSV_EXAMPLE = `${CSV_HEADER}
2026-11-15,7.2,68,9200,3.5
2026-11-14,6.1,74,5400,6.0
2026-11-13,7.8,64,11800,2.5`;

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function LoggingPage() {
  const { user, generatePlan, importSampleWearable, importData, importDataCsv, loading, error } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'biometrics' ? 'biometrics' : 'workout';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [wearableLoading, setWearableLoading] = useState(false);
  const [wearableMessage, setWearableMessage] = useState('');
  const [wearableError, setWearableError] = useState('');

  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState(null);
  const [importError, setImportError] = useState(null);

  const handleWearableSync = async () => {
    setWearableLoading(true);
    setWearableMessage('');
    setWearableError('');
    try {
      const result = await importSampleWearable();
      setWearableMessage(result.message || 'Wearable biometrics (steps & heart rate) synced successfully.');
    } catch (err) {
      setWearableError(err.message || 'Could not sync wearable device.');
    } finally {
      setWearableLoading(false);
    }
  };

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
    <main className="dashboard-container narrow" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <Icon name="activity" size={14} /> Fitness Studio & Health Logs
        </div>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Log Activity & Check-In</h1>
        <p className="sub-text">
          Track real-time workouts, view your activity calendar, or record daily biometrics.
        </p>
      </header>

      {error && (
        <div className="alert-error" role="alert">
          <strong>Backend Connection Notice:</strong> {error}. Ensure <code>python app.py</code> is running in <code>backend/</code>.
        </div>
      )}

      {/* Top Segmented Tabs: Workout Tracker vs Biometrics */}
      <div className="segmented-nav-bar" style={{ padding: '6px' }}>
        <button
          type="button"
          className={`segmented-nav-btn ${activeTab === 'workout' ? 'active' : ''}`}
          onClick={() => handleTabChange('workout')}
          style={{ fontSize: '0.95rem', padding: '0.75rem 1rem' }}
        >
          <Icon name="activity" size={18} /> Workout Tracker & Calendar
        </button>
        <button
          type="button"
          className={`segmented-nav-btn ${activeTab === 'biometrics' ? 'active' : ''}`}
          onClick={() => handleTabChange('biometrics')}
          style={{ fontSize: '0.95rem', padding: '0.75rem 1rem' }}
        >
          <Icon name="sliders" size={18} /> Daily Biometrics & Wearable
        </button>
      </div>

      {/* TAB 1: WORKOUT TRACKER & INTERACTIVE CALENDAR */}
      {activeTab === 'workout' && (
        <ActivityLog />
      )}

      {/* TAB 2: DAILY BIOMETRICS, WEARABLE SYNC, & HISTORICAL BATCH IMPORT */}
      {activeTab === 'biometrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* 1. WEARABLE SYNC CARD */}
          <section className="card" style={{ border: '1.5px solid #10b981', background: '#fcfdfd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#065f46', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                  <Icon name="refresh" size={15} /> Wearable Device Integration
                </div>
                <h2 style={{ fontSize: '1.25rem', margin: '0.25rem 0' }}>Sync Connected Smartwatch / Band</h2>
                <p className="sub-text" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Automatically ingest today’s steps, resting heart rate, and sleep duration into your AI pacing model.
                </p>
              </div>
              <button
                type="button"
                className="submit-btn mobile-w-full"
                style={{ width: 'auto', padding: '0.65rem 1.4rem', fontSize: '0.95rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={handleWearableSync}
                disabled={wearableLoading || loading}
              >
                <Icon name="refresh" size={16} />
                {wearableLoading ? 'Syncing Device...' : 'Sync sample wearable'}
              </button>
            </div>

            {wearableMessage && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span>✓ {wearableMessage}</span>
                <Link to="/dashboard" className="btn-outline btn-sm" style={{ background: '#ffffff' }}>
                  View Today’s Recommendation →
                </Link>
              </div>
            )}

            {wearableError && (
              <div className="alert-error" role="alert" style={{ marginTop: '1rem' }}>
                {wearableError}
              </div>
            )}
          </section>

          {/* 2. MANUAL BIOMETRIC SLIDERS */}
          <MetricForm
            initial={baseline}
            onSubmit={handleSubmit}
            loading={loading}
            title="Daily Biometric Check-In"
            subtitle="Sliders start at your baseline. Adjust to how you really feel today."
            submitLabel="Save check-in and get recommendation"
          />

          {/* 3. CSV / JSON BATCH IMPORT */}
          <section className="card">
            <div className="card-header">
              <h2>Import historical data</h2>
              <p className="sub-text">
                Load historical metrics (sleep, resting heart rate, steps, fatigue) exported from fitness trackers to run through the XAI pipeline.
              </p>
            </div>
            <textarea
              className="import-textarea"
              rows={6}
              placeholder={`Paste CSV or JSON.\n\nCSV header: ${CSV_HEADER}`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              aria-label="Logs to import"
            />
            <div className="import-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.75rem' }}>
              <button type="button" className="submit-btn hero-btn" onClick={handleImportCsv} disabled={loading}>
                {loading ? 'Importing...' : 'Import CSV'}
              </button>
              <button type="button" className="btn-outline" onClick={handleImportJson} disabled={loading}>
                Import JSON
              </button>
              <button type="button" className="btn-outline" onClick={handleFillExample} style={{ border: 'none', background: 'transparent', textDecoration: 'underline' }}>
                Fill example
              </button>
            </div>
            {importMessage && <p className="alert-info" role="status" style={{ marginTop: '0.75rem' }}>{importMessage}</p>}
            {importError && <p className="alert-error" role="alert" style={{ marginTop: '0.75rem' }}>{importError}</p>}
            <p className="hint-text" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Dates are ISO format (YYYY-MM-DD). Example: {todayIso()}.</p>
          </section>
        </div>
      )}
    </main>
  );
}
