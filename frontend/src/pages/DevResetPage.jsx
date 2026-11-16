import { useState } from 'react';
import { requestSimulatedReset, confirmSimulatedReset } from '../api';

export default function DevResetPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const result = await requestSimulatedReset(email);
      setToken(result.token);
      setMessage(result.message);
    } catch (err) { setError(err.message); }
  };
  const confirm = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const result = await confirmSimulatedReset(email, token, password);
      setToken('');
      setPassword('');
      setMessage(result.message);
    } catch (err) { setError(err.message); }
  };
  return (
    <main className="dashboard-container narrow">
      <header className="page-header"><h1>Development password reset</h1><p>Simulation only. No email is sent. This feature is disabled by default.</p></header>
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <section className="card">
        <form onSubmit={request}>
          <div className="form-group"><label htmlFor="reset-email">Business email</label><input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="submit-btn" type="submit">Generate simulated token</button>
        </form>
        {token && <form onSubmit={confirm}>
          <div className="form-group"><label htmlFor="reset-token">Development token</label><input id="reset-token" value={token} onChange={(e) => setToken(e.target.value)} required /></div>
          <div className="form-group"><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button className="submit-btn" type="submit">Reset password</button>
        </form>}
      </section>
    </main>
  );
}
