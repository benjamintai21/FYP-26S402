import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getSubscription, updateSubscription } from '../api';

export default function SubscriptionPage() {
  const { refreshUser } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getSubscription().then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const action = async (name) => {
    setBusy(true);
    setError('');
    try {
      setData(await updateSubscription(name));
      await refreshUser();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <main className="dashboard-container narrow">
      <header className="page-header"><h1>Subscription</h1><p>Purchase a monthly premium subscription to unlock personalized plans, advanced What-If scenarios, and the expert library.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {data && <section className="card">
        <h2>{data.plan}</h2>
        <p>Price: {data.currency} {data.referencePrice} per month.</p>
        <p className="sub-text">{data.benefits && data.benefits.map && data.benefits.map((b, i) => <span key={i}><br/>{b}</span>)}</p>
        {data.subscription ? <>
          <p>Status: {data.subscription.status}</p>
          <p>Access until: {data.subscription.accessUntil}</p>
          {data.subscription.status === 'active' && <button className="btn-outline" type="button" disabled={busy} onClick={() => action('cancel')}>Cancel future renewal</button>}{' '}
          <button className="btn-outline" type="button" disabled={busy} onClick={() => action('renew')}>Renew for 30 days</button>
        </> : <button className="submit-btn" type="button" disabled={busy} onClick={() => action('start')}>Purchase subscription</button>}
      </section>}
    </main>
  );
}
