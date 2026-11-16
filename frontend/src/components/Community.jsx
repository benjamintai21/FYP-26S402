import { useEffect, useState } from 'react';
import { getChallenges, getCohorts, getLeaderboard, joinChallenge, leaveChallenge, joinCohort, leaveCohort } from '../api';

export default function Community({ member }) {
  const [challenges, setChallenges] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [challengeConsent, setChallengeConsent] = useState(false);
  const [cohortConsent, setCohortConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getChallenges(), getCohorts()]).then(([a, b]) => {
      if (active) { setChallenges(a.challenges); setCohorts(b.cohorts); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const perform = async (operation, success) => {
    setError('');
    setMessage('');
    try { await operation(); setMessage(success); }
    catch (err) { setError(err.message); }
  };
  const standings = async (id) => {
    setError('');
    try { setLeaderboard(await getLeaderboard(id)); }
    catch (err) { setError(err.message); }
  };
  return (
    <>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      <section className="card">
        <h2>Step challenges</h2>
        <p className="sub-text">Joining shares your pseudonymous score publicly. Scores use your non-simulated step logs, capped at 20,000 per day. You can leave at any time.</p>
        {member && <label className="consent"><input type="checkbox" checked={challengeConsent} onChange={(e) => setChallengeConsent(e.target.checked)} /><span>I consent to showing my pseudonymous score publicly for a challenge I join.</span></label>}
        {challenges.length === 0 && <p>No current challenges.</p>}
        {challenges.map((challenge) => <div className="form-group" key={challenge.id}>
          <strong>{challenge.title}</strong><span>By {challenge.business} · {challenge.startDate} to {challenge.endDate} · Target {challenge.target} steps</span>
          <div><button type="button" className="btn-outline" onClick={() => standings(challenge.id)}>View leaderboard</button>{' '}
            {member && <><button type="button" className="btn-outline" disabled={!challengeConsent} onClick={() => perform(() => joinChallenge(challenge.id), 'You joined the challenge.')}>Join</button>{' '}
              <button type="button" className="btn-outline" onClick={() => perform(() => leaveChallenge(challenge.id), 'You left the challenge.')}>Leave</button></>}
          </div>
        </div>)}
        {leaderboard && <div><h3>{leaderboard.challenge.title}</h3><p className="sub-text">{leaderboard.note}</p>
          <ol>{leaderboard.standings.map((item) => <li key={item.participant}>{item.participant}: {item.score} steps</li>)}</ol>
          {leaderboard.standings.length === 0 && <p>No participants yet.</p>}
        </div>}
      </section>
      <section className="card">
        <h2>Opt-in business analytics</h2>
        <p className="sub-text">Joining shares your non-simulated sleep and step logs from the last 30 days in this business&apos;s aggregates. Results are suppressed below five contributors, but thresholding does not guarantee anonymity. You can leave at any time.</p>
        {member && <label className="consent"><input type="checkbox" checked={cohortConsent} onChange={(e) => setCohortConsent(e.target.checked)} /><span>I consent to my activity contributing to a business cohort I join.</span></label>}
        {cohorts.length === 0 && <p>No opt-in cohorts available.</p>}
        {cohorts.map((cohort) => <div className="form-group" key={cohort.id}>
          <strong>{cohort.business}: {cohort.name}</strong>
          {member && <div><button type="button" className="btn-outline" disabled={!cohortConsent} onClick={() => perform(() => joinCohort(cohort.id), 'You joined the cohort.')}>Join</button>{' '}
            <button type="button" className="btn-outline" onClick={() => perform(() => leaveCohort(cohort.id), 'You left the cohort.')}>Leave</button></div>}
        </div>)}
      </section>
    </>
  );
}
