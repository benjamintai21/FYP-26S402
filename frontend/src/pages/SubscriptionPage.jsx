import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSubscription, updateSubscription } from '../api';
import Icon from '../components/Icon';

const COMPARISON = [
  { feature: 'Daily XGBoost Activity Pacing', free: true, premium: true },
  { feature: 'SHAP Feature Attribution & Plain-English Rationale', free: true, premium: true },
  { feature: 'Daily Check-in & Wearable Sync', free: true, premium: true },
  { feature: 'Personalized Workout Plan Generator (Walking, Yoga, Cycling)', free: false, premium: true },
  { feature: 'Personalized Meal Plan Generator (Vegetarian & Vegan)', free: false, premium: true },
  { feature: 'Multi-Scenario What-If Recourse Explorer', free: false, premium: true },
  { feature: 'Adaptive AI Goal Adjustment Suggestions', free: false, premium: true },
  { feature: 'Expert-Reviewed Wellness & Recovery Library', free: false, premium: true },
];

export default function SubscriptionPage() {
  const { user, refreshUser } = useApp();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  // Modal states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'paynow'
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [cardName, setCardName] = useState(user?.name || 'Demo Member');
  const [showSuccess, setShowSuccess] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getSubscription()
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const priceMonthly = data?.referencePrice || 9.90;
  const priceAnnual = data?.annualPrice || 95.00;
  const currentPrice = billingCycle === 'annual' ? priceAnnual : priceMonthly;

  const handleCheckoutSubmit = async (e) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await updateSubscription('start', billingCycle);
      setData(result);
      await refreshUser();
      setCheckoutOpen(false);
      setShowSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRenew = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await updateSubscription('renew', billingCycle);
      setData(result);
      await refreshUser();
      setShowSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await updateSubscription('cancel');
      setData(result);
      await refreshUser();
      setCancelConfirmOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const isSubscribed = data?.subscription && (data.subscription.status === 'active' || data.subscription.status === 'cancelled');

  return (
    <main className="dashboard-container">
      {/* Top Banner & Header */}
      <header className="page-header" style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2rem auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', color: '#065f46', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          <Icon name="sparkles" size={16} /> Healthy360 Plus Membership
        </div>
        <h1 style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>
          {isSubscribed ? 'Your Healthy360 Plus Membership' : 'Upgrade to Healthy360 Plus'}
        </h1>
        <p className="sub-text" style={{ fontSize: '1.05rem', margin: 0 }}>
          {isSubscribed
            ? 'Manage your subscription, renewal schedule, and payment receipts.'
            : 'Evidence-based explainable AI pacing, custom meal and workout plans, and comprehensive health recourse.'}
        </p>
      </header>

      {error && <div className="alert-error" role="alert" style={{ maxWidth: '800px', margin: '0 auto 1.5rem auto' }}>{error}</div>}

      {/* SUCCESS CONFIRMATION MODAL */}
      {showSuccess && (
        <div className="modal-overlay" onClick={() => setShowSuccess(false)}>
          <div className="modal" style={{ maxWidth: '480px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <Icon name="check" size={34} />
            </div>
            <h2 style={{ marginBottom: '0.5rem' }}>You’re now a Plus Member!</h2>
            <p className="sub-text" style={{ marginBottom: '1.5rem' }}>
              Your simulated payment was completed successfully. All premium features, generators, and library tools are unlocked.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button type="button" className="submit-btn" onClick={() => { setShowSuccess(false); navigate('/premium'); }}>
                Go to Premium Tools
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowSuccess(false)}>
                Back to Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE SUBSCRIPTION OVERVIEW (If Already Subscribed) */}
      {isSubscribed && (
        <section className="card" style={{ maxWidth: '800px', margin: '0 auto 2rem auto', border: '1.5px solid #10b981', background: '#fcfdfd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
            <div>
              <span className={`role-badge role-${data.role}`} style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                {data.subscription.status === 'active' ? 'ACTIVE PLUS MEMBER' : 'CANCELLATION PENDING'}
              </span>
              <h2 style={{ margin: 0 }}>{data.plan}</h2>
              <p className="sub-text" style={{ margin: '0.25rem 0 0 0' }}>
                SGD ${priceMonthly.toFixed(2)}/month · Standard Tier
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>Access Valid Until</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
                {new Date(data.subscription.accessUntil).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/premium" className="submit-btn" style={{ textDecoration: 'none' }}>
                Open Premium Tools
              </Link>
              <button type="button" className="btn-outline" disabled={busy} onClick={handleRenew}>
                {busy ? 'Processing...' : 'Extend +30 Days'}
              </button>
            </div>
            {data.subscription.status === 'active' && (
              <button
                type="button"
                className="btn-outline"
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                disabled={busy}
                onClick={() => setCancelConfirmOpen(true)}
              >
                Cancel Future Renewal
              </button>
            )}
          </div>
        </section>
      )}

      {/* PLAN SELECTOR & VALUE COMPARISON (Shown for non-members or for members to see perks) */}
      {!isSubscribed && (
        <div style={{ maxWidth: '860px', margin: '0 auto 2.5rem auto' }}>
          {/* Billing Cycle Pill Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', background: '#f3f4f6', padding: '0.35rem', borderRadius: '999px', border: '1px solid #e5e7eb' }}>
              <button
                type="button"
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'monthly' ? '#ffffff' : 'transparent',
                  color: billingCycle === 'monthly' ? '#111827' : '#6b7280',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: billingCycle === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly (${priceMonthly.toFixed(2)}/mo)
              </button>
              <button
                type="button"
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'annual' ? '#ffffff' : 'transparent',
                  color: billingCycle === 'annual' ? '#111827' : '#6b7280',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: billingCycle === 'annual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setBillingCycle('annual')}
              >
                <span>Annual (${priceAnnual.toFixed(2)}/yr)</span>
                <span style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: 700 }}>
                  SAVE 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Tier Cards */}
          <div className="responsive-card-grid" style={{ marginBottom: '2.5rem' }}>
            {/* Free Tier */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #e5e7eb' }}>
              <div>
                <span className="role-badge role-registered" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
                  HEALTHY360 CORE
                </span>
                <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>Core Plan</h3>
                <p className="sub-text">Essential daily lifestyle guidance and explainability.</p>
                <div style={{ fontSize: '2.25rem', fontWeight: 'bold', margin: '1rem 0' }}>
                  $0 <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#6b7280' }}>/ free forever</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span> Daily XGBoost Pacing Recommendations
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span> SHAP Attributions & Plain-English Rationales
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span> Biometric Logging & Wearable Device Sync
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span> Personal Fitness Goal Tracking
                  </li>
                </ul>
              </div>
              <div>
                <button type="button" className="btn-outline" style={{ width: '100%' }} disabled>
                  Current Free Tier
                </button>
              </div>
            </div>

            {/* Premium Tier */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '2px solid #10b981', position: 'relative', background: '#fafdfb' }}>
              <div style={{ position: 'absolute', top: '-12px', right: '20px', background: '#10b981', color: '#ffffff', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.65rem', borderRadius: '999px', letterSpacing: '0.05em' }}>
                RECOMMENDED
              </div>
              <div>
                <span className="role-badge role-premium" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
                  HEALTHY360 PLUS
                </span>
                <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>Plus Membership</h3>
                <p className="sub-text">Everything in Core, plus tailored plans and deeper insights.</p>
                <div style={{ fontSize: '2.25rem', fontWeight: 'bold', margin: '1rem 0' }}>
                  SGD ${currentPrice.toFixed(2)}
                  <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#6b7280' }}>
                    {billingCycle === 'annual' ? ' / year (approx $7.92/mo)' : ' / month'}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    <strong>Structured Workout Generators</strong> (Walking, Yoga, Cycling)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    <strong>Personalized Meal Generators</strong> (Vegetarian & Vegan)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    <strong>Multi-Scenario What-If Recourse Explorer</strong>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    <strong>Adaptive AI Goal Adjustment Suggestions</strong>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
                    <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    <strong>Expert-Reviewed Wellness & Recovery Library</strong>
                  </li>
                </ul>
              </div>
              <div>
                <button
                  type="button"
                  className="submit-btn"
                  style={{ width: '100%', fontSize: '1.05rem', padding: '0.75rem' }}
                  onClick={() => setCheckoutOpen(true)}
                >
                  Upgrade to Plus · SGD ${currentPrice.toFixed(2)}
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', margin: '0.6rem 0 0 0' }}>
                  Instant activation · Cancel renewal anytime
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Feature Comparison Table */}
          <section className="card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginBottom: '1rem' }}>Plan Feature Comparison</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Platform Capability</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Healthy360 Core</th>
                  <th style={{ textAlign: 'center', width: '140px', background: '#f0fdf4', color: '#166534' }}>Healthy360 Plus</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={i}>
                    <td>{row.feature}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.free ? (
                        <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', background: '#f0fdf4' }}>
                      <span style={{ color: '#10b981' }}><Icon name="check" size={18} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* CHECKOUT MODAL (Modern Payment Simulation) */}
      {checkoutOpen && (
        <div className="modal-overlay" onClick={() => setCheckoutOpen(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Checkout: Healthy360 Plus</h2>
              <button type="button" className="btn-outline" style={{ padding: '0.25rem 0.6rem' }} onClick={() => setCheckoutOpen(false)}>✕</button>
            </div>

            {/* Order Summary Box */}
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '1rem', border: '1px solid #e5e7eb', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Healthy360 Plus ({billingCycle === 'annual' ? 'Annual Plan' : 'Monthly Plan'})</span>
                <span style={{ fontWeight: 600 }}>SGD ${currentPrice.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                <span>Billed {billingCycle === 'annual' ? 'yearly (365 days)' : 'monthly (30 days)'}</span>
                <span>GST (included)</span>
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <span>Total Due Now</span>
                <span style={{ color: '#059669' }}>SGD ${currentPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Select Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <button
                  type="button"
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: paymentMethod === 'card' ? '2px solid #10b981' : '1px solid #d1d5db',
                    background: paymentMethod === 'card' ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  onClick={() => setPaymentMethod('card')}
                >
                  <Icon name="credit-card" size={22} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Credit / Debit Card</span>
                </button>
                <button
                  type="button"
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: paymentMethod === 'paynow' ? '2px solid #10b981' : '1px solid #d1d5db',
                    background: paymentMethod === 'paynow' ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                  onClick={() => setPaymentMethod('paynow')}
                >
                  <Icon name="activity" size={22} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>PayNow / 1-Click</span>
                </button>
              </div>
            </div>

            {/* Mock Card Form */}
            {paymentMethod === 'card' ? (
              <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="card-name" style={{ fontSize: '0.85rem' }}>Name on Card</label>
                  <input id="card-name" type="text" required value={cardName} onChange={(e) => setCardName(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="card-num" style={{ fontSize: '0.85rem' }}>Card Number</label>
                  <input id="card-num" type="text" required value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="card-exp" style={{ fontSize: '0.85rem' }}>Expiry (MM/YY)</label>
                    <input id="card-exp" type="text" required value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="card-cvc" style={{ fontSize: '0.85rem' }}>CVC / CVV</label>
                    <input id="card-cvc" type="text" required value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} />
                  </div>
                </div>

                <div style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Icon name="shield" size={16} /> Non-clinical simulated transaction. No real card charge will occur.
                </div>

                <button type="submit" className="submit-btn" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }} disabled={busy}>
                  {busy ? 'Processing Payment...' : `Confirm & Pay SGD $${currentPrice.toFixed(2)}`}
                </button>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ width: '120px', height: '120px', border: '2px dashed #9ca3af', margin: '0 auto 1rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>QR Code (Demo)</span>
                </div>
                <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Scan with your bank app or tap below to approve the demo payment.
                </p>
                <button type="button" className="submit-btn" style={{ width: '100%', padding: '0.75rem' }} disabled={busy} onClick={handleCheckoutSubmit}>
                  {busy ? 'Processing...' : `Approve & Pay SGD $${currentPrice.toFixed(2)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CANCEL CONFIRMATION MODAL */}
      {cancelConfirmOpen && (
        <div className="modal-overlay" onClick={() => setCancelConfirmOpen(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cancel Subscription Renewal?</h3>
            <p className="sub-text">
              If you cancel renewal, you will retain full access to Healthy360 Plus tools until{' '}
              <strong>{new Date(data?.subscription?.accessUntil).toLocaleDateString()}</strong>. After that date, your account will gently revert to the Core Free Tier.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn-outline" onClick={() => setCancelConfirmOpen(false)}>
                Keep Plus
              </button>
              <button type="button" className="submit-btn" style={{ background: '#dc2626', borderColor: '#dc2626' }} disabled={busy} onClick={handleCancel}>
                {busy ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT RECEIPTS & INVOICES */}
      {data?.receipts && data.receipts.length > 0 && (
        <section className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Payment Receipts & Invoices</h3>
          <p className="sub-text" style={{ marginBottom: '1rem' }}>Records of completed subscription payments.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.receipts.map((rec) => (
              <div
                key={rec.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: '#f9fafb',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div>
                  <strong>{rec.receipt_no}</strong>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    {rec.purchased_at ? new Date(rec.purchased_at).toLocaleDateString() : 'Completed'} · Healthy360 Plus Membership
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>
                    {rec.currency} ${(rec.amount_cents / 100).toFixed(2)}
                  </span>
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>PAID</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
