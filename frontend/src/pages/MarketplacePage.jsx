import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getMarketplace, reserveOffering, getEventNotifications } from '../api';
import { MEMBER_ROLES } from '../roles';
import Community from '../components/Community';

export default function MarketplacePage() {
  const { user } = useApp();
  const [data, setData] = useState({ services: [], events: [], posts: [] });
  const [notifications, setNotifications] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const member = user && MEMBER_ROLES.includes(user.role);
  useEffect(() => {
    let active = true;
    getMarketplace().then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); });
    if (member) getEventNotifications().then((result) => { if (active) setNotifications(result.notifications); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [member]);
  const reserve = async (resource, id) => {
    setError('');
    setMessage('');
    try { setMessage((await reserveOffering(resource, id)).message); }
    catch (err) { setError(err.message); }
  };
  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Discover</h1><p>Explore services, events and posts from businesses.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      {notifications.length > 0 && <section className="card"><h2>Event updates</h2>{notifications.map((notice) => <p key={notice.id}>{notice.message} {notice.event.dateTime} · {notice.event.venue} · {notice.event.status}</p>)}</section>}
      {['services', 'events', 'posts'].map((resource) => <section key={resource} className="card">
        <h2>{resource[0].toUpperCase() + resource.slice(1)}</h2>
        {data[resource].length === 0 && <p className="sub-text">Nothing available yet.</p>}
        {data[resource].map((item) => <div className="form-group" key={item.id}>
          <strong>{item.title}</strong><span>By {item.business}</span><p>{item.description || item.body}</p>
          {resource === 'services' && <p>{item.schedule} · {item.price}</p>}
          {resource === 'events' && <p>{item.dateTime} · {item.venue}</p>}
          {resource !== 'posts' && (member ? <button className="btn-outline" type="button" onClick={() => reserve(resource, item.id)}>Reserve</button> : !user ? <Link to="/login">Sign in to reserve</Link> : null)}
        </div>)}
      </section>)}
      <Community member={Boolean(member)} />
    </main>
  );
}
