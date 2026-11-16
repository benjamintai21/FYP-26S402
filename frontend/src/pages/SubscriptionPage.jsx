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
      <header className="page-header"><h1>Test subscription</h1><p>Manual simulation only. No payment is taken and subscriptions do not renew automatically.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {data && <section className="card">
        <h2>{data.plan}</h2>
        <p>Reference price: {data.currency} {data.referencePrice} per month. No charge in test mode.</p>
        {data.subscription ? <>
          <p>Status: {data.subscription.status}</p>
          <p>Access until: {data.subscription.accessUntil}</p>
          {data.subscription.status === 'active' && <button className="btn-outline" type="button" disabled={busy} onClick={() => action('cancel')}>Cancel future renewal</button>}{' '}
          <button className="btn-outline" type="button" disabled={busy} onClick={() => action('renew')}>Renew for 30 days</button>
        </> : <button className="submit-btn" type="button" disabled={busy} onClick={() => action('start')}>Start test subscription</button>}
      </section>}
    </main>
  );
}
