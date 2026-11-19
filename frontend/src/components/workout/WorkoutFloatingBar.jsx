import { useWorkout, formatStopwatch } from '../../context/WorkoutContext';
import Icon from '../Icon';

export default function WorkoutFloatingBar() {
  const {
    isActive,
    status,
    isMinimized,
    activeModality,
    seconds,
    currentCalories,
    currentDistance,
    pauseWorkout,
    resumeWorkout,
    maximizeWorkout,
    stopAndFinish,
  } = useWorkout();

  if (!isActive || !isMinimized || status === 'finished') {
    return null;
  }

  return (
    <aside
      className="workout-floating-widget"
      role="complementary"
      aria-label="Active Workout Running in Background"
    >
      {/* Clickable Area to Maximize */}
      <div
        className="workout-floating-content"
        onClick={maximizeWorkout}
        title="Click to maximize workout tracker full screen"
      >
        <div className="workout-floating-avatar" style={{ background: `${activeModality.color}20`, color: activeModality.color }}>
          <span>{activeModality.icon}</span>
          <span className={`workout-floating-dot ${status}`} />
        </div>

        <div className="workout-floating-info">
          <div className="workout-floating-top">
            <span className="workout-floating-name">{activeModality.label}</span>
            <span className="workout-floating-badge">{status.toUpperCase()}</span>
          </div>
          <div className="workout-floating-tele">
            <span className="workout-floating-clock">{formatStopwatch(seconds)}</span>
            <span className="workout-floating-cals">🔥 {currentCalories} kcal</span>
            {currentDistance && <span className="workout-floating-dist">📍 {currentDistance} km</span>}
          </div>
        </div>
      </div>

      {/* Mini Controls */}
      <div className="workout-floating-actions">
        {status === 'running' ? (
          <button
            type="button"
            className="workout-floating-btn pause"
            onClick={(e) => {
              e.stopPropagation();
              pauseWorkout();
            }}
            title="Pause workout"
          >
            <Icon name="pause" size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="workout-floating-btn play"
            onClick={(e) => {
              e.stopPropagation();
              resumeWorkout();
            }}
            title="Resume workout"
          >
            <Icon name="play" size={14} />
          </button>
        )}

        <button
          type="button"
          className="workout-floating-btn finish"
          onClick={(e) => {
            e.stopPropagation();
            stopAndFinish();
          }}
          title="Finish and save summary"
        >
          <Icon name="check" size={14} />
        </button>

        <button
          type="button"
          className="workout-floating-btn maximize"
          onClick={(e) => {
            e.stopPropagation();
            maximizeWorkout();
          }}
          title="Maximize to full screen"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
