export default function RecommendationCard({ recommendation, explanation }) {
  return (
    <section className="card rec-card">
      <span className="badge">Today's Focus</span>
      <h2 className="rec-title">{recommendation}</h2>
      <div className="rec-explanation">
        <strong>Why this plan? </strong>
        <span>{explanation}</span>
      </div>
      <div className="disclaimer-note">
        Non-Clinical Lifestyle Guidance • Based on daily physiological recovery variance
      </div>
    </section>
  );
}