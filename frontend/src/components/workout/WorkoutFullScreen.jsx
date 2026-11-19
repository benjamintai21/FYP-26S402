import { useMemo } from 'react';
import { useWorkout, MODALITIES, INTENSITIES, formatStopwatch } from '../../context/WorkoutContext';
import { useApp } from '../../context/AppContext';
import Icon from '../Icon';

export default function WorkoutFullScreen() {
  const { latest } = useApp();
  const {
    isActive,
    status,
    isMinimized,
    modalityId,
    activeModality,
    intensity,
    seconds,
    currentCalories,
    currentDistance,
    recMeta,
    setModalityId,
    setIntensity,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    minimizeWorkout,
    stopAndFinish,
    discardWorkout,
  } = useWorkout();

  // Closed-loop XAI Guardrail Warning
  const guardrailWarning = useMemo(() => {
    if (!latest) return null;
    const isHigh = modalityId === 'hiit' || intensity === 'vigorous';
    const isModerate = intensity === 'moderate';

    // If today's model predicted Active Recovery (Plan 0)
    if (latest.plan_level === 0 || (latest.recommendation && latest.recommendation.toLowerCase().includes('recovery'))) {
      if (isHigh) {
        const factors = Array.isArray(latest.shap_factors) ? latest.shap_factors : [];
        const sleepF = factors.find((f) => f.key === 'sleep');
        const hrF = factors.find((f) => f.key === 'heartRate');
        const sleepStr = sleepF ? `sleep deficit (${sleepF.impact >= 0 ? `-${sleepF.impact}%` : `${sleepF.impact}%`})` : 'sleep deficit (-45%)';
        const hrStr = hrF ? `elevated resting HR (${hrF.impact >= 0 ? `-${hrF.impact}%` : `${hrF.impact}%`})` : 'elevated resting HR (-30%)';

        return {
          type: 'danger',
          title: 'Safety Nudge',
          text: `Today's model weighted your ${sleepStr} and ${hrStr} toward recovery. Pushing at high intensity today increases burnout risk.`,
        };
      }
      if (isModerate) {
        return {
          type: 'info',
          title: 'Recovery Pacing',
          text: "Today's AI model recommended gentle recovery. Keep effort capped to avoid compounding fatigue.",
        };
      }
    }
    return null;
  }, [latest, modalityId, intensity]);

  if (!isActive || isMinimized || status === 'finished') {
    return null;
  }

  const handleDiscard = () => {
    if (seconds > 0 && !window.confirm('Are you sure you want to discard this workout?')) return;
    discardWorkout();
  };

  return (
    <div className="workout-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Active Workout Tracker">
      <div className="workout-fullscreen-container">
        {/* Top Header Bar */}
        <header className="workout-fullscreen-header">
          <div className="workout-fs-modality-info">
            <span className="workout-fs-modality-icon" style={{ background: `${activeModality.color}25`, color: activeModality.color }}>
              {activeModality.icon}
            </span>
            <div>
              <h1 className="workout-fs-title">{activeModality.label}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span className={`workout-fs-status-pill ${status}`}>
                  {status === 'running' && '● RECORDING'}
                  {status === 'paused' && '❚❚ PAUSED'}
                  {status === 'idle' && 'READY TO START'}
                </span>
                {recMeta && (
                  <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                    Target: {recMeta.targetDuration}m @ RPE ≤ {recMeta.targetRpeCap}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Minimize / Multitask Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              className="workout-fs-minimize-btn"
              onClick={minimizeWorkout}
              title="Minimize to background and continue navigating app"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Minimize & Multitask</span>
            </button>
            {status === 'idle' && (
              <button
                type="button"
                className="workout-fs-close-btn"
                onClick={discardWorkout}
                title="Close tracker"
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {/* Live XAI Guardrail Warning Banner */}
        {guardrailWarning && (
          <div
            style={{
              background: guardrailWarning.type === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              border: `1.5px solid ${guardrailWarning.type === 'danger' ? '#ef4444' : '#3b82f6'}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              color: '#ffffff',
              fontSize: '0.85rem',
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: guardrailWarning.type === 'danger' ? '#fca5a5' : '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
              ⚠️ {guardrailWarning.title}
            </strong>
            <span>{guardrailWarning.text}</span>
          </div>
        )}

        {/* Center Hero Displays */}
        <main className="workout-fullscreen-body">
          {/* Main Elapsed Clock */}
          <div className="workout-fs-timer-wrap">
            <span className="workout-fs-timer-label">ELAPSED TIME</span>
            <div className="workout-fs-timer-digits">
              {formatStopwatch(seconds)}
            </div>
          </div>

          {/* Big Live Calories Ticker */}
          <div className="workout-fs-calories-wrap">
            <div className="workout-fs-cal-badge">
              <Icon name="flame" size={28} />
              <span className="workout-fs-cal-num">{currentCalories}</span>
              <span className="workout-fs-cal-unit">kcal</span>
            </div>
          </div>

          {/* Real-Time Telemetry HUD Grid */}
          <div className="workout-fs-telemetry-grid">
            <div className="workout-fs-tele-card">
              <span className="workout-fs-tele-label">INTENSITY</span>
              <span className="workout-fs-tele-val" style={{ color: '#60a5fa', textTransform: 'capitalize' }}>
                {intensity}
              </span>
            </div>
            {activeModality.distance && (
              <div className="workout-fs-tele-card">
                <span className="workout-fs-tele-label">EST. DISTANCE</span>
                <span className="workout-fs-tele-val" style={{ color: '#34d399' }}>
                  {currentDistance ? `${currentDistance} km` : '0.00 km'}
                </span>
              </div>
            )}
            <div className="workout-fs-tele-card">
              <span className="workout-fs-tele-label">MET FACTOR</span>
              <span className="workout-fs-tele-val" style={{ color: '#fbbf24' }}>
                {activeModality.met}
              </span>
            </div>
          </div>

          {/* Live Intensity Effort Selector */}
          <div className="workout-fs-intensity-bar">
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Effort Level:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {INTENSITIES.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`workout-fs-intensity-pill ${intensity === i.id ? 'active' : ''}`}
                  onClick={() => setIntensity(i.id)}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          {/* If Idle: Modality Selector Chips */}
          {status === 'idle' && (
            <div style={{ width: '100%', maxWidth: '640px', marginTop: '0.5rem' }}>
              <span style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.5rem', textAlign: 'center' }}>
                Change activity before starting:
              </span>
              <div className="modality-chips-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}>
                {MODALITIES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className={`modality-chip-btn ${modalityId === mod.id ? 'selected' : ''}`}
                    style={{ background: modalityId === mod.id ? 'rgba(37,99,235,0.2)' : 'rgba(255,255,255,0.06)', color: '#ffffff', borderColor: modalityId === mod.id ? '#3b82f6' : 'rgba(255,255,255,0.12)' }}
                    onClick={() => setModalityId(mod.id)}
                  >
                    <span style={{ fontSize: '1.4rem' }}>{mod.icon}</span>
                    <span style={{ fontSize: '0.75rem' }}>{mod.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Interactive Controls */}
        <footer className="workout-fullscreen-footer">
          {status === 'idle' && (
            <button
              type="button"
              className="workout-fs-btn-start"
              onClick={() => startWorkout(modalityId, intensity, recMeta)}
            >
              <Icon name="play" size={24} /> START WORKOUT
            </button>
          )}

          {status === 'running' && (
            <div className="workout-fs-actions-dual">
              <button
                type="button"
                className="workout-fs-btn-pause"
                onClick={pauseWorkout}
              >
                <Icon name="pause" size={22} /> Pause
              </button>
              <button
                type="button"
                className="workout-fs-btn-finish"
                onClick={stopAndFinish}
              >
                <Icon name="check" size={22} /> Finish & Summary
              </button>
            </div>
          )}

          {status === 'paused' && (
            <div className="workout-fs-actions-triple">
              <button
                type="button"
                className="workout-fs-btn-start"
                onClick={resumeWorkout}
              >
                <Icon name="play" size={22} /> Resume
              </button>
              <button
                type="button"
                className="workout-fs-btn-finish"
                onClick={stopAndFinish}
              >
                <Icon name="check" size={22} /> Finish
              </button>
              <button
                type="button"
                className="workout-fs-btn-discard"
                onClick={handleDiscard}
              >
                Discard
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
