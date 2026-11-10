import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Navbar() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span className="brand-badge">CSIT-26-S4-03</span>
        <span className="brand-title">Healthy360</span>
      </Link>
      <ul className="nav-links">
        {user ? (
          <>
            <li><NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink></li>
            <li><NavLink to="/log" className={linkClass}>Log Metrics</NavLink></li>
            <li><NavLink to="/explorer" className={linkClass}>What-If Explorer</NavLink></li>
            <li><NavLink to="/about" className={linkClass}>About</NavLink></li>
            <li>
              <button type="button" className="link-btn" onClick={handleLogout}>
                Log out ({user.name})
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
    </nav>
  );
}