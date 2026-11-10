import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function RegisterPage() {
  const { register } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', consent: false });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    register(form);
    navigate('/onboarding');
  };

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="card-header">
          <h2>Create your account</h2>
          <span className="sub-text">Takes under a minute</span>
        </div>
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
            <input id="password" name="password" type="password" minLength={8} required value={form.password} onChange={handleChange} />
          </div>
          <label className="consent">
            <input type="checkbox" name="consent" required checked={form.consent} onChange={handleChange} />
            <span>I consent to Healthy360 collecting and processing my lifestyle data under the PDPA. I understand this is non-clinical guidance.</span>
          </label>
          <button type="submit" className="submit-btn">Create account</button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Log in</Link></p>
      </section>
    </main>
  );
}