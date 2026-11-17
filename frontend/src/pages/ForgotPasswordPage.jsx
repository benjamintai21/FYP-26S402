import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>Forgot password</h1>
        <p>Enter your email to receive a password reset token.</p>
      </header>
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <section className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reset-email">Account email</label>
            <input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="submit-btn" type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send reset token'}
          </button>
        </form>
      </section>
      <p className="sub-text">
        <Link to="/login">Back to login</Link>
      </p>
    </main>
  );
}