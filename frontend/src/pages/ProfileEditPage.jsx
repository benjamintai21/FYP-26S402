import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getProfile, updateProfile } from '../api';

export default function ProfileEditPage() {
  const { user, refreshUser } = useApp();
  const [displayName, setDisplayName] = useState(user?.profile?.display_name || user?.name || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const result = await getProfile();
        setDisplayName(result.user?.display_name || result.user?.name || '');
      } catch (err) {
        setError(err.message);
      }
    };
    loadProfile();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await updateProfile({ displayName });
      setMessage('Profile updated');
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>Edit profile</h1>
        <p>Update your display name.</p>
      </header>
      {message && <p role="status">{message}</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      <section className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" type="text" maxLength={100} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <button className="submit-btn" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>
    </main>
  );
}