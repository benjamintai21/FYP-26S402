import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

function MoreLink({ to, icon, title, text }) {
  return (
    <Link to={to} className="more-row">
      <span className="more-row-icon"><Icon name={icon} size={20} /></span>
      <span className="more-row-body">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <Icon name="arrow" size={18} />
    </Link>
  );
}

export default function MorePage() {
  const { user } = useApp();
  const member = user && ['registered', 'premium'].includes(user.role);

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>More</h1>
        <p>Everything else in one place.</p>
      </header>
      <section className="more-group">
        {member && <>
          <MoreLink to="/store" icon="shopping-bag" title="Store" text="Browse meal plans, workout plans and articles" />
          <MoreLink to="/explorer" icon="sliders" title="What-If Explorer" text="Test habit changes and see how your plan responds" />
          {user.role === 'premium' && <MoreLink to="/premium" icon="sparkles" title="Premium tools" text="Recovery-aware workout and meal plans" />}
          <MoreLink to="/subscription" icon="shield" title="Subscription" text="View your current plan and renewal" />
        </>}
        <MoreLink to="/marketplace" icon="compass" title="Discover" text="Services, events and community posts" />
        <MoreLink to="/about" icon="book" title="About" text="How Healthy360 explains and protects your data" />
        <MoreLink to="/profile" icon="user" title="Profile" text="Account details, display name and password" />
        {member && <MoreLink to="/goals" icon="target" title="Goals" text="Set daily goals and lifestyle preferences" />}
      </section>
    </main>
  );
}
