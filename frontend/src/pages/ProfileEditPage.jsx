import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getProfile, updateProfile } from '../api';
import Icon from '../components/Icon';

const AGE_BRACKETS = ['18-29', '30-44', '45-59', '60+'];
const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary (Desk work, minimal exercise)' },
  { id: 'light', label: 'Lightly Active (1-2 light workouts/wk)' },
  { id: 'moderate', label: 'Moderately Active (3-4 workouts or 7k+ steps/day)' },
  { id: 'very_active', label: 'Very Active (5+ intense workouts or physical job)' },
];

export default function ProfileEditPage() {
  const { user, refreshUser } = useApp();
  const navigate = useNavigate();
  const isBusiness = user?.role === 'business';

  // Identity state
  const [displayName, setDisplayName] = useState(user?.displayName || user?.profile?.display_name || user?.name || '');
  const [fullName, setFullName] = useState(user?.name || '');
  const [businessName, setBusinessName] = useState(user?.businessName || user?.name || '');

  // Demographic & Biometric state
  const [ageBracket, setAgeBracket] = useState(user?.ageBracket || '30-44');
  const [activityLevel, setActivityLevel] = useState(user?.activityLevel || 'moderate');
  const [sleep, setSleep] = useState(user?.baseline?.sleep || 7.5);
  const [heartRate, setHeartRate] = useState(user?.baseline?.heartRate || 70);
  const [steps, setSteps] = useState(user?.baseline?.steps || 8000);
  const [fatigue, setFatigue] = useState(user?.baseline?.fatigue || 4.0);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getProfile()
      .then((result) => {
        if (!active) return;
        const u = result.user || {};
        setDisplayName(u.displayName || u.display_name || u.name || '');
        setFullName(u.name || '');
        if (u.businessName || u.name) setBusinessName(u.businessName || u.name || '');
        if (u.ageBracket) setAgeBracket(u.ageBracket);
        if (u.activityLevel) setActivityLevel(u.activityLevel);
        if (u.baseline) {
          if (u.baseline.sleep != null) setSleep(u.baseline.sleep);
          if (u.baseline.heartRate != null) setHeartRate(u.baseline.heartRate);
          if (u.baseline.steps != null) setSteps(u.baseline.steps);
          if (u.baseline.fatigue != null) setFatigue(u.baseline.fatigue);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      const payload = isBusiness
        ? { displayName: businessName, businessName }
        : {
            displayName: displayName.trim(),
            name: fullName.trim(),
            ageBracket,
            activityLevel,
            baseline: {
              sleep: parseFloat(sleep),
              heartRate: parseInt(heartRate, 10),
              steps: parseInt(steps, 10),
              fatigue: parseFloat(fatigue),
            },
          };

      await updateProfile(payload);
      setMessage(isBusiness ? 'Business profile updated successfully.' : 'Profile & biometric baselines updated successfully.');
      if (refreshUser) await refreshUser();
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <Icon name="user" size={14} /> Profile Management
        </div>
        <h1>{isBusiness ? 'Edit Business Profile' : 'Edit Profile & Baselines'}</h1>
        <p className="sub-text">
          {isBusiness
            ? 'Update your organization, studio, or brand name visible to members.'
            : 'Update your display name, personal details, and biometric baselines to keep AI recommendations accurate.'}
        </p>
      </header>

      {message && <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontWeight: 500 }}>{message}</div>}
      {error && <div className="alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Business View */}
        {isBusiness ? (
          <section className="card">
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Business Information</h2>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="businessName">Business / Brand Name</label>
              <input
                id="businessName"
                type="text"
                maxLength={150}
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Apex Fitness Studio"
              />
              <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                This is displayed to members when browsing classes, workshops, and services.
              </span>
            </div>
          </section>
        ) : (
          /* Member View: Identity + Biometrics */
          <>
            {/* Account & Identity Section */}
            <section className="card">
              <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Personal Identity</h2>
              <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Manage how your name appears in community challenges, feedback, and invoices.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="displayName">Community Display Name</label>
                  <input
                    id="displayName"
                    type="text"
                    maxLength={100}
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. RachelL_SG"
                  />
                  <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                    Visible on challenge leaderboards and public reviews. Keeps your real name private.
                  </span>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="fullName">Full Legal Name</label>
                  <input
                    id="fullName"
                    type="text"
                    maxLength={255}
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rachel Lim"
                  />
                  <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                    Used on payment receipts and account administration. Not shared publicly.
                  </span>
                </div>
              </div>
            </section>

            {/* Demographic & Fairness Calibration */}
            <section className="card">
              <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Demographic Calibration</h2>
              <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Used by Fairlearn to audit algorithmic fairness and demographic parity across user age cohorts.
              </p>
              <div className="stats-2col-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="ageBracket">Age Bracket</label>
                  <select id="ageBracket" value={ageBracket} onChange={(e) => setAgeBracket(e.target.value)}>
                    {AGE_BRACKETS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="activityLevel">Typical Activity Level</label>
                  <select id="activityLevel" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
                    {ACTIVITY_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Biometric Baselines Section */}
            <section className="card">
              <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Biometric Pacing Baselines</h2>
              <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                The XGBoost and TreeSHAP pacing models evaluate your daily logs relative to these personal baselines. Update them as your fitness or recovery capacity evolves.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 600 }}>Target Nightly Sleep</label>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{sleep} hours</span>
                  </div>
                  <input
                    type="range"
                    min="3.0"
                    max="12.0"
                    step="0.5"
                    value={sleep}
                    onChange={(e) => setSleep(parseFloat(e.target.value))}
                  />
                  <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                    Allowed range: 3.0 to 12.0 hours. Reference benchmark: 7.0 - 8.0 hrs.
                  </span>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 600 }}>Baseline Resting Heart Rate</label>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{heartRate} bpm</span>
                  </div>
                  <input
                    type="range"
                    min="45"
                    max="110"
                    step="1"
                    value={heartRate}
                    onChange={(e) => setHeartRate(parseInt(e.target.value, 10))}
                  />
                  <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                    Normal adult resting range: 55 - 75 bpm. Update when aerobic conditioning lowers your resting HR.
                  </span>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 600 }}>Baseline Daily Steps</label>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{Number(steps).toLocaleString()} steps</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="20000"
                    step="500"
                    value={steps}
                    onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 600 }}>Typical Baseline Fatigue</label>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{fatigue} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.5"
                    value={fatigue}
                    onChange={(e) => setFatigue(parseFloat(e.target.value))}
                  />
                  <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                    Scale of 1 (Fully Energized) to 10 (Severely Fatigued).
                  </span>
                </div>
              </div>
            </section>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="submit-btn"
            type="submit"
            disabled={busy}
            style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}
          >
            {busy ? 'Saving Changes...' : 'Save Profile & Baselines'}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate('/profile')}
            style={{ padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
          >
            Back to Profile
          </button>
        </div>
      </form>
    </main>
  );
}
