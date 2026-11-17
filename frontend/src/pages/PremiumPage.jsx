import { useEffect, useState } from 'react';
import { generatePremiumPlan, getGoalInsights, getPremiumArticles, getPremiumPlans } from '../api';

export default function PremiumPage() {
  const [plans, setPlans] = useState([]);
  const [articles, setArticles] = useState([]);
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([getPremiumPlans(), getPremiumArticles(), getGoalInsights()])
      .then(([planData, articleData, insightData]) => {
        if (!active) return;
        setPlans(planData.plans);
        setArticles(articleData.articles);
        setInsights(insightData.insights);
      }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const generate = async (type) => {
    setError('');
    setBusy(true);
    try { setPlans((await generatePremiumPlan(type)).plans); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Premium tools</h1><p>Explore non-clinical lifestyle ideas using your goals and supported preferences.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="content-grid">
        <div className="grid-col">
          <section className="card">
            <h2>Generate ideas</h2>
            <p className="sub-text">Complete a daily check-in first. Ideas use your latest recommendation. Workout ideas support walking, cycling and yoga. Meal ideas support vegetarian and vegan preferences; other restrictions cannot yet be checked.</p>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => generate('workout')}>Generate workout ideas</button>{' '}
            <button type="button" className="btn-outline" disabled={busy} onClick={() => generate('meal')}>Generate meal ideas</button>
          </section>
          {plans.map((plan) => <section className="card" key={plan.id}>
            <h3>{plan.title}</h3>
            <p>{plan.details.notes}</p>
            {plan.details.recoveryRecommendation && <p>Based on your check-in: {plan.details.recoveryRecommendation}</p>}
            {plan.details.goals.length > 0 && <p>Active goals: {plan.details.goals.join(', ')}</p>}
            {plan.details.preferences.length > 0 && <p>Preferences: {plan.details.preferences.join(', ')}</p>}
            <ul>{plan.details.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
          </section>)}
        </div>
        <div className="grid-col">
          <section className="card">
            <h2>Goal progress suggestions</h2>
            <p className="sub-text">Simple progress-based suggestions, not AI or medical advice.</p>
            {insights.length === 0 && <p>No active goals yet.</p>}
            {insights.map((insight, index) => <div className="form-group" key={index}><strong>{insight.goal}: {insight.progressPercent}%</strong><p>{insight.suggestion}</p></div>)}
          </section>
          <section className="card">
            <h2>Approved educational content</h2>
            {articles.length === 0 && <p className="sub-text">No approved articles are available yet.</p>}
            {articles.map((article) => <article key={article.id} className="form-group"><h3>{article.title}</h3><p>{article.summary}</p><p>{article.content}</p></article>)}
          </section>
        </div>
      </div>
    </main>
  );
}
