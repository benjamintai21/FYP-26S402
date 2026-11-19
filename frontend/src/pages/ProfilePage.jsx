import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  changePassword,
  getGoals,
  saveGoal,
  deleteGoal,
  getPreferences,
  savePreferences,
  getSubscription,
  updateSubscription,
} from '../api';
import Icon from '../components/Icon';

const EMPTY_GOAL = {
  title: '',
  category: 'steps',
  target: '',
  current: '0',
  unit: 'steps',
  deadline: '',
  status: 'active',
};

const splitItems = (text) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function ProfilePage() {
  const { user, refreshUser, logout } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'profile');

  // Keep URL search params in sync with active tab
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  useEffect(() => {
    if (tabParam && ['profile', 'goals', 'membership', 'security'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const isBusiness = user?.role === 'business';
  const isMember = user && ['registered', 'premium'].includes(user.role);

  // --- PASSWORD STATE ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // --- GOALS & PREFERENCES STATE ---
  const [goals, setGoals] = useState([]);
  const [goal, setGoal] = useState(EMPTY_GOAL);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [preferences, setPreferences] = useState({ workout: '', dietary: '', availableMinutes: 45 });
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsMessage, setGoalsMessage] = useState('');
  const [goalsError, setGoalsError] = useState('');

  // --- MEMBERSHIP STATE ---
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subMessage, setSubMessage] = useState('');
  const [subError, setSubError] = useState('');

  // Load goals & preferences on mount or when switching to goals tab
  useEffect(() => {
    if (isMember && activeTab === 'goals') {
      let active = true;
      setGoalsLoading(true);
      Promise.all([getGoals(), getPreferences()])
        .then(([goalRes, prefRes]) => {
          if (!active) return;
          setGoals(goalRes.goals || []);
          setPreferences({
            workout: (prefRes.workout || []).join(', '),
            dietary: (prefRes.dietary || []).join(', '),
            availableMinutes: prefRes.availableMinutes ?? 45,
          });
        })
        .catch((err) => {
          if (active) setGoalsError(err.message);
        })
        .finally(() => {
          if (active) setGoalsLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [isMember, activeTab]);

  // Load subscription details when switching to membership tab
  useEffect(() => {
    if (isMember && activeTab === 'membership') {
      let active = true;
      setSubLoading(true);
      getSubscription()
        .then((res) => {
          if (active) setSubData(res);
        })
        .catch((err) => {
          if (active) setSubError(err.message);
        })
        .finally(() => {
          if (active) setSubLoading(false);
        });
      return () => {
        active = false;
      };
    }
  }, [isMember, activeTab]);

  // --- HANDLERS ---
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    setChangingPassword(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      setPasswordMessage(res.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleGoalSubmit = async (e) => {
    e.preventDefault();
    setGoalsError('');
    setGoalsMessage('');
    try {
      await saveGoal(
        {
          ...goal,
          target: Number(goal.target),
          current: Number(goal.current),
        },
        editingGoalId
      );
      const res = await getGoals();
      setGoals(res.goals || []);
      setGoal(EMPTY_GOAL);
      setEditingGoalId(null);
      setGoalsMessage('Goal saved successfully.');
    } catch (err) {
      setGoalsError(err.message || 'Failed to save goal.');
    }
  };

  const handleGoalDelete = async (id) => {
    if (!window.confirm('Delete this goal?')) return;
    setGoalsError('');
    try {
      await deleteGoal(id);
      setGoals((prev) => prev.filter((item) => item.id !== id));
      if (editingGoalId === id) {
        setGoal(EMPTY_GOAL);
        setEditingGoalId(null);
      }
      setGoalsMessage('Goal deleted.');
    } catch (err) {
      setGoalsError(err.message || 'Failed to delete goal.');
    }
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    setGoalsError('');
    setGoalsMessage('');
    try {
      await savePreferences({
        workout: splitItems(preferences.workout),
        dietary: splitItems(preferences.dietary),
        availableMinutes: Number(preferences.availableMinutes),
      });
      setGoalsMessage('Preferences saved successfully.');
    } catch (err) {
      setGoalsError(err.message || 'Failed to save preferences.');
    }
  };

  const handleSubAction = async (action) => {
    setSubError('');
    setSubMessage('');
    try {
      const res = await updateSubscription(action);
      setSubData(res);
      if (refreshUser) await refreshUser();
      setSubMessage(action === 'cancel' ? 'Subscription cancelled.' : 'Subscription updated successfully.');
    } catch (err) {
      setSubError(err.message || 'Failed to update subscription.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Local sign-out fallback
    }
    navigate('/');
  };

  const isSubscribed =
    subData?.subscription && (subData.subscription.status === 'active' || subData.subscription.status === 'cancelled');

  return (
    <main className="dashboard-container narrow">
      {/* Header Hub Identity */}
      <header className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#10b981',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 700,
            }}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{user?.displayName || user?.name}</h1>
              <span className={`role-badge role-${user?.role}`} style={{ fontSize: '0.72rem' }}>
                {user?.role?.toUpperCase()}
              </span>
            </div>
            <p className="sub-text" style={{ margin: '0.15rem 0 0 0', fontSize: '0.85rem' }}>
              {user?.email}
            </p>
          </div>
        </div>
      </header>

      {/* STRAVA-STYLE TAB NAVIGATION (YOU HUB) */}
      <nav
        aria-label="Profile navigation"
        className="scroll-tabs"
        style={{
          borderBottom: '2px solid #e5e7eb',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'profile' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'profile' ? '#065f46' : '#6b7280',
            fontWeight: activeTab === 'profile' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap',
            marginBottom: '-2px',
          }}
          onClick={() => handleTabChange('profile')}
        >
          <Icon name="user" size={16} /> Profile & Baselines
        </button>

        {isMember && (
          <button
            type="button"
            style={{
              padding: '0.65rem 1rem',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'goals' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'goals' ? '#065f46' : '#6b7280',
              fontWeight: activeTab === 'goals' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
              marginBottom: '-2px',
            }}
            onClick={() => handleTabChange('goals')}
          >
            <Icon name="target" size={16} /> Goals & Preferences
          </button>
        )}

        {isMember && (
          <button
            type="button"
            style={{
              padding: '0.65rem 1rem',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'membership' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'membership' ? '#065f46' : '#6b7280',
              fontWeight: activeTab === 'membership' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
              marginBottom: '-2px',
            }}
            onClick={() => handleTabChange('membership')}
          >
            <Icon name="shield" size={16} /> Membership & Plus
          </button>
        )}

        <button
          type="button"
          style={{
            padding: '0.65rem 1rem',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'security' ? '3px solid #10b981' : '3px solid transparent',
            color: activeTab === 'security' ? '#065f46' : '#6b7280',
            fontWeight: activeTab === 'security' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap',
            marginBottom: '-2px',
          }}
          onClick={() => handleTabChange('security')}
        >
          <Icon name="lock" size={16} /> Security & Privacy
        </button>
      </nav>

      {/* ============================================================
          TAB 1: PROFILE & BASELINES
          ============================================================ */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Identity & Display Card */}
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem 0' }}>Community & Account Identity</h2>
                <p className="sub-text" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Your public handle on the marketplace, events, and community feeds
                </p>
              </div>
              <Link to="/profile/edit" className="submit-btn" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}>
                Edit Profile
              </Link>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                borderTop: '1px solid #e5e7eb',
                paddingTop: '1rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  Community Display Name
                </span>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '0.2rem' }}>
                  {user?.displayName || user?.profile?.display_name || user?.name}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  Full Legal Name
                </span>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '0.2rem' }}>{user?.name}</div>
              </div>

              {isBusiness && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Business Entity Name
                  </span>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '0.2rem' }}>
                    {user?.businessName || user?.name}
                  </div>
                </div>
              )}

              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  Account Status
                </span>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '1rem',
                    marginTop: '0.2rem',
                    color: user?.is_active ? '#059669' : '#dc2626',
                  }}
                >
                  {user?.is_active ? 'Active · Verified' : 'Suspended'}
                </div>
              </div>
            </div>
          </section>

          {/* Biometric & Demographic Baselines */}
          {!isBusiness && (
            <section className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Active Machine Learning Baselines</h2>
                <Link
                  to="/profile/edit"
                  style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Update Baselines
                </Link>
              </div>
              <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                The XGBoost classifier and TreeSHAP explainability engine calibrate your daily pacing recommendations against these targets.
              </p>

              <div className="stats-2col-grid">
                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Age Cohort
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {user?.ageBracket || '30-44'}
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Activity Tier
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem', textTransform: 'capitalize' }}>
                    {user?.activityLevel || 'Moderate'}
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Target Sleep
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {user?.baseline?.sleep || 7.5} hrs
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Resting Heart Rate
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {user?.baseline?.heartRate || 70} bpm
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Daily Step Baseline
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {Number(user?.baseline?.steps || 8000).toLocaleString()}
                  </div>
                </div>

                <div style={{ background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                    Typical Fatigue
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {user?.baseline?.fatigue || 4.0} / 10
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link to="/onboarding" className="btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                  Retake Health Questionnaire
                </Link>
                <Link to="/explorer" className="btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                  Explore What-If Recourse
                </Link>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============================================================
          TAB 2: GOALS & PREFERENCES (INTEGRATED)
          ============================================================ */}
      {activeTab === 'goals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {goalsError && <div className="alert-error" role="alert">{goalsError}</div>}
          {goalsMessage && (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}>
              {goalsMessage}
            </div>
          )}

          {/* Active Goals List */}
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem 0' }}>Active Goals</h2>
                <p className="sub-text" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Your targets are factored into the adaptive pacing model
                </p>
              </div>
            </div>

            {goalsLoading ? (
              <p className="sub-text">Loading goals...</p>
            ) : goals.length === 0 ? (
              <p className="sub-text" style={{ padding: '1rem 0' }}>
                No goals created yet. Use the form below to set your first goal.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {goals.map((item) => {
                  const progressPct = Math.min(100, Math.round((Number(item.current) / Number(item.target || 1)) * 100));
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '0.85rem 1rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{item.title}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {item.category} · {item.status}
                            {item.deadline ? ` · Due ${item.deadline}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => {
                              setGoal(item);
                              setEditingGoalId(item.id);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleGoalDelete(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1, background: '#f1f5f9', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${progressPct}%`,
                              height: '100%',
                              background: progressPct >= 100 ? '#10b981' : '#3b82f6',
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', minWidth: '85px', textAlign: 'right' }}>
                          {item.current} / {item.target} {item.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Create or Edit Goal Form */}
          <section className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>
              {editingGoalId ? 'Edit Goal' : 'Create a New Goal'}
            </h2>
            <form onSubmit={handleGoalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="goal-title" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Title</label>
                <input
                  id="goal-title"
                  name="title"
                  maxLength={150}
                  value={goal.title}
                  onChange={(e) => setGoal({ ...goal, title: e.target.value })}
                  placeholder="e.g. 10,000 steps daily or 8 hours sleep"
                  required
                />
              </div>

              <div className="stats-2col-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-category" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Category</label>
                  <select
                    id="goal-category"
                    name="category"
                    value={goal.category}
                    onChange={(e) => setGoal({ ...goal, category: e.target.value })}
                  >
                    <option value="steps">Steps</option>
                    <option value="sleep">Sleep</option>
                    <option value="cardio_minutes">Activity minutes</option>
                    <option value="recovery_days">Recovery days</option>
                    <option value="general_fitness">General fitness</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-unit" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Unit</label>
                  <input
                    id="goal-unit"
                    name="unit"
                    maxLength={30}
                    value={goal.unit}
                    onChange={(e) => setGoal({ ...goal, unit: e.target.value })}
                    placeholder="steps, hrs, min"
                    required
                  />
                </div>
              </div>

              <div className="stats-2col-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-target" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Target</label>
                  <input
                    id="goal-target"
                    type="number"
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    value={goal.target}
                    onChange={(e) => setGoal({ ...goal, target: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-current" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Current Progress</label>
                  <input
                    id="goal-current"
                    type="number"
                    min="0"
                    max="999999.99"
                    step="0.01"
                    value={goal.current}
                    onChange={(e) => setGoal({ ...goal, current: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="stats-2col-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-deadline" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Deadline (optional)</label>
                  <input
                    id="goal-deadline"
                    type="date"
                    value={goal.deadline || ''}
                    onChange={(e) => setGoal({ ...goal, deadline: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="goal-status" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status</label>
                  <select
                    id="goal-status"
                    value={goal.status}
                    onChange={(e) => setGoal({ ...goal, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="submit-btn" type="submit" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
                  {editingGoalId ? 'Save Changes' : 'Create Goal'}
                </button>
                {editingGoalId && (
                  <button
                    className="btn-outline"
                    type="button"
                    style={{ padding: '0.55rem 1rem', fontSize: '0.88rem' }}
                    onClick={() => {
                      setGoal(EMPTY_GOAL);
                      setEditingGoalId(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Lifestyle Preferences Form */}
          <section className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Workout & Dietary Preferences</h2>
            <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Configure your daily time availability and lifestyle restrictions for customized meal and workout plans.
            </p>

            <form onSubmit={handlePreferencesSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="minutes" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Available Minutes Per Day</label>
                <input
                  id="minutes"
                  type="number"
                  min="0"
                  max="1440"
                  value={preferences.availableMinutes}
                  onChange={(e) => setPreferences({ ...preferences, availableMinutes: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="workout-prefs" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Workout Preferences (comma-separated)
                </label>
                <input
                  id="workout-prefs"
                  value={preferences.workout}
                  onChange={(e) => setPreferences({ ...preferences, workout: e.target.value })}
                  placeholder="e.g. walking, cycling, yoga, bodyweight"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="diet-prefs" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Dietary Preferences & Restrictions (comma-separated)
                </label>
                <input
                  id="diet-prefs"
                  value={preferences.dietary}
                  onChange={(e) => setPreferences({ ...preferences, dietary: e.target.value })}
                  placeholder="e.g. vegetarian, high-protein, low-sodium, gluten-free"
                />
              </div>

              <div>
                <button type="submit" className="submit-btn" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
                  Save Preferences
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ============================================================
          TAB 3: MEMBERSHIP & PLUS
          ============================================================ */}
      {activeTab === 'membership' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {subError && <div className="alert-error" role="alert">{subError}</div>}
          {subMessage && (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}>
              {subMessage}
            </div>
          )}

          {/* Current Tier Summary */}
          <section className="card" style={{ borderTop: `3px solid ${user?.role === 'premium' ? '#10b981' : '#64748b'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Your Current Membership
                </span>
                <h2 style={{ fontSize: '1.4rem', margin: '0.2rem 0' }}>
                  {user?.role === 'premium' ? 'Healthy360 Plus' : 'Healthy360 Core (Free)'}
                </h2>
                <p className="sub-text" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {user?.role === 'premium'
                    ? 'Active subscription with full access to personalized AI generators and recourse explorer.'
                    : 'Free core tier includes daily XGBoost pacing and TreeSHAP explainability.'}
                </p>
              </div>
              <span className={`role-badge role-${user?.role}`} style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
                {user?.role?.toUpperCase()}
              </span>
            </div>

            {subData?.subscription && (
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#64748b' }}>Billing Cycle:</span>
                  <strong style={{ textTransform: 'capitalize' }}>{subData.subscription.billing_cycle || 'Monthly'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Status:</span>
                  <strong style={{ color: subData.subscription.status === 'active' ? '#059669' : '#d97706', textTransform: 'capitalize' }}>
                    {subData.subscription.status}
                  </strong>
                </div>
                {subData.subscription.current_period_end && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    <span style={{ color: '#64748b' }}>Next Renewal / Expiry:</span>
                    <strong>{new Date(subData.subscription.current_period_end).toLocaleDateString()}</strong>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {user?.role !== 'premium' ? (
                <Link to="/subscription" className="submit-btn" style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem' }}>
                  Upgrade to Healthy360 Plus ($9.90/mo)
                </Link>
              ) : (
                <>
                  <Link to="/subscription" className="btn-outline" style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem' }}>
                    Manage Subscription & Invoices
                  </Link>
                  {isSubscribed && subData?.subscription?.status === 'active' && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem', color: '#dc2626' }}
                      onClick={() => handleSubAction('cancel')}
                    >
                      Cancel Auto-Renewal
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Features Comparison / Checklist */}
          <section className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Plus Features & Generators</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[
                { label: 'Daily XGBoost Activity Pacing & SHAP explanations', included: true },
                { label: 'Wearable Sync & Biometric Daily Check-In', included: true },
                { label: 'Personalized Walking, Yoga & Cycling Plan Generators', included: user?.role === 'premium' },
                { label: 'Custom Vegetarian & Vegan Meal Plan Generators', included: user?.role === 'premium' },
                { label: 'Multi-Scenario What-If Recourse Explorer', included: user?.role === 'premium' },
                { label: 'Adaptive AI Goal Adjustments & Insights', included: user?.role === 'premium' },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: f.included ? '#ecfdf5' : '#f1f5f9',
                      color: f.included ? '#059669' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {f.included ? '✓' : '—'}
                  </span>
                  <span style={{ color: f.included ? '#0f172a' : '#64748b' }}>{f.label}</span>
                </div>
              ))}
            </div>

            {user?.role === 'premium' && (
              <div style={{ marginTop: '1.25rem' }}>
                <Link to="/premium" className="submit-btn" style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}>
                  Open Plus Generators Hub →
                </Link>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ============================================================
          TAB 4: SECURITY & PRIVACY
          ============================================================ */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Change Password Card */}
          <section className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Security & Credentials</h2>
            <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Update your account password regularly to safeguard your personal health logs.
            </p>

            {passwordError && <div className="alert-error" role="alert" style={{ marginBottom: '1rem' }}>{passwordError}</div>}
            {passwordMessage && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontWeight: 500 }}>
                {passwordMessage}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="currentPassword" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Current Password</label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="newPassword" style={{ fontSize: '0.85rem', fontWeight: 600 }}>New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div>
                <button className="submit-btn" type="submit" disabled={changingPassword} style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}>
                  {changingPassword ? 'Updating Password...' : 'Change Password'}
                </button>
              </div>
            </form>
          </section>

          {/* Data Privacy & PDPA Card */}
          <section className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Data Protection & PDPA Rights</h2>
            <p className="sub-text" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Under Singapore's Personal Data Protection Act (PDPA), you maintain full ownership of your lifestyle biometrics and ML inferences.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: '#334155' }}>
                <Icon name="shield" size={16} /> Data is never sold or used for clinical diagnosis.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: '#334155' }}>
                <Icon name="shield" size={16} /> TreeSHAP explanations let you audit every pacing recommendation factor.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/privacy" className="btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                View Privacy Policy & PDPA Terms
              </Link>
              <Link to="/about" className="btn-outline" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                Read Ethical AI Disclosures
              </Link>
            </div>
          </section>

          {/* Session / Sign Out Card */}
          <section className="card" style={{ borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 0.2rem 0', color: '#991b1b' }}>Session Management</h3>
                <p className="sub-text" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Sign out of Healthy360 on this device.
                </p>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
