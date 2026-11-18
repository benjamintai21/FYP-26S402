import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getAdminUsers, getAdminUserDetail, getAdminFeedback, patchAdminArticleStatus, putAdminPlans, getAdminFairnessAudit, getAdminLogs } from '../api';

export default function AdminPage() {
  const { user } = useApp();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [userDetail, setUserDetail] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [fairnessAudit, setFairnessAudit] = useState(null);
  const [fairnessDim, setFairnessDim] = useState('age_bracket');
  const [logs, setLogs] = useState([]);
  const [logPage, setLogPage] = useState(1);
  const [logLevelFilter, setLogLevelFilter] = useState('');
  const [logEventFilter, setLogEventFilter] = useState('');
  const [totalLogs, setTotalLogs] = useState(0);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchUsers = async () => {
    try {
      const data = await getAdminUsers(userPage, 20, userRoleFilter);
      setUsers(data.users);
      setTotalUsers(data.total);
    } catch (err) { setError(err.message); }
  };

  const fetchFeedback = async () => {
    try {
      const data = await getAdminFeedback(feedbackPage, 50);
      setFeedback(data.feedback);
      setTotalFeedback(data.total);
    } catch (err) { setError(err.message); }
  };

  const fetchFairnessAudit = async () => {
    try {
      const data = await getAdminFairnessAudit(fairnessDim);
      setFairnessAudit(data);
      setMessage('Fairness audit completed.');
    } catch (err) { setError(err.message); }
  };

  const fetchLogs = async () => {
    try {
      const data = await getAdminLogs(logPage, 50, logLevelFilter, logEventFilter);
      setLogs(data.logs);
      setTotalLogs(data.total);
    } catch (err) { setError(err.message); }
  };

  const fetchPlans = async () => {
    try {
      const data = await getAdminUsers(1, 100);
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (tab === 'users') fetchUsers();
    if (tab === 'feedback') fetchFeedback();
    if (tab === 'fairness') fetchFairnessAudit();
    if (tab === 'logs') fetchLogs();
  }, [tab, userPage, userRoleFilter, feedbackPage, fairnessDim, logPage, logLevelFilter, logEventFilter]);

  const viewUserDetail = async (userId) => {
    try {
      const data = await getAdminUserDetail(userId);
      setUserDetail(data.user);
    } catch (err) { setError(err.message); }
  };

  const updateArticleStatus = async (articleId, status) => {
    try {
      await patchAdminArticleStatus(articleId, status);
      setMessage(`Article ${status}.`);
      fetchUsers();
    } catch (err) { setError(err.message); }
  };

  const updatePlan = async (tierCode, updates) => {
    try {
      await putAdminPlans({ tier_code: tierCode, ...updates });
      setMessage(`Plan ${tierCode} updated.`);
    } catch (err) { setError(err.message); }
  };

  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Admin Governance</h1><p>Welcome, {user.name}. System administration and audit tools.</p></header>
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="admin-tab">Section</label>
        <select id="admin-tab" value={tab} onChange={(e) => { setTab(e.target.value); setError(''); setMessage(''); }}>
          <option value="users">User & Content Governance</option>
          <option value="feedback">Feedback Review</option>
          <option value="fairness">Fairness Audit</option>
          <option value="logs">Audit Logs</option>
        </select>
      </div>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status" style={{ color: '#16a34a' }}>{message}</p>}

      {tab === 'users' && (
        <div>
          <div className="form-group">
            <label htmlFor="role-filter">Filter by role</label>
            <select id="role-filter" value={userRoleFilter} onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}>
              <option value="">All</option>
              <option value="registered">Registered</option>
              <option value="premium">Premium</option>
              <option value="business">Business</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => <tr key={u.id}>
                <td>{u.id}</td><td>{u.name}</td><td>{u.email}</td>
                <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td><button className="btn-outline" onClick={() => viewUserDetail(u.id)}>View</button></td>
              </tr>)}
            </tbody>
          </table>
          {totalUsers > 20 && (
            <div className="pagination">
              <button className="btn-outline" onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}>Previous</button>
              <span>Page {userPage} of {Math.ceil(totalUsers / 20)}</span>
              <button className="btn-outline" onClick={() => setUserPage(p => p + 1)} disabled={userPage >= Math.ceil(totalUsers / 20)}>Next</button>
            </div>
          )}
        </div>
      )}

      {tab === 'feedback' && (
        <div>
          <table className="admin-table">
            <thead><tr><th>ID</th><th>User</th><th>Clarity</th><th>Trust</th><th>Comment</th><th>Public</th><th>Rec ID</th><th>Created</th></tr></thead>
            <tbody>
              {feedback.map((f) => <tr key={f.id}>
                <td>{f.id}</td><td>{f.user.name} ({f.user.email})</td>
                <td>{f.clarity}</td><td>{f.trust}</td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.comment || ''}</td>
                <td>{f.isPublic ? 'Yes' : 'No'}</td><td>{f.recommendationId || 'N/A'}</td>
                <td>{new Date(f.createdAt).toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
          {totalFeedback > 50 && (
            <div className="pagination">
              <button className="btn-outline" onClick={() => setFeedbackPage(p => Math.max(1, p - 1))} disabled={feedbackPage === 1}>Previous</button>
              <span>Page {feedbackPage} of {Math.ceil(totalFeedback / 50)}</span>
              <button className="btn-outline" onClick={() => setFeedbackPage(p => p + 1)} disabled={feedbackPage >= Math.ceil(totalFeedback / 50)}>Next</button>
            </div>
          )}
        </div>
      )}

      {tab === 'fairness' && (
        <div>
          <div className="form-group">
            <label htmlFor="fairness-dim">Subgroup dimension</label>
            <select id="fairness-dim" value={fairnessDim} onChange={(e) => { setFairnessDim(e.target.value); setError(''); setMessage(''); }}>
              <option value="age_bracket">Age Bracket</option>
              <option value="activity_tier">Activity Tier</option>
            </select>
            <button className="submit-btn" onClick={fetchFairnessAudit}>Run Fairness Audit</button>
          </div>
          {fairnessAudit && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>Fairness Audit Results</h3>
              <p className="sub-text">Dimension: {fairnessAudit.dimension} · Sample size: {fairnessAudit.sampleSize}</p>
              <div className="form-group">
                <strong>Demographic Parity Difference:</strong> {fairnessAudit.demographicParityDifference.toFixed(4)}
              </div>
              <div className="form-group">
                <strong>Disparate Impact Ratio:</strong> {fairnessAudit.disparateImpactRatio.toFixed(4)}
              </div>
              <h4>Subgroup Metrics</h4>
              <table className="admin-table">
                <thead><tr><th>Subgroup</th><th>Count</th><th>Accuracy</th><th>Positive Rate</th></tr></thead>
                <tbody>
                  {Object.entries(fairnessAudit.subgroupMetrics).map(([key, val]) => <tr key={key}>
                    <td>{key}</td><td>{val.count}</td><td>{val.accuracy.toFixed(4)}</td><td>{val.positive_rate.toFixed(4)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="form-group" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label htmlFor="log-level">Level</label>
              <select id="log-level" value={logLevelFilter} onChange={(e) => { setLogLevelFilter(e.target.value); setLogPage(1); }}>
                <option value="">All</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label htmlFor="log-event">Event</label>
              <select id="log-event" value={logEventFilter} onChange={(e) => { setLogEventFilter(e.target.value); setLogPage(1); }}>
                <option value="">All</option>
                <option value="inference">Inference</option>
                <option value="imputation">Imputation</option>
                <option value="api_error">API Error</option>
                <option value="auth_event">Auth Event</option>
                <option value="admin_action">Admin Action</option>
              </select>
            </div>
          </div>
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Actor</th><th>Level</th><th>Event</th><th>Endpoint</th><th>Latency (ms)</th><th>Message</th><th>Created</th></tr></thead>
            <tbody>
              {logs.map((log) => <tr key={log.id}>
                <td>{log.id}</td><td>{log.actor || 'system'}</td>
                <td><span className={`log-level log-${log.level.toLowerCase()}`}>{log.level}</span></td>
                <td>{log.event}</td><td>{log.endpoint || '-'}</td>
                <td>{log.latencyMs || '-'}</td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message || ''}</td>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
          {totalLogs > 50 && (
            <div className="pagination">
              <button className="btn-outline" onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}>Previous</button>
              <span>Page {logPage} of {Math.ceil(totalLogs / 50)}</span>
              <button className="btn-outline" onClick={() => setLogPage(p => p + 1)} disabled={logPage >= Math.ceil(totalLogs / 50)}>Next</button>
            </div>
          )}
        </div>
      )}

      {userDetail && (
        <div className="modal-overlay" onClick={() => setUserDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>User Detail: {userDetail.name} ({userDetail.id})</h2>
            <button className="btn-outline" onClick={() => setUserDetail(null)}>Close</button>
            <div className="content-grid">
              <div className="card">
                <h3>Account</h3>
                <p><strong>Email:</strong> {userDetail.email}</p>
                <p><strong>Role:</strong> {userDetail.role}</p>
                <p><strong>Created:</strong> {new Date(userDetail.created_at).toLocaleString()}</p>
                <p><strong>PDPA Consent:</strong> {userDetail.pdpa_consent_at ? new Date(userDetail.pdpa_consent_at).toLocaleString() : 'Not given'}</p>
              </div>
              {userDetail.profile && (
                <div className="card">
                  <h3>Profile</h3>
                  <p><strong>Age Bracket:</strong> {userDetail.profile.age_bracket}</p>
                  <p><strong>Activity Tier:</strong> {userDetail.profile.activity_tier}</p>
                  <p><strong>Fitness Level:</strong> {userDetail.profile.fitness_level}</p>
                  <p><strong>Sleep Baseline:</strong> {userDetail.profile.sleep_baseline} hrs</p>
                  <p><strong>Steps Baseline:</strong> {userDetail.profile.steps_baseline}</p>
                  <p><strong>Updated:</strong> {userDetail.profile.updated_at ? new Date(userDetail.profile.updated_at).toLocaleString() : 'N/A'}</p>
                </div>
              )}
              {userDetail.subscriptions && userDetail.subscriptions.length > 0 && (
                <div className="card">
                  <h3>Subscriptions</h3>
                  {userDetail.subscriptions.map((s) => <div key={s.plan} className="form-group">
                    <strong>{s.plan}</strong>
                    <span>{s.status} · Started: {new Date(s.startDate).toLocaleDateString()}</span>
                    {s.renewalDate && <span>Renews: {new Date(s.renewalDate).toLocaleDateString()}</span>}
                    {s.cancelledAt && <span className="alert-error">Cancelled: {new Date(s.cancelledAt).toLocaleDateString()}</span>}
                  </div>)}
                </div>
              )}
              {userDetail.recentFeedback && userDetail.recentFeedback.length > 0 && (
                <div className="card">
                  <h3>Recent Feedback</h3>
                  {userDetail.recentFeedback.map((f) => <div key={f.id} className="form-group">
                    <strong>Clarity: {f.clarity} · Trust: {f.trust}</strong>
                    <p>{f.comment || 'No comment'}</p>
                    <small>{f.isPublic ? 'Public' : 'Private'} · {new Date(f.createdAt).toLocaleString()}</small>
                  </div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}