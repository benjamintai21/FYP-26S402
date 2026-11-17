import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { homeForRole } from '../roles';

export default function LogInPage() {
  const { login, loading } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', profile: 'member' });
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await login(form);
      navigate(homeForRole(result.user.role), { replace: true });
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
          <span className="auth-eyebrow">YOUR WELLNESS, IN FOCUS</span>
          <h1>Welcome back</h1>
          <p>Sign in to pick up where you left off.</p>
        </div>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="profile">Sign in as</label>
            <select id="profile" name="profile" value={form.profile} onChange={handleChange}>
              <option value="member">Member (registered or premium)</option>
              <option value="business">Business user</option>
            </select>
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
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={form.password} onChange={handleChange} />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} />
              </button>
            </div>
          </div>
          <button type="submit" className="submit-btn auth-submit" disabled={loading}>
            {loading ? 'Signing in...' : <>Continue <Icon name="arrow" size={19} /></>}
          </button>
        </form>
        <div className="auth-trust"><Icon name="lock" size={15} /> Your health data stays private</div>
        <p className="auth-switch">New to Healthy360? <Link to="/register">Create an account</Link></p>
        <p className="auth-switch"><Link to="/forgot-password">Forgot password?</Link></p>
        <p className="auth-switch"><Link to="/dev-reset">Development password reset</Link></p>
      </section>
    </main>
  );
}