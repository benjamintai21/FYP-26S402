import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { changePassword } from '../api';

export default function ProfilePage() {
  const { user } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const result = await changePassword(currentPassword, newPassword);
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="dashboard-container narrow">
      <header className="page-header"><h1>Your profile</h1></header>
      <section className="card">
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Account:</strong> {user.role}</p>
        {user.profile?.display_name && <p><strong>Display name:</strong> {user.profile.display_name}</p>}
        {user.role !== 'business' && <Link to="/onboarding">Update lifestyle baseline</Link>}
        {user.role !== 'business' && <p><Link to="/subscription">View subscription</Link></p>}
        {user.role === 'premium' && <p><Link to="/premium">Premium tools</Link></p>}
        <p><Link to="/profile/edit">Edit profile</Link></p>
      </section>
      <section className="card">
        <h2>Change password</h2>
        {error && <p className="alert-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <form onSubmit={submit}>
          <div className="form-group"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="newPassword">New password</label><input id="newPassword" type="password" autoComplete="new-password" minLength={6} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <button className="submit-btn" type="submit">Change password</button>
        </form>
      </section>
    </main>
  );
}
