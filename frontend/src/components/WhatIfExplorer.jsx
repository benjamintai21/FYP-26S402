export default function WhatIfExplorer({ whatIf }) {
  if (!whatIf) return null;

  return (
    <section className="card whatif-card">
      <div className="whatif-badge">Actionable Recourse</div>
      <h4>"What-If" Explorer</h4>
      <p>{whatIf}</p>
    </section>
  );
}