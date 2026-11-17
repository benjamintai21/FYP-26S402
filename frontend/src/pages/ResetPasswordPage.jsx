import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { confirmPasswordReset } from '../api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const tokenParam = searchParams.get('token');
    if (emailParam) setEmail(emailParam);
    if (tokenParam) setToken(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await confirmPasswordReset(email, token, password);
      setMessage(result.message);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>Reset password</h1>
        <p>Enter the reset token sent to your email.</p>
      </header>
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <section className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reset-email">Account email</label>
            <input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!searchParams.get('email')} />
          </div>
          <div className="form-group">
            <label htmlFor="reset-token">Reset token</label>
            <input id="reset-token" required value={token} onChange={(e) => setToken(e.target.value)} readOnly={!!searchParams.get('token')} />
          </div>
          <div className="form-group">
            <label htmlFor="reset-password">New password</label>
            <input id="reset-password" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="submit-btn" type="submit" disabled={busy}>
            {busy ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      </section>
      <p className="sub-text">
        <Link to="/login">Back to login</Link>
      </p>
    </main>
  );
}