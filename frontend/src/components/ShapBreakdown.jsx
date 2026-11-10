export default function ShapBreakdown({ factors }) {
  if (!factors || factors.length === 0) return null;

  return (
    <section className="card">
      <div className="card-header">
        <h3>Biometric Drivers (SHAP Attribution)</h3>
        <span className="sub-text">Relative feature weights driving today's decision</span>
      </div>
      <div className="factors-list">
        {factors.map((item, idx) => {
          const isPos = item.impact > 0;
          return (
            <div key={idx} className="factor-row">
              <span className="factor-name">{item.feature}</span>
              <div className="bar-track">
                <div
                  className={`bar-fill ${isPos ? 'fill-pos' : 'fill-neg'}`}
                  style={{ width: `${Math.min(Math.abs(item.impact) * 1.5, 100)}%` }}
                />
              </div>
              <span className={`factor-val ${isPos ? 'val-pos' : 'val-neg'}`}>
                {isPos ? `+${item.impact}%` : `${item.impact}%`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}