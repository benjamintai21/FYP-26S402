export default function AboutPage() {
  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>About Healthy360</h1>
        <p>CSIT-26-S4-03 • Explainable AI for health and lifestyle recommendations</p>
      </header>
      <section className="card prose">
        <h3>The problem</h3>
        <p>Most fitness apps are black boxes: they tell you what to do without showing why. Healthy360 makes every recommendation auditable.</p>
        <h3>How it works</h3>
        <ul>
          <li><strong>Local feature attribution:</strong> TreeSHAP shows which metrics influenced your plan.</li>
          <li><strong>Plain-English rationale:</strong> template rules translate scores into sentences, with no generative AI and no hallucination.</li>
          <li><strong>Counterfactual recourse:</strong> the What-If Explorer shows the habit changes needed for a higher-intensity plan.</li>
          <li><strong>Fairness auditing:</strong> performance is monitored across age brackets and activity baselines.</li>
        </ul>
        <h3>Scope and privacy</h3>
        <p>Healthy360 provides non-clinical lifestyle guidance only. It does not diagnose, treat or replace medical advice. Personal data is handled in line with the Singapore PDPA, and business dashboards only show cohorts of 5 or more people.</p>
      </section>
    </main>
  );
}