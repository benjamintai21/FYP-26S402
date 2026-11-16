import { useEffect, useState } from 'react';
import { deleteGoal, getGoals, getPreferences, saveGoal, savePreferences } from '../api';

const EMPTY_GOAL = { title: '', category: 'steps', target: '', current: '0', unit: 'steps', deadline: '', status: 'active' };
const splitItems = (text) => text.split(',').map((item) => item.trim()).filter(Boolean);

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [goal, setGoal] = useState(EMPTY_GOAL);
  const [editing, setEditing] = useState(null);
  const [preferences, setPreferences] = useState({ workout: '', dietary: '', availableMinutes: 45 });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getGoals(), getPreferences()]).then(([goalData, prefs]) => {
      if (!active) return;
      setGoals(goalData.goals);
      setPreferences({ ...prefs, workout: prefs.workout.join(', '), dietary: prefs.dietary.join(', ') });
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const submitGoal = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await saveGoal({ ...goal, target: Number(goal.target), current: Number(goal.current) }, editing);
      const data = await getGoals();
      setGoals(data.goals);
      setGoal(EMPTY_GOAL);
      setEditing(null);
      setMessage('Goal saved.');
    } catch (err) { setError(err.message); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    setError('');
    try {
      await deleteGoal(id);
      setGoals((current) => current.filter((item) => item.id !== id));
      if (editing === id) { setGoal(EMPTY_GOAL); setEditing(null); }
      setMessage('Goal deleted.');
    } catch (err) { setError(err.message); }
  };
  const submitPreferences = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await savePreferences({
        workout: splitItems(preferences.workout), dietary: splitItems(preferences.dietary),
        availableMinutes: Number(preferences.availableMinutes),
      });
      setMessage('Preferences saved.');
    } catch (err) { setError(err.message); }
  };
  const goalChange = (event) => setGoal({ ...goal, [event.target.name]: event.target.value });
  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Goals and preferences</h1><p>Keep your targets, available time and preferences up to date.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      <div className="content-grid">
        <div className="grid-col">
          <section className="card">
            <h2>{editing ? 'Edit goal' : 'Create a goal'}</h2>
            <form onSubmit={submitGoal}>
              <div className="form-group"><label htmlFor="goal-title">Title</label><input id="goal-title" name="title" maxLength={150} value={goal.title} onChange={goalChange} required /></div>
              <div className="form-group"><label htmlFor="goal-category">Category</label><select id="goal-category" name="category" value={goal.category} onChange={goalChange}>
                <option value="steps">Steps</option><option value="sleep">Sleep</option><option value="cardio_minutes">Activity minutes</option><option value="recovery_days">Recovery days</option><option value="general_fitness">General fitness</option>
              </select></div>
              <div className="form-group"><label htmlFor="goal-target">Target</label><input id="goal-target" type="number" name="target" min="0.01" max="999999.99" step="0.01" value={goal.target} onChange={goalChange} required /></div>
              <div className="form-group"><label htmlFor="goal-current">Current progress</label><input id="goal-current" type="number" name="current" min="0" max="999999.99" step="0.01" value={goal.current} onChange={goalChange} required /></div>
              <div className="form-group"><label htmlFor="goal-unit">Unit</label><input id="goal-unit" name="unit" maxLength={30} value={goal.unit} onChange={goalChange} required /></div>
              <div className="form-group"><label htmlFor="goal-deadline">Deadline (optional)</label><input id="goal-deadline" name="deadline" type="date" value={goal.deadline || ''} onChange={goalChange} /></div>
              <div className="form-group"><label htmlFor="goal-status">Status</label><select id="goal-status" name="status" value={goal.status} onChange={goalChange}><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div>
              <button className="submit-btn" type="submit">{editing ? 'Save changes' : 'Create goal'}</button>
              {editing && <button className="btn-outline" type="button" onClick={() => { setEditing(null); setGoal(EMPTY_GOAL); }}>Cancel editing</button>}
            </form>
          </section>
          <section className="card"><h2>Your goals</h2>
            {goals.length === 0 && <p className="sub-text">No goals yet.</p>}
            {goals.map((item) => <div key={item.id} className="form-group">
              <strong>{item.title}</strong><span>{item.current} / {item.target} {item.unit} · {item.status}{item.deadline ? ` · Due ${item.deadline}` : ''}</span>
              <div><button type="button" className="btn-outline" onClick={() => { setGoal(item); setEditing(item.id); }}>Edit</button>{' '}
                <button type="button" className="btn-outline" onClick={() => remove(item.id)}>Delete</button></div>
            </div>)}
          </section>
        </div>
        <section className="card">
          <h2>Preferences</h2>
          <form onSubmit={submitPreferences}>
            <div className="form-group"><label htmlFor="minutes">Available minutes per day</label><input id="minutes" type="number" min="0" max="1440" value={preferences.availableMinutes} onChange={(e) => setPreferences({ ...preferences, availableMinutes: e.target.value })} required /></div>
            <div className="form-group"><label htmlFor="workout-prefs">Workout preferences (comma-separated)</label><input id="workout-prefs" value={preferences.workout} onChange={(e) => setPreferences({ ...preferences, workout: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="diet-prefs">Dietary preferences and restrictions (comma-separated)</label><input id="diet-prefs" value={preferences.dietary} onChange={(e) => setPreferences({ ...preferences, dietary: e.target.value })} /></div>
            <button type="submit" className="submit-btn">Save preferences</button>
          </form>
        </section>
      </div>
    </main>
  );
}
