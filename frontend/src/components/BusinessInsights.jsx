import { useEffect, useState } from 'react';
import { createChallenge, enableCohort, getBusinessAnalytics, getBusinessChallenges, getBusinessCohort, getLeaderboard } from '../api';

export default function BusinessInsights() {
  const [challenges, setChallenges] = useState([]);
  const [form, setForm] = useState({ title: '', target: '', startDate: '', endDate: '' });
  const [cohort, setCohort] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getBusinessChallenges(), getBusinessCohort()]).then(([challengeData, cohortData]) => {
      if (!active) return;
      setChallenges(challengeData.challenges);
      setCohort(cohortData.cohort);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await createChallenge({ ...form, target: Number(form.target) });
      setChallenges((await getBusinessChallenges()).challenges);
      setForm({ title: '', target: '', startDate: '', endDate: '' });
    } catch (err) { setError(err.message); }
  };
  const enable = async () => {
    setError('');
    try { setCohort((await enableCohort()).cohort); }
    catch (err) { setError(err.message); }
  };
  const showAnalytics = async () => {
    setError('');
    try { setAnalytics(await getBusinessAnalytics()); }
    catch (err) { setError(err.message); }
  };
  const showStandings = async (id) => {
    setError('');
    try { setLeaderboard(await getLeaderboard(id)); }
    catch (err) { setError(err.message); }
  };
  return (
    <div className="content-grid">
      <section className="card">
        <h2>Step challenges</h2>
        <p className="sub-text">Participants choose whether to share a public pseudonymous score.</p>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group"><label htmlFor="challenge-title">Challenge title</label><input id="challenge-title" required maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="challenge-target">Step target</label><input id="challenge-target" type="number" min="1" max="2000000000" required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="challenge-start">Start date</label><input id="challenge-start" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="challenge-end">End date</label><input id="challenge-end" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          <button type="submit" className="submit-btn">Create challenge</button>
        </form>
        {challenges.map((item) => <div className="form-group" key={item.id}><strong>{item.title}</strong><span>{item.startDate} to {item.endDate} · Target {item.target} steps</span><button type="button" className="btn-outline" onClick={() => showStandings(item.id)}>View standings</button></div>)}
        {leaderboard && <div><h3>{leaderboard.challenge.title} standings</h3><p className="sub-text">{leaderboard.note}</p>
          {leaderboard.standings.length === 0 && <p>No participants yet.</p>}
          <ol>{leaderboard.standings.map((item) => <li key={item.participant}>{item.participant}: {item.score} steps</li>)}</ol>
        </div>}
      </section>
      <section className="card">
        <h2>Opt-in activity analytics</h2>
        <p className="sub-text">Members must join your cohort. Results are suppressed unless at least five members contribute to each displayed metric.</p>
        {!cohort ? <button className="btn-outline" type="button" onClick={enable}>Enable cohort</button> : <button className="btn-outline" type="button" onClick={showAnalytics}>View aggregate trends</button>}
        {analytics && <>
          <p>{analytics.note}</p>
          {['steps', 'sleep'].map((key) => <p key={key}>{key === 'steps' ? 'Average daily steps' : 'Average sleep hours'}: {analytics.metrics[key] ? `${analytics.metrics[key].average} (${analytics.metrics[key].contributors} contributors)` : 'Not enough contributors'}</p>)}
          <h3>Daily step trend</h3>
          {analytics.stepsTrend.length === 0 && <p>Not enough contributors on any day.</p>}
          {analytics.stepsTrend.map((day) => <p key={day.date}>{day.date}: {day.averageSteps} ({day.contributors} contributors)</p>)}
        </>}
      </section>
    </div>
  );
}
