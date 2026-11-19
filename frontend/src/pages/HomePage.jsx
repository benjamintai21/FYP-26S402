import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { homeForRole } from '../roles';
import { getPublicFeedback, getPublicPlans, updateSubscription } from '../api';
import Icon from '../components/Icon';

const FEATURES = [
  {
    title: 'Personalized Pacing',
    text: 'Daily activity and recovery guidance from your sleep, heart rate, steps and fatigue.',
    icon: 'activity'
  },
  {
    title: 'Explainable by Design',
    text: 'SHAP bars show exactly which metrics drove today\'s recommendation.',
    icon: 'chart'
  },
  {
    title: 'What-If Recourse',
    text: 'Test habit changes and see what it takes to unlock a higher-intensity plan.',
    icon: 'compass'
  },
  {
    title: 'Fair and Private',
    text: 'Fairness-audited models, PDPA-aligned data handling, non-clinical scope.',
    icon: 'shield'
  },
];

const TRUST_SIGNALS = [
  { label: 'Models audited with', value: 'fairlearn', desc: 'Demographic parity & disparate impact checks' },
  { label: 'Data governed by', value: 'PDPA', desc: 'Singapore privacy law compliance' },
  { label: 'Explainability via', value: 'SHAP', desc: 'TreeSHAP attributions per recommendation' },
  { label: 'Latency target', value: '< 2s', desc: 'End-to-end inference + XAI pipeline' },
];

const HOW_IT_WORKS = [
  { step: 1, title: 'Log your day', text: 'Sleep, heart rate, steps, fatigue — 30 seconds each morning' },
  { step: 2, title: 'Get a recommendation', text: 'Activity tier with plain-English rationale from XGBoost + SHAP' },
  { step: 3, title: 'Explore alternatives', text: 'What-If simulates habit changes to unlock higher tiers' },
  { step: 4, title: 'Track trends', text: '7- and 30-day charts show adherence and progress over time' },
];

export default function HomePage() {
  const { user, register, login, refreshUser } = useApp();
  const navigate = useNavigate();

  const [feedback, setFeedback] = useState([]);
  const [feedbackError, setFeedbackError] = useState('');
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('annual');

  // Checkout modal states
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authMode, setAuthMode] = useState('register'); // 'register' or 'login'
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConsent, setRegConsent] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicFeedback().then((result) => { if (active) setFeedback(result.feedback); })
      .catch((err) => { if (active) setFeedbackError(err.message); });
    getPublicPlans().then((result) => { if (active) setPlans(result.plans || []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const destination = user ? homeForRole(user.role) : '/onboarding';
  const ctaLabel = user ? 'Go to your account' : 'Build Your Personalized Plan';

  const premiumPlan = plans.find((p) => p.tierCode === 'premium');
  const priceMonthly = premiumPlan?.priceMonthly || 9.90;
  const priceAnnual = premiumPlan?.priceAnnual || 95.00;
  const activePrice = billingCycle === 'annual' ? priceAnnual : priceMonthly;

  const handleOpenCheckout = () => {
    setCheckoutError('');
    setCheckoutOpen(true);
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setCheckoutError('');
    setBusy(true);

    try {
      if (!user) {
        if (authMode === 'register') {
          if (!regName.trim() || !regEmail.trim() || !regPassword) {
            throw new Error('Please fill in your name, email, and password.');
          }
          if (!regConsent) {
            throw new Error('You must accept the PDPA data processing consent to proceed.');
          }
          await register({
            name: regName.trim(),
            email: regEmail.trim(),
            password: regPassword,
            role: 'registered',
            consent: true,
          });
        } else {
          if (!loginEmail.trim() || !loginPassword) {
            throw new Error('Please enter your email and password.');
          }
          await login({
            email: loginEmail.trim(),
            password: loginPassword,
          });
        }
      }

      // User is now authenticated; activate the Plus subscription
      await updateSubscription('start', billingCycle);
      if (refreshUser) {
        await refreshUser();
      }

      setCheckoutOpen(false);
      setShowSuccess(true);
    } catch (err) {
      setCheckoutError(err.message || 'Payment processing failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-container">
      {/* SUCCESS CELEBRATION MODAL */}
      {showSuccess && (
        <div className="modal-overlay" onClick={() => setShowSuccess(false)}>
          <div className="modal" style={{ maxWidth: '480px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <Icon name="check" size={34} />
            </div>
            <h2 style={{ marginBottom: '0.5rem' }}>Welcome to Healthy360 Plus!</h2>
            <p className="sub-text" style={{ marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Your membership has been activated for <strong>SGD ${activePrice.toFixed(2)}</strong> ({billingCycle === 'annual' ? 'Annual Plan' : 'Monthly Plan'}). You now have full access to meal and workout generators, What-If simulation recourse, and the wellness library.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                className="submit-btn"
                onClick={() => {
                  setShowSuccess(false);
                  navigate('/onboarding');
                }}
              >
                Set Up Health Baseline
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setShowSuccess(false);
                  navigate('/premium');
                }}
              >
                Go to Plus Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT & SUBSCRIBE MODAL */}
      {checkoutOpen && (
        <div className="modal-overlay" onClick={() => !busy && setCheckoutOpen(false)}>
          <div className="modal" style={{ maxWidth: '540px', padding: '2rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <span className="role-badge role-premium" style={{ display: 'inline-block', marginBottom: '0.4rem' }}>
                  CHECKOUT
                </span>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Get Healthy360 Plus</h2>
                <p className="sub-text" style={{ margin: '0.25rem 0 0 0' }}>
                  Evidence-based AI health pacing, generators, and recourse.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '0.3rem 0.6rem', fontSize: '1rem', border: 'none' }}
                onClick={() => setCheckoutOpen(false)}
                disabled={busy}
              >
                ✕
              </button>
            </div>

            {checkoutError && (
              <div className="alert-error" role="alert" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                {checkoutError}
              </div>
            )}

            <form onSubmit={handleCheckoutSubmit}>
              {/* Billing Cycle Picker inside modal */}
              <div style={{ display: 'flex', background: '#f3f4f6', padding: '0.35rem', borderRadius: '10px', gap: '0.35rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: billingCycle === 'annual' ? '#ffffff' : 'transparent',
                    color: billingCycle === 'annual' ? '#111827' : '#6b7280',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: billingCycle === 'annual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontSize: '0.9rem',
                  }}
                  onClick={() => setBillingCycle('annual')}
                >
                  Annual (SGD ${priceAnnual.toFixed(2)}/yr) · <span style={{ color: '#059669', fontWeight: 700 }}>SAVE 20%</span>
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: billingCycle === 'monthly' ? '#ffffff' : 'transparent',
                    color: billingCycle === 'monthly' ? '#111827' : '#6b7280',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: billingCycle === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontSize: '0.9rem',
                  }}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly (SGD ${priceMonthly.toFixed(2)}/mo)
                </button>
              </div>

              {/* If not logged in: Account step */}
              {!user && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: authMode === 'register' ? '#10b981' : '#d1d5db',
                        background: authMode === 'register' ? '#ecfdf5' : '#ffffff',
                        color: authMode === 'register' ? '#065f46' : '#374151',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => setAuthMode('register')}
                    >
                      New Member (Create Account)
                    </button>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: authMode === 'login' ? '#10b981' : '#d1d5db',
                        background: authMode === 'login' ? '#ecfdf5' : '#ffffff',
                        color: authMode === 'login' ? '#065f46' : '#374151',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => setAuthMode('login')}
                    >
                      Already a Member? Sign In
                    </button>
                  </div>

                  {authMode === 'register' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Full Name</label>
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="e.g. Rachel Lim"
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email Address</label>
                        <input
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="name@example.sg"
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</label>
                        <input
                          type="password"
                          required
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.35rem', lineHeight: 1.4 }}>
                        <input
                          type="checkbox"
                          checked={regConsent}
                          onChange={(e) => setRegConsent(e.target.checked)}
                          required
                          style={{ marginTop: '0.15rem' }}
                        />
                        <span>
                          I agree to the <Link to="/privacy" target="_blank" style={{ textDecoration: 'underline' }}>PDPA Data Processing Policy</Link> and understand Healthy360 provides non-clinical lifestyle guidance.
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email Address</label>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="name@example.sg"
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</label>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter your password"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* If already logged in: Account badge */}
              {user && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Subscribing as</div>
                    <div style={{ fontWeight: 600 }}>{user.name || user.email} ({user.email})</div>
                  </div>
                  <span className={`role-badge role-${user.role}`}>
                    {user.role.toUpperCase()}
                  </span>
                </div>
              )}

              {/* Payment Method Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  Payment Method (Simulated Sandbox)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: paymentMethod === 'card' ? '#10b981' : '#d1d5db',
                      background: paymentMethod === 'card' ? '#ecfdf5' : '#ffffff',
                      color: paymentMethod === 'card' ? '#065f46' : '#374151',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.85rem',
                    }}
                    onClick={() => setPaymentMethod('card')}
                  >
                    <Icon name="credit-card" size={16} /> Credit / Debit Card
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: paymentMethod === 'paynow' ? '#10b981' : '#d1d5db',
                      background: paymentMethod === 'paynow' ? '#ecfdf5' : '#ffffff',
                      color: paymentMethod === 'paynow' ? '#065f46' : '#374151',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      fontSize: '0.85rem',
                    }}
                    onClick={() => setPaymentMethod('paynow')}
                  >
                    PayNow QR
                  </button>
                </div>

                {paymentMethod === 'card' ? (
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Card Number</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="•••• •••• •••• ••••"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>Expiry</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label style={{ fontSize: '0.8rem', color: '#6b7280' }}>CVC</label>
                        <input
                          type="text"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          placeholder="CVC"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', padding: '0.75rem', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <div style={{ width: '120px', height: '120px', background: '#111827', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', margin: '0 auto' }}>
                        PAYNOW QR (DEMO)
                      </div>
                    </div>
                    <p className="sub-text" style={{ fontSize: '0.8rem', margin: 0 }}>
                      UEN: 202612345A · Healthy360 SG. Click below to simulate instant payment confirmation.
                    </p>
                  </div>
                )}
              </div>

              {/* Order Summary & Submit Button */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                  <span>Healthy360 Plus ({billingCycle === 'annual' ? 'Annual' : 'Monthly'})</span>
                  <strong>SGD ${activePrice.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.85rem', color: '#059669' }}>
                  <span>Tax & Platform Fee</span>
                  <span>SGD $0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 'bold', borderTop: '1px dashed #d1d5db', paddingTop: '0.65rem' }}>
                  <span>Total Due Today</span>
                  <span>SGD ${activePrice.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', fontWeight: 600 }}
                disabled={busy}
              >
                {busy ? 'Processing Activation...' : `Confirm SGD $${activePrice.toFixed(2)} & Activate Plus`}
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                <span className="sub-text" style={{ fontSize: '0.75rem' }}>
                  14-day non-clinical satisfaction guarantee · Cancel renewal anytime in 1-click.
                </span>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="hero">
        <div className="hero-badge">Non-clinical lifestyle guidance · Not medical advice</div>
        <h1>Health guidance you can actually understand</h1>
        <p className="hero-sub">Healthy360 explains every recommendation, so you know why — not just what.</p>
        <div className="hero-actions">
          <Link to={destination} className="submit-btn hero-btn primary">{ctaLabel}</Link>
          {!user && <Link to="/login" className="btn-outline hero-btn">Log in</Link>}
          {!user && <Link to="/about" className="btn-outline hero-btn">Learn more</Link>}
        </div>
        <div className="hero-trust">
          <span className="trust-item">Fairlearn-audited</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">PDPA-compliant</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">SHAP explainability</span>
          <span className="trust-divider" aria-hidden="true">·</span>
          <span className="trust-item">{'<'} 2s latency</span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-it-works">
        <div className="section-header">
          <h2>How it works</h2>
          <p className="sub-text">Four steps from daily check-in to actionable insight</p>
        </div>
        <div className="steps-grid">
          {HOW_IT_WORKS.map((s) => (
            <article className="step-card card" key={s.step}>
              <div className="step-number">{s.step}</div>
              <h3>{s.title}</h3>
              <p className="sub-text">{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="features-section">
        <div className="section-header">
          <h2>Built for clarity and control</h2>
          <p className="sub-text">Every feature designed around explainability and user agency</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <section className="card feature-card" key={f.title}>
              <div className="feature-icon">
                <Icon name={f.icon} size={28} />
              </div>
              <h3>{f.title}</h3>
              <p className="sub-text">{f.text}</p>
            </section>
          ))}
        </div>
      </section>

      {/* TRUST SIGNALS */}
      <section className="trust-section">
        <div className="section-header">
          <h2>Trust signals</h2>
          <p className="sub-text">Technical safeguards built into every recommendation</p>
        </div>
        <div className="trust-grid">
          {TRUST_SIGNALS.map((t, i) => (
            <div className="trust-card card" key={i}>
              <div className="trust-label">{t.label}</div>
              <div className="trust-value">{t.value}</div>
              <p className="sub-text">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING & SUBSCRIPTION SECTION */}
      <section className="features-section" id="pricing">
        <div className="section-header">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            <Icon name="sparkles" size={14} /> Transparent & Flexible Plans
          </div>
          <h2>Subscription Plans & Pricing</h2>
          <p className="sub-text">Choose the right level of support for your lifestyle journey. Upgrade or cancel anytime.</p>

          {/* Billing Cycle Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0 0.5rem 0' }}>
            <div style={{ display: 'inline-flex', background: '#f3f4f6', padding: '0.35rem', borderRadius: '999px', border: '1px solid #e5e7eb' }}>
              <button
                type="button"
                style={{
                  padding: '0.45rem 1.15rem',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'monthly' ? '#ffffff' : 'transparent',
                  color: billingCycle === 'monthly' ? '#111827' : '#6b7280',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: billingCycle === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  fontSize: '0.9rem',
                }}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly (${priceMonthly.toFixed(2)}/mo)
              </button>
              <button
                type="button"
                style={{
                  padding: '0.45rem 1.15rem',
                  borderRadius: '999px',
                  border: 'none',
                  background: billingCycle === 'annual' ? '#ffffff' : 'transparent',
                  color: billingCycle === 'annual' ? '#111827' : '#6b7280',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: billingCycle === 'annual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                onClick={() => setBillingCycle('annual')}
              >
                <span>Annual (${priceAnnual.toFixed(2)}/yr)</span>
                <span style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.75rem', padding: '0.1rem 0.45rem', borderRadius: '6px', fontWeight: 700 }}>
                  SAVE 20%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="responsive-card-grid" style={{ maxWidth: '960px', margin: '0 auto' }}>
          {/* Core Plan */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #e5e7eb' }}>
            <div>
              <span className="role-badge role-registered" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
                FREE CORE
              </span>
              <h3 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>Core Plan</h3>
              <p className="sub-text">Essential daily lifestyle guidance and explainability.</p>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', margin: '1rem 0' }}>
                $0 <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280' }}>/ free forever</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Daily XGBoost Pacing Recommendations
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> SHAP Attributions & Plain-English Rationales
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Biometric Logging & Wearable Device Sync
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> 7-Day & 30-Day Trend Visualizations
                </li>
              </ul>
            </div>
            <div style={{ marginTop: '1.25rem' }}>
              <Link to={user ? homeForRole(user.role) : '/register'} className="btn-outline" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
                {user ? 'Included in Your Account' : 'Get Started Free'}
              </Link>
            </div>
          </div>

          {/* Plus Plan */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '2px solid #10b981', position: 'relative', background: '#fafdfb' }}>
            <div style={{ position: 'absolute', top: '-11px', right: '20px', background: '#10b981', color: '#ffffff', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.65rem', borderRadius: '999px', letterSpacing: '0.05em' }}>
              RECOMMENDED
            </div>
            <div>
              <span className="role-badge role-premium" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
                HEALTHY360 PLUS
              </span>
              <h3 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>Plus Membership</h3>
              <p className="sub-text">Everything in Core, plus tailored plans and deeper insights.</p>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', margin: '1rem 0' }}>
                SGD ${activePrice.toFixed(2)}
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280' }}>
                  {billingCycle === 'annual' ? ' / year (approx $7.92/mo)' : ' / month'}
                </span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Structured Workout Generators (Walking, Yoga, Cycling)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Personalized Meal Generators (Vegetarian & Vegan)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Multi-Scenario What-If Recourse Explorer
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#10b981' }}><Icon name="check" size={16} /></span> Expert-Reviewed Wellness & Recovery Library
                </li>
              </ul>
            </div>
            <div style={{ marginTop: '1.25rem' }}>
              {user?.role === 'premium' ? (
                <Link to="/subscription" className="submit-btn" style={{ display: 'block', textAlign: 'center', width: '100%', background: '#059669' }}>
                  Your Active Plan · Manage
                </Link>
              ) : (
                <button
                  type="button"
                  className="submit-btn"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', fontWeight: 600 }}
                  onClick={handleOpenCheckout}
                >
                  {user ? `Upgrade to Plus · SGD $${activePrice.toFixed(2)}` : `Get Plus · SGD $${activePrice.toFixed(2)}`}
                </button>
              )}
              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                {!user ? (
                  <Link to={`/register?plan=premium&cycle=${billingCycle}`} className="sub-text" style={{ fontSize: '0.8rem', textDecoration: 'underline' }}>
                    Or register on dedicated signup page
                  </Link>
                ) : (
                  <span className="sub-text" style={{ fontSize: '0.8rem' }}>
                    Instant simulated activation · Cancel anytime
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="card cta-section">
        <h2>Ready to understand your health data?</h2>
        <p className="sub-text">Join hundreds of users getting explainable, non-clinical lifestyle guidance daily.</p>
        <div className="hero-actions">
          <Link to={destination} className="submit-btn hero-btn primary">{ctaLabel}</Link>
          {!user && <Link to="/login" className="btn-outline hero-btn">Log in</Link>}
        </div>
      </section>

      {/* PUBLIC FEEDBACK */}
      <section className="card">
        <h2>Public feedback</h2>
        <p className="sub-text">Feedback is shared by other real users</p>
        {feedbackError && <p className="alert-error" role="alert">Could not load feedback: {feedbackError}</p>}
        {!feedbackError && feedback.length === 0 && <p className="sub-text">No public feedback yet.</p>}
        {feedback.map((item) => <div className="form-group" key={item.id}>
          <p>{item.comment || 'No written comment.'}</p>
          <span className="sub-text">{item.clarity ? `Clarity: ${item.clarity}/5` : ''} {item.trust ? `Trust: ${item.trust}/5` : ''}</span>
        </div>)}
      </section>
    </main>
  );
}
