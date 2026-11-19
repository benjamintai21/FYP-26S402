import { useWorkout } from '../context/WorkoutContext';
import Icon from './Icon';

export default function RecommendationCard({ recommendation, explanation, recommendationId, planLevel = 0, shapFactors = [] }) {
  const { startWorkout } = useWorkout();

  const handleStartRecommendedSession = () => {
    const recText = recommendation || '';
    let modality = 'walking';
    let intensity = 'light';
    let duration = 30;
    let targetRpeCap = 4;

    if (recText.includes('Walk') || planLevel === 0) {
      modality = 'walking';
      intensity = 'light';
      duration = 30;
      targetRpeCap = 4;
    } else if (recText.includes('Cardio') || recText.includes('Tempo') || planLevel === 1) {
      modality = 'running';
      intensity = 'moderate';
      duration = 40;
      targetRpeCap = 7;
    } else if (recText.includes('High-Intensity') || recText.includes('Interval') || planLevel === 2) {
      modality = 'hiit';
      intensity = 'vigorous';
      duration = 25;
      targetRpeCap = 10;
    }

    startWorkout(modality, intensity, {
      title: recommendation,
      targetDuration: duration,
      targetRpeCap,
      planLevel,
      recommendationId,
    });
  };

  return (
    <section className="card rec-card">
      <h2 className="rec-title">{recommendation}</h2>
      <div className="rec-explanation">
        <strong>Why this plan? </strong>
        <span>{explanation}</span>
      </div>

      <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
        <button
          type="button"
          className="submit-btn"
          onClick={handleStartRecommendedSession}
          style={{
            background: '#10b981',
            color: '#ffffff',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.75rem 1.25rem',
          }}
        >
          <Icon name="play" size={16} /> Start Recommended Session (Pre-Filled)
        </button>
      </div>

      <div className="disclaimer-note">
        Non-Clinical Lifestyle Guidance • Based on daily physiological recovery variance
      </div>
    </section>
  );
}
