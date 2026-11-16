import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

export default function RegisterPage() {
  const { register, loading } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', consent: false });
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
      await register(form);
      navigate('/onboarding');
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
          <span className="auth-eyebrow">A FRESH START</span>
          <h1>Build healthier habits</h1>
          <p>Create your account. Your first check-in is just a moment away.</p>
        </div>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
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
            <span>I consent to Healthy360 collecting and processing my lifestyle data under the PDPA. I understand this is non-clinical guidance.</span>
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