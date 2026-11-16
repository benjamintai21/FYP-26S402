import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from './Icon';

const APP_TABS = [
  { to: '/dashboard', label: 'Today', icon: 'home' },
  { to: '/log', label: 'Check-in', icon: 'activity' },
  { to: '/explorer', label: 'What-If', icon: 'sliders' },
  { to: '/about', label: 'About', icon: 'info' },
];

export default function Navbar() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);
  const showMobileTabs = !['/login', '/register', '/onboarding'].includes(pathname);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <nav className="navbar">
        <Link to={user ? '/dashboard' : '/'} className="nav-brand">
          <span className="brand-mark"><Icon name="activity" size={19} /></span>
          <span className="brand-title">Healthy<span>360</span></span>
          <span className="brand-badge">WELLNESS</span>
        </Link>
        <ul className="nav-links">
          {user ? (
            <>
              <li><NavLink to="/dashboard" className={linkClass}>Today</NavLink></li>
              <li><NavLink to="/log" className={linkClass}>Check-in</NavLink></li>
              <li><NavLink to="/explorer" className={linkClass}>What-If</NavLink></li>
              <li><NavLink to="/about" className={linkClass}>About</NavLink></li>
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

      {showMobileTabs && (
        <nav className="mobile-tabbar" aria-label="Main navigation">
          {user ? APP_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}
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