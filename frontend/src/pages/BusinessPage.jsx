import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { deleteBusinessItem, getBusinessItems, saveBusinessItem } from '../api';
import BusinessInsights from '../components/BusinessInsights';

const INITIAL = {
  services: { title: '', category: 'personal_training', description: '', price: '', schedule: '' },
  events: { title: '', description: '', dateTime: '', venue: '', capacity: 30 },
  posts: { title: '', type: 'announcement', body: '', expiresAt: '' },
};

export default function BusinessPage() {
  const { user } = useApp();
  const [resource, setResource] = useState('services');
  const [form, setForm] = useState(INITIAL.services);
  const [editing, setEditing] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getBusinessItems(resource).then((data) => { if (active) setItems(data.items); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [resource]);

  const selectResource = (value) => {
    setResource(value);
    setForm(INITIAL[value]);
    setEditing(null);
    setItems([]);
    setError('');
    setMessage('');
  };
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const body = { ...form };
      if (resource === 'services') body.price = Number(body.price);
      if (resource === 'events') body.capacity = Number(body.capacity);
      await saveBusinessItem(resource, body, editing);
      setItems((await getBusinessItems(resource)).items);
      setForm(INITIAL[resource]);
      setEditing(null);
      setMessage('Saved successfully.');
    } catch (err) { setError(err.message); }
  };
  const remove = async (item) => {
    if (!window.confirm(resource === 'events' ? 'Cancel this event?' : 'Remove this item?')) return;
    setError('');
    try {
      const result = await deleteBusinessItem(resource, item.id);
      setItems((await getBusinessItems(resource)).items);
      setMessage(result.message);
    } catch (err) { setError(err.message); }
  };
  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Business portal</h1><p>Welcome, {user.name}. Manage your published offerings.</p></header>
      <div className="form-group"><label htmlFor="business-resource">Manage</label><select id="business-resource" value={resource} onChange={(e) => selectResource(e.target.value)}>
        <option value="services">Services</option><option value="events">Events</option><option value="posts">Posts</option>
      </select></div>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      <div className="content-grid">
        <section className="card">
          <h2>{editing ? 'Edit' : 'Create'} {resource.slice(0, -1)}</h2>
          <form onSubmit={submit}>
            <div className="form-group"><label htmlFor="business-title">Title</label><input id="business-title" name="title" value={form.title} onChange={change} maxLength={resource === 'posts' ? 180 : 150} required /></div>
            {resource === 'services' && <>
              <div className="form-group"><label htmlFor="business-category">Category</label><select id="business-category" name="category" value={form.category} onChange={change}><option value="personal_training">Personal training</option><option value="group_class">Group class</option><option value="gym_membership">Gym membership</option><option value="wellness_program">Wellness program</option></select></div>
              <div className="form-group"><label htmlFor="business-price">Price</label><input id="business-price" type="number" min="0" max="999999.99" step="0.01" name="price" value={form.price} onChange={change} required /></div>
              <div className="form-group"><label htmlFor="business-schedule">Schedule</label><input id="business-schedule" name="schedule" maxLength={255} value={form.schedule} onChange={change} required /></div>
            </>}
            {resource === 'events' && <>
              <div className="form-group"><label htmlFor="event-date">Date and time (local)</label><input id="event-date" name="dateTime" type="datetime-local" value={form.dateTime} onChange={change} required /></div>
              <div className="form-group"><label htmlFor="event-venue">Venue</label><input id="event-venue" name="venue" maxLength={255} value={form.venue} onChange={change} required /></div>
              <div className="form-group"><label htmlFor="event-capacity">Capacity</label><input id="event-capacity" type="number" min="1" max="100000" name="capacity" value={form.capacity} onChange={change} required /></div>
            </>}
            {resource === 'posts' && <>
              <div className="form-group"><label htmlFor="post-type">Post type</label><select id="post-type" name="type" value={form.type} onChange={change}><option value="announcement">Announcement</option><option value="tip">Tip</option><option value="promotion">Promotion</option></select></div>
              <div className="form-group"><label htmlFor="post-expiry">Expiry (optional, local)</label><input id="post-expiry" name="expiresAt" type="datetime-local" value={form.expiresAt || ''} onChange={change} /></div>
            </>}
            <div className="form-group"><label htmlFor="business-description">{resource === 'posts' ? 'Post' : 'Description'}</label><textarea id="business-description" name={resource === 'posts' ? 'body' : 'description'} value={resource === 'posts' ? form.body : form.description} onChange={change} maxLength={5000} required /></div>
            <button type="submit" className="submit-btn">{editing ? 'Save changes' : 'Publish'}</button>
            {editing && <button type="button" className="btn-outline" onClick={() => { setEditing(null); setForm(INITIAL[resource]); }}>Cancel editing</button>}
          </form>
        </section>
        <section className="card">
          <h2>Your {resource}</h2>
          {items.length === 0 && <p className="sub-text">Nothing published yet.</p>}
          {items.map((item) => <div key={item.id} className="form-group">
            <strong>{item.title}</strong>
            <span>{resource === 'events' ? `${item.dateTime} · ${item.venue} · ${item.status}` : resource === 'services' ? `${item.schedule} · ${item.price}` : item.type}</span>
            <div>{(resource !== 'events' || item.status === 'scheduled') && <>
              <button type="button" className="btn-outline" onClick={() => { setForm(item); setEditing(item.id); }}>Edit</button>{' '}
              <button type="button" className="btn-outline" onClick={() => remove(item)}>{resource === 'events' ? 'Cancel event' : 'Remove'}</button>
            </>}</div>
          </div>)}
        </section>
      </div>
      <BusinessInsights />
    </main>
  );
}
