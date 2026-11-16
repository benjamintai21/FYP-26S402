import { useEffect, useState } from 'react';
import { deleteActivity, getActivities, saveActivity } from '../api';

export default function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [form, setForm] = useState({ date: '', title: '', duration: '', notes: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getActivities().then((result) => { if (active) setActivities(result.activities); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await saveActivity({ ...form, duration: form.duration === '' ? null : Number(form.duration) });
      setActivities(result.activities);
      setForm({ date: form.date, title: '', duration: '', notes: '' });
      setMessage('Activity saved.');
    } catch (err) { setError(err.message); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this activity?')) return;
    setError('');
    try {
      await deleteActivity(id);
      setActivities((current) => current.filter((entry) => entry.id !== id));
      setMessage('Activity deleted.');
    } catch (err) { setError(err.message); }
  };
  return (
    <section className="card">
      <h2>Activity and habit log</h2>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={submit}>
        <div className="form-group"><label htmlFor="activity-date">Date</label><input id="activity-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="form-group"><label htmlFor="activity-title">Activity or habit</label><input id="activity-title" maxLength={150} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="form-group"><label htmlFor="activity-duration">Minutes (optional)</label><input id="activity-duration" type="number" min="0" max="1440" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
        <div className="form-group"><label htmlFor="activity-notes">Notes (optional)</label><textarea id="activity-notes" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <button type="submit" className="submit-btn">Save activity</button>
      </form>
      <h3>Recent activities</h3>
      {activities.length === 0 && <p className="sub-text">No activities yet.</p>}
      {activities.map((entry) => <div className="form-group" key={entry.id}>
        <strong>{entry.date}: {entry.title}</strong>
        {entry.duration !== null && <span>{entry.duration} minutes</span>}
        {entry.notes && <p>{entry.notes}</p>}
        <button type="button" className="btn-outline" onClick={() => remove(entry.id)}>Delete</button>
      </div>)}
    </section>
  );
}
