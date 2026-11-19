import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useWorkout } from '../context/WorkoutContext';
import ShapBreakdown from '../components/ShapBreakdown';
import WhatIfExplorer from '../components/WhatIfExplorer';
import { submitFeedback } from '../api';
import Icon from '../components/Icon';

const Trends = lazy(() => import('../components/Trends'));

function Likert({ label, value, onChange }) {
  return (
    <div className="form-group" style={{ marginBottom: '1rem' }}>
      <label style={{ fontSize: '0.88rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            style={{
              flex: 1,
              padding: '0.5rem',
              borderRadius: '8px',
              border: `1.5px solid ${n === value ? '#10b981' : '#d1d5db'}`,
              background: n === value ? '#10b981' : '#ffffff',
              color: n === value ? '#ffffff' : '#374151',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackSection({ recommendation, onAdherenceSaved }) {
  const [adhered, setAdhered] = useState(
    recommendation.adherence === 'completed'
      ? 'completed'
      : recommendation.adherence === 'modified'
      ? 'modified'
      : recommendation.adherence === 'skipped'
      ? 'skipped'
      : null
  );
  const [clarity, setClarity] = useState(null);
  const [trust, setTrust] = useState(null);
  const [comment, setComment] = useState('');
  const [publish, setPublish] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const result = await submitFeedback({
        clarity,
        trust,
        comment,
        public: publish,
        recommendation_id: recommendation.recommendation_id,
        adherence: adhered,
      });
      if (adhered !== null) onAdherenceSaved(recommendation.recommendation_id, adhered);
      setMessage(result.message || 'Thank you! Your feedback helps us improve explainability.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card" style={{ maxWidth: '680px' }}>
      <div className="card-header" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Rate Today's Recommendation</h3>
        <span className="sub-text">Helps us evaluate whether AI rationales are clear, trustworthy, and actionable</span>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ fontSize: '0.88rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
          Did you follow today’s pacing guidance?
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'completed', label: '✓ Completed' },
            { id: 'modified', label: '~ Modified' },
            { id: 'skipped', label: '✕ Skipped' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              style={{
                flex: 1,
                padding: '0.55rem',
                borderRadius: '8px',
                border: `1.5px solid ${adhered === opt.id ? '#10b981' : '#d1d5db'}`,
                background: adhered === opt.id ? '#ecfdf5' : '#ffffff',
                color: adhered === opt.id ? '#065f46' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
              onClick={() => setAdhered(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Likert label="The explanation and SHAP factors were clear (1 = Unclear, 5 = Very Clear)" value={clarity} onChange={setClarity} />
      <Likert label="I trust this pacing recommendation (1 = Low Trust, 5 = High Trust)" value={trust} onChange={setTrust} />

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="feedback-comment" style={{ fontSize: '0.88rem', fontWeight: 600 }}>Comment or observation (optional)</label>
        <textarea
          id="feedback-comment"
          maxLength={1000}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. The recommendation matched my energy level well today..."
        />
      </div>

      <label className="consent" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '1.25rem', cursor: 'pointer', lineHeight: 1.4 }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} style={{ marginTop: '0.2rem' }} />
        <span>Share this review publicly on the Healthy360 landing page anonymously (no personal health metrics will be shared).</span>
      </label>

      {message && <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>{message}</div>}
      {error && <div className="alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

      <button type="button" className="submit-btn" onClick={submit} disabled={submitting} style={{ padding: '0.65rem 1.75rem', fontSize: '0.95rem' }}>
        {submitting ? 'Submitting Feedback...' : 'Submit Feedback'}
      </button>
    </section>
  );
}

export default function Dashboard() {
  const { user, latest, history, error, updateRecommendationAdherence, importSampleWearable } = useApp();
  const { startWorkout } = useWorkout();
  const navigate = useNavigate();

  // Tabbed view state: 'plan' | 'explain' | 'trends' | 'feedback'
  const [activeTab, setActiveTab] = useState('plan');
  const [adherenceMsg, setAdherenceMsg] = useState('');
  const [syncingWearable, setSyncingWearable] = useState(false);

  const handleStartRecommendedSession = () => {
    if (!latest) return;
    const recText = latest.recommendation || '';
    let modality = 'walking';
    let intensity = 'light';
    let duration = 30;
    let targetRpeCap = 4;

    if (recText.includes('Walk') || latest.plan_level === 0) {
      modality = 'walking';
      intensity = 'light';
      duration = 30;
      targetRpeCap = 4;
    } else if (recText.includes('Cardio') || recText.includes('Tempo') || latest.plan_level === 1) {
      modality = 'running';
      intensity = 'moderate';
      duration = 40;
      targetRpeCap = 7;
    } else if (recText.includes('High-Intensity') || recText.includes('Interval') || latest.plan_level === 2) {
      modality = 'hiit';
      intensity = 'vigorous';
      duration = 25;
      targetRpeCap = 10;
    }

    startWorkout(modality, intensity, {
      title: latest.recommendation,
      targetDuration: duration,
      targetRpeCap,
      planLevel: latest.plan_level,
      recommendationId: latest.recommendation_id,
    });
  };

  // Format today's date
  const todayFormatted = new Date().toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const handleQuickAdherence = async (status) => {
    if (!latest?.recommendation_id) return;
    try {
      await submitFeedback({
        recommendation_id: latest.recommendation_id,
        adherence: status,
      });
      updateRecommendationAdherence(latest.recommendation_id, status);
      setAdherenceMsg(`Recorded as "${status.charAt(0).toUpperCase() + status.slice(1)}"!`);
      setTimeout(() => setAdherenceMsg(''), 3000);
    } catch {
      updateRecommendationAdherence(latest.recommendation_id, status);
      setAdherenceMsg(`Marked as "${status}"`);
      setTimeout(() => setAdherenceMsg(''), 3000);
    }
  };

  const handleQuickWearableSync = async () => {
    setSyncingWearable(true);
    try {
      await importSampleWearable();
    } finally {
      setSyncingWearable(false);
    }
  };

  return (
    <main className="dashboard-container" id="dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {history.some((entry) => entry.is_simulated) && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="info" size={16} /> Trends include simulated sample wearable logs (excluded from PDPA challenge metrics).
        </div>
      )}

      {/* HEADER GREETING */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: '0 0 0.25rem 0' }}>Hi, {user.name}</h1>
          <p className="sub-text" style={{ margin: 0, fontSize: '1rem' }}>
            {todayFormatted} · Daily adaptive lifestyle guidance grounded in verifiable biometric drivers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '0.5rem 1rem', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={handleQuickWearableSync}
            disabled={syncingWearable}
          >
            <Icon name="refresh" size={15} />
            {syncingWearable ? 'Syncing...' : 'Sync Wearable'}
          </button>
          <Link to="/log" className="submit-btn" style={{ padding: '0.5rem 1.15rem', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Icon name="activity" size={15} />
            Daily Check-In
          </Link>
        </div>
      </header>

      {/* EMPTY STATE IF NO RECOMMENDATION YET */}
      {!latest ? (
        <section className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
            <Icon name="calendar" size={32} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            CHECK-IN REQUIRED FOR TODAY
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>No Plan Generated Yet for Today</h2>
          <p className="sub-text" style={{ maxWidth: '480px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
            Complete your quick 30-second biometric check-in or sync your wearable band to run today’s XGBoost machine learning model.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/log" className="submit-btn" style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}>
              Start Today’s Check-In
            </Link>
            <button type="button" className="btn-outline" onClick={handleQuickWearableSync} disabled={syncingWearable} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
              {syncingWearable ? 'Syncing...' : 'Sync Wearable Device'}
            </button>
          </div>
        </section>
      ) : (
        /* PROMINENT TODAY'S RECOMMENDATION HERO CARD */
        <>
          <section className="card hero-rec-card" style={{ border: '2px solid #10b981', background: '#ffffff', position: 'relative' }}>
            {/* Top Date & Category Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.02em', maxWidth: '100%' }}>
                <Icon name="calendar" size={14} /> TODAY · {todayFormatted.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>
                XGBoost Latency: {latest.latency_ms || 12}ms
              </div>
            </div>

            {/* Recommendation Title */}
            <h2 className="rec-hero-title" style={{ fontSize: '1.85rem', color: '#111827', margin: '0 0 0.4rem 0' }}>
              {latest.recommendation}
            </h2>

            {/* Plain English Rationale */}
            <p className="rec-hero-desc" style={{ fontSize: '1.05rem', lineHeight: '1.55', color: '#374151', margin: '0 0 1.15rem 0' }}>
              {latest.explanation}
            </p>

            {/* Today's Checked-in Biometrics Snapshot */}
            <div className="biometrics-stat-grid" style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '1.15rem' }}>
              <div style={{ padding: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Sleep Logged</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginTop: '0.15rem' }}>
                  {latest.metrics?.sleep != null ? `${latest.metrics.sleep} hrs` : '7.0 hrs (imputed)'}
                </div>
              </div>
              <div style={{ padding: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Resting HR</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginTop: '0.15rem' }}>
                  {latest.metrics?.heartRate != null ? `${latest.metrics.heartRate} bpm` : '70 bpm'}
                </div>
              </div>
              <div style={{ padding: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Daily Steps</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginTop: '0.15rem' }}>
                  {latest.metrics?.steps != null ? Number(latest.metrics.steps).toLocaleString() : '8,000'}
                </div>
              </div>
              <div style={{ padding: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Fatigue Level</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginTop: '0.15rem' }}>
                  {latest.metrics?.fatigue != null ? `${latest.metrics.fatigue} / 10` : '4.0 / 10'}
                </div>
              </div>
            </div>

            {/* One-Tap Closed-Loop Start Session Pre-Fill */}
            <div style={{ marginBottom: '1.15rem' }}>
              <button
                type="button"
                className="submit-btn mobile-w-full"
                onClick={handleStartRecommendedSession}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  padding: '0.8rem 1.4rem',
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  borderRadius: '12px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                }}
              >
                <Icon name="play" size={18} /> Start Recommended Session (Pre-Filled)
              </button>
            </div>

            {/* Adherence Quick Tracker */}
            <div className="rec-adherence-container" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Did you complete today's plan?</span>
                {adherenceMsg && <span style={{ color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>✓ {adherenceMsg}</span>}
              </div>
              <div className="rec-adherence-btns" style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="rec-adherence-btn"
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${latest.adherence === 'completed' ? '#10b981' : '#d1d5db'}`,
                    background: latest.adherence === 'completed' ? '#ecfdf5' : '#ffffff',
                    color: latest.adherence === 'completed' ? '#065f46' : '#374151',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickAdherence('completed')}
                >
                  ✓ Completed
                </button>
                <button
                  type="button"
                  className="rec-adherence-btn"
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${latest.adherence === 'modified' ? '#10b981' : '#d1d5db'}`,
                    background: latest.adherence === 'modified' ? '#ecfdf5' : '#ffffff',
                    color: latest.adherence === 'modified' ? '#065f46' : '#374151',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickAdherence('modified')}
                >
                  ~ Modified
                </button>
                <button
                  type="button"
                  className="rec-adherence-btn"
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${latest.adherence === 'skipped' ? '#ef4444' : '#d1d5db'}`,
                    background: latest.adherence === 'skipped' ? '#fef2f2' : '#ffffff',
                    color: latest.adherence === 'skipped' ? '#991b1b' : '#374151',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleQuickAdherence('skipped')}
                >
                  ✕ Skipped / Rest
                </button>
              </div>
            </div>
          </section>

          {/* USER-FRIENDLY TABS: INSTEAD OF SHOWING EVERYTHING AT ONCE */}
          <div>
            <div className="scroll-tabs" style={{ borderBottom: '2px solid #e5e7eb', marginBottom: '1.25rem' }}>
              {[
                { id: 'plan', label: "Today's Guidance & Recourse", icon: 'compass' },
                { id: 'explain', label: 'Why This Plan? (SHAP Explainability)', icon: 'chart' },
                { id: 'trends', label: '7 & 30-Day Trends', icon: 'activity' },
                { id: 'feedback', label: 'Share Feedback', icon: 'shield' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    style={{
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      background: 'transparent',
                      borderBottom: isActive ? '3px solid #10b981' : '3px solid transparent',
                      color: isActive ? '#065f46' : '#6b7280',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      whiteSpace: 'nowrap',
                      marginBottom: '-2px',
                    }}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon name={tab.icon} size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: TODAY'S GUIDANCE & RECOURSE */}
            {activeTab === 'plan' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {latest.what_if && (
                  <section className="card" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>
                      <Icon name="compass" size={18} /> What-If Recourse Lever for Tomorrow
                    </div>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#047857', lineHeight: 1.5 }}>
                      {latest.what_if}
                    </p>
                    <div style={{ marginTop: '0.75rem' }}>
                      <Link to="/explorer" className="btn-outline" style={{ background: '#ffffff', fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
                        Simulate Custom What-If Scenarios →
                      </Link>
                    </div>
                  </section>
                )}

                {/* Shortcuts & Generators */}
                <div className="responsive-card-grid">
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Log a Workout Session</h3>
                      <p className="sub-text" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Record duration, workout type, and notes for running, gym, cycling, or yoga.
                      </p>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <Link to="/log" className="btn-outline" style={{ display: 'block', textAlign: 'center' }}>
                        Log Workout in Activity Log
                      </Link>
                    </div>
                  </div>

                  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: user.role === 'premium' ? '1.5px solid #10b981' : '1px solid #e5e7eb' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Tailored Workout Generator</h3>
                        {user.role === 'premium' ? (
                          <span style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            PLUS UNLOCKED
                          </span>
                        ) : (
                          <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            PREMIUM
                          </span>
                        )}
                      </div>
                      <p className="sub-text" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Generate a 30-min walking, cycling, or yoga routine specifically calibrated for {latest.recommendation}.
                      </p>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      {user.role === 'premium' ? (
                        <Link to="/premium" className="submit-btn" style={{ display: 'block', textAlign: 'center' }}>
                          Generate Custom Workout
                        </Link>
                      ) : (
                        <Link to="/subscription" className="btn-outline" style={{ display: 'block', textAlign: 'center' }}>
                          Upgrade to Plus to Unlock
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WHY THIS PLAN? (SHAP EXPLAINABILITY) */}
            {activeTab === 'explain' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <ShapBreakdown factors={latest.shap_factors} />

                {user.role === 'premium' && (
                  <section className="card">
                    <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Detailed TreeSHAP Attribution Breakdown</h3>
                    <p className="sub-text" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{latest.explanation}</p>
                    <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, fontSize: '0.95rem' }}>
                      {Array.isArray(latest.shap_factors) && latest.shap_factors.map((factor) => (
                        <li key={factor.key || factor.feature}>
                          <strong>{factor.feature}</strong>: logged as {String(factor.value)}, tree attribution {factor.impact >= 0 ? `+${factor.impact}%` : `${factor.impact}%`}
                        </li>
                      ))}
                    </ul>
                    <p className="sub-text" style={{ fontSize: '0.8rem', marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
                      Attributions describe this model output’s local gradient weights, not medical causality.
                    </p>
                  </section>
                )}

                <WhatIfExplorer whatIf={latest.what_if} />
              </div>
            )}

            {/* TAB 3: 7 & 30-DAY TRENDS */}
            {activeTab === 'trends' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <Suspense fallback={<section className="card"><p className="sub-text">Loading trends...</p></section>}>
                  <Trends history={history} />
                </Suspense>
              </div>
            )}

            {/* TAB 4: SHARE FEEDBACK */}
            {activeTab === 'feedback' && (
              <FeedbackSection
                key={latest.recommendation_id}
                recommendation={latest}
                onAdherenceSaved={updateRecommendationAdherence}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}
