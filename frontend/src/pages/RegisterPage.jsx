import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function RegisterPage() {
  const { register, loading } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', consent: false });
  const [error, setError] = useState(null);

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
      <section className="card auth-card">
        <div className="card-header">
          <h2>Create your account</h2>
          <span className="sub-text">Takes under a minute</span>
        </div>
        {error && <div className="alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required value={form.name} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength={6} required value={form.password} onChange={handleChange} />
            <span className="hint-text">Minimum 6 characters</span>
          </div>
          <label className="consent">
            <input type="checkbox" name="consent" required checked={form.consent} onChange={handleChange} />
            <span>I consent to Healthy360 collecting and processing my lifestyle data under the PDPA. I understand this is non-clinical guidance.</span>
          </label>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Log in</Link></p>
      </section>
    </main>
  );
}