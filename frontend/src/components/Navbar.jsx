import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from './Icon';
import { homeForRole, MEMBER_ROLES } from '../roles';

const MEMBER_MOBILE_TABS = [
  { to: '/dashboard', label: 'Today', icon: 'home' },
  { to: '/marketplace', label: 'Explore', icon: 'compass' },
  { to: '/log', label: 'Record', icon: 'activity', center: true },
  { to: '/store', label: 'Store', icon: 'shopping-bag' },
  { to: '/profile', label: 'You', icon: 'user' },
];

const PORTAL_MOBILE_TABS = [
  { to: '/business', label: 'Portal', icon: 'home' },
  { to: '/marketplace', label: 'Explore', icon: 'compass' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export default function Navbar() {
  const { user, logout } = useApp();
  const [logoutError, setLogoutError] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);
  const showMobileTabs = !['/login', '/register', '/onboarding', '/dev-reset'].includes(pathname);
  const member = user && MEMBER_ROLES.includes(user.role);
  const portalPath = user ? homeForRole(user.role) : '/';
  const mobileTabs = member ? MEMBER_MOBILE_TABS : PORTAL_MOBILE_TABS;

  // Close dropdown on route change or click outside
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setLogoutError('');
    setUserMenuOpen(false);
    try {
      await logout();
    } catch {
      setLogoutError('Signed out locally, but the server could not revoke the session.');
    }
    navigate('/');
  };

  return (
    <>
      <nav className="navbar">
        {/* BRAND LOGO */}
        <Link to={portalPath} className="nav-brand">
          <span className="brand-mark"><Icon name="activity" size={20} /></span>
          <span className="brand-title">Healthy<span>360</span></span>
        </Link>

        {/* DESKTOP STREAMLINED NAV LINKS (STRAVA / RUNKEEPER PATTERN) */}
        <ul className="nav-links">
          {user ? (
            member ? (
              <>
                <li><NavLink to="/dashboard" className={linkClass}>Today</NavLink></li>
                <li><NavLink to="/marketplace" className={linkClass}>Explore</NavLink></li>
                <li><NavLink to="/store" className={linkClass}>Store</NavLink></li>
                {user.role === 'admin' && <li><NavLink to="/admin" className={linkClass}>Admin</NavLink></li>}
              </>
            ) : (
              <>
                <li><NavLink to={portalPath} className={linkClass}>{user.role === 'business' ? 'Business Portal' : 'Admin Portal'}</NavLink></li>
                <li><NavLink to="/marketplace" className={linkClass}>Explore</NavLink></li>
              </>
            )
          ) : (
            <>
              <li><NavLink to="/" end className={linkClass}>Home</NavLink></li>
              <li><NavLink to="/marketplace" className={linkClass}>Explore</NavLink></li>
              <li><NavLink to="/store" className={linkClass}>Store</NavLink></li>
              <li><NavLink to="/about" className={linkClass}>About</NavLink></li>
            </>
          )}
        </ul>

        {/* DESKTOP ACTIONS & USER MENU */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {user ? (
            <>
              {/* Record / Check-in button on desktop */}
              {member && (
                <Link
                  to="/log"
                  className="submit-btn desktop-only"
                  style={{
                    padding: '0.45rem 1rem',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    alignItems: 'center',
                    gap: '0.4rem',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    width: 'auto',
                  }}
                >
                  <Icon name="activity" size={16} />
                  <span>Record</span>
                </Link>
              )}

              {/* User Avatar & Dropdown Menu */}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '999px',
                    padding: '0.25rem 0.5rem 0.25rem 0.25rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-expanded={userMenuOpen}
                  aria-label="User account menu"
                >
                  <span
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      flexShrink: 0,
                    }}
                  >
                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </span>
                  <span
                    className="desktop-only"
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.displayName || user.name}
                  </span>
                  <span className={`role-badge role-${user.role} desktop-only`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                    {user.role.toUpperCase()}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '115%',
                      width: '240px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e2e8f0',
                      padding: '0.5rem',
                      zIndex: 100,
                    }}
                  >
                    <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{user.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                    </div>

                    <Link to="/profile" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                      <Icon name="user" size={16} /> <span>Profile & Baselines</span>
                    </Link>

                    {member && (
                      <Link to="/profile?tab=goals" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                        <Icon name="target" size={16} /> <span>Goals & Preferences</span>
                      </Link>
                    )}

                    {member && (
                      <Link to="/profile?tab=membership" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                        <Icon name="shield" size={16} /> <span>Membership & Plus</span>
                      </Link>
                    )}

                    {user.role === 'premium' && (
                      <Link to="/premium" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                        <Icon name="sparkles" size={16} /> <span>Plus Generators</span>
                      </Link>
                    )}

                    <Link to="/about" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                      <Icon name="book" size={16} /> <span>About & Ethics</span>
                    </Link>

                    <Link to="/privacy" className="more-row" style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem' }}>
                      <Icon name="shield" size={16} /> <span>Privacy Policy (PDPA)</span>
                    </Link>

                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.35rem', paddingTop: '0.35rem' }}>
                      <button
                        type="button"
                        className="more-row"
                        style={{ width: '100%', background: 'transparent', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.88rem', color: '#dc2626', cursor: 'pointer', textAlign: 'left' }}
                        onClick={handleLogout}
                      >
                        <Icon name="logout" size={16} /> <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-outline" style={{ padding: '0.4rem 0.95rem', fontSize: '0.88rem', textDecoration: 'none' }}>
                Log in
              </Link>
              <Link to="/onboarding" className="submit-btn" style={{ padding: '0.45rem 1rem', fontSize: '0.88rem', textDecoration: 'none' }}>
                Build Plan
              </Link>
            </>
          )}
        </div>
      </nav>

      {logoutError && <div className="alert-error" role="alert">{logoutError}</div>}

      {/* MOBILE 5-TAB BAR (STRAVA / RUNKEEPER ARCHITECTURE) */}
      {showMobileTabs && (
        <nav className="mobile-tabbar" aria-label="Main navigation">
          {user ? (
            mobileTabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}${tab.center ? ' mobile-tab-center' : ''}`}
                aria-label={tab.label}
              >
                <span className="mobile-tab-icon"><Icon name={tab.icon} size={21} /></span>
                <span>{tab.label}</span>
              </NavLink>
            ))
          ) : (
            <>
              <NavLink to="/" end className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="home" size={21} /></span>
                <span>Home</span>
              </NavLink>
              <NavLink to="/onboarding" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="activity" size={21} /></span>
                <span>Build Plan</span>
              </NavLink>
              <NavLink to="/marketplace" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="compass" size={21} /></span>
                <span>Explore</span>
              </NavLink>
              <NavLink to="/store" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="shopping-bag" size={21} /></span>
                <span>Store</span>
              </NavLink>
              <NavLink to="/login" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="user" size={21} /></span>
                <span>Log in</span>
              </NavLink>
            </>
          )}
        </nav>
      )}
    </>
  );
}
