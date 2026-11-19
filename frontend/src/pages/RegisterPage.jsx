import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { updateSubscription, saveOnboarding } from '../api';
import Icon from '../components/Icon';
import { homeForRole } from '../roles';

export default function RegisterPage() {
  const { register, refreshUser, loading } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const intendedPlan = searchParams.get('plan');
  const intendedCycle = searchParams.get('cycle') || 'monthly';

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'registered', consent: false });
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    try {
      const result = await register(form);
      if (intendedPlan === 'premium' && result.user.role === 'registered') {
        try {
          await updateSubscription('start', intendedCycle);
          await refreshUser();
        } catch {
          // If subscription fails, they remain registered and can retry in subscription page
        }
      }

      // If user came through the pre-signup questionnaire, auto-commit their baseline
      const pendingBaselineStr = localStorage.getItem('h360_pending_baseline');
      if (pendingBaselineStr && result.user.role === 'registered') {
        try {
          const pendingData = JSON.parse(pendingBaselineStr);
          await saveOnboarding(pendingData);
          await refreshUser();
          localStorage.removeItem('h360_pending_baseline');
          navigate('/dashboard', { replace: true });
          return;
        } catch {
          // Fall through to onboarding
        }
      }

      navigate(result.user.role === 'registered' ? '/onboarding' : homeForRole(result.user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <Link to="/" className="auth-brand" aria-label="Healthy360 home">
          <span className="auth-brand-mark"><Icon name="activity" size={23} /></span>
          <span>Healthy<span>360</span></span>
        </Link>
        <div className="auth-heading">
          <h1>Create your account</h1>
          <p>Choose a member or business account to get started.</p>
        </div>
        {intendedPlan === 'premium' && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            🌟 <strong>Healthy360 Plus ({intendedCycle === 'annual' ? 'Annual Plan · Save 20%' : 'Monthly Plan'}) Selected</strong>: Create your account below to activate your premium access and continue directly to lifestyle onboarding.
          </div>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="role">Account type</label>
            <select id="role" name="role" value={form.role} onChange={handleChange}>
              <option value="registered">Member</option>
              <option value="business">Business user</option>
            </select>
          </div>
          <div className="form-group auth-field">
            <label htmlFor="name">Your name</label>
            <div className="auth-input-wrap">
              <Icon name="user" size={19} />
              <input id="name" name="name" autoComplete="name" placeholder="How should we greet you?" required value={form.name} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group auth-field">
            <label htmlFor="email">Email address</label>
            <div className="auth-input-wrap">
              <Icon name="mail" size={19} />
              <input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required value={form.email} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group auth-field">
            <label htmlFor="password">Password</label>
            <div className="auth-input-wrap">
              <Icon name="lock" size={19} />
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 6 characters" minLength={6} required value={form.password} onChange={handleChange} />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} />
              </button>
            </div>
            <span className="hint-text">Minimum 6 characters</span>
          </div>
          <label className="consent">
            <input type="checkbox" name="consent" required checked={form.consent} onChange={handleChange} />
            <span>{form.role === 'registered' ? (
              <>I consent to Healthy360 collecting and processing my lifestyle data under the <Link to="/privacy" target="_blank" rel="noopener noreferrer">PDPA Terms & Privacy Policy</Link>. I understand this is non-clinical guidance.</>
            ) : (
              <>I consent to Healthy360 processing my account information under the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link> to provide business access.</>
            )}</span>
          </label>
          <button type="submit" className="submit-btn auth-submit" disabled={loading}>
            {loading ? 'Creating your account...' : <>Create account <Icon name="arrow" size={19} /></>}
          </button>
        </form>
        <div className="auth-trust"><Icon name="lock" size={15} /> Private by design. Non-clinical guidance.</div>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}