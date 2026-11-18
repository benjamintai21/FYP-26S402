import { useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from './Icon';
import { homeForRole, MEMBER_ROLES } from '../roles';

const MEMBER_MOBILE_TABS = [
  { to: '/dashboard', label: 'Today', icon: 'home' },
  { to: '/marketplace', label: 'Explore', icon: 'compass' },
  { to: '/log', label: 'Check-in', icon: 'calendar', center: true },
  { to: '/goals', label: 'Goals', icon: 'target' },
  { to: '/more', label: 'More', icon: 'grid' },
];

const PORTAL_MOBILE_TABS = [
  { to: '/business', label: 'Home', icon: 'home' },
  { to: '/marketplace', label: 'Explore', icon: 'compass' },
  { to: '/about', label: 'About', icon: 'info' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export default function Navbar() {
  const { user, logout } = useApp();
  const [logoutError, setLogoutError] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);
  const showMobileTabs = !['/login', '/register', '/onboarding', '/dev-reset'].includes(pathname);
  const member = user && MEMBER_ROLES.includes(user.role);
  const portalPath = user ? homeForRole(user.role) : '/';
  const portalLabel = user && user.role === 'admin' ? 'Admin portal' : user && user.role === 'business' ? 'Business portal' : 'Your account';
  const mobileTabs = member ? MEMBER_MOBILE_TABS : PORTAL_MOBILE_TABS;

  const handleLogout = async () => {
    setLogoutError('');
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
        <Link to={portalPath} className="nav-brand">
          <span className="brand-mark"><Icon name="activity" size={19} /></span>
          <span className="brand-title">Healthy<span>360</span></span>
        </Link>
        <ul className="nav-links">
          {user ? (
            <>
              {member ? (
                <>
                  <li><NavLink to="/dashboard" className={linkClass}>Today</NavLink></li>
                  <li><NavLink to="/log" className={linkClass}>Check-in</NavLink></li>
                  <li><NavLink to="/explorer" className={linkClass}>What-If</NavLink></li>
                  <li><NavLink to="/goals" className={linkClass}>Goals</NavLink></li>
                  <li><NavLink to="/marketplace" className={linkClass}>Discover</NavLink></li>
                  {user.role === 'premium' && <li><NavLink to="/premium" className={linkClass}>Premium</NavLink></li>}
                  {user.role === 'admin' && <li><NavLink to="/admin" className={linkClass}>Admin</NavLink></li>}
                </>
              ) : (
                <li><NavLink to={portalPath} className={linkClass}>{portalLabel}</NavLink></li>
              )}
              <li><NavLink to="/about" className={linkClass}>About</NavLink></li>
              <li><NavLink to="/profile" className={linkClass}>Profile</NavLink></li>
              <li>
                <button type="button" className="link-btn" onClick={handleLogout}>
                  Log out
                </button>
              </li>
            </>
          ) : (
            <>
              <li><NavLink to="/" end className={linkClass}>Home</NavLink></li>
              <li><NavLink to="/about" className={linkClass}>About</NavLink></li>
              <li><NavLink to="/marketplace" className={linkClass}>Discover</NavLink></li>
              <li><NavLink to="/login" className={linkClass}>Log in</NavLink></li>
              <li><Link to="/register" className="nav-cta">Get started</Link></li>
            </>
          )}
        </ul>
        <div className="mobile-header-action">
          {user ? (
            <button type="button" className="mobile-account-btn" onClick={handleLogout} aria-label="Log out">
              <Icon name="logout" size={19} />
            </button>
          ) : (
            <Link to="/register" className="mobile-join-btn">Join free</Link>
          )}
        </div>
      </nav>
      {logoutError && <div className="alert-error" role="alert">{logoutError}</div>}

      {showMobileTabs && (
        <nav className="mobile-tabbar" aria-label="Main navigation">
          {user ? mobileTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}${tab.center ? ' mobile-tab-center' : ''}`}
              aria-label={tab.label}
            >
              <span className="mobile-tab-icon"><Icon name={tab.icon} size={21} /></span>
              <span>{tab.label}</span>
            </NavLink>
          )) : (
            <>
              <NavLink to="/" end className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="home" size={21} /></span>
                <span>Home</span>
              </NavLink>
              <NavLink to="/about" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="info" size={21} /></span>
                <span>About</span>
              </NavLink>
              <NavLink to="/login" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="user" size={21} /></span>
                <span>Log in</span>
              </NavLink>
              <NavLink to="/register" className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
                <span className="mobile-tab-icon"><Icon name="activity" size={21} /></span>
                <span>Sign up</span>
              </NavLink>
            </>
          )}
        </nav>
      )}
    </>
  );
}
