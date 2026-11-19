import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

function NavCard({ to, icon, title, description, badge }) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem',
        padding: '1rem',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#10b981';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: '#ecfdf5',
          color: '#065f46',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
          <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{title}</strong>
          {badge && (
            <span
              style={{
                fontSize: '0.68rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '999px',
                background: '#fef3c7',
                color: '#92400e',
                fontWeight: 600,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
          {description}
        </p>
      </div>
      <Icon name="arrow" size={16} style={{ color: '#94a3b8', marginTop: '0.2rem' }} />
    </Link>
  );
}

export default function MorePage() {
  const { user } = useApp();
  const member = user && ['registered', 'premium'].includes(user.role);

  return (
    <main className="dashboard-container narrow">
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#ecfdf5',
            color: '#065f46',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          <Icon name="grid" size={14} /> Quick Directory
        </div>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>All Resources & Tools</h1>
        <p className="sub-text" style={{ marginTop: '0.25rem' }}>
          Consolidated access to simulation tools, explainability articles, and governance.
        </p>
      </header>

      {/* Prominent link to You Hub */}
      {member && (
        <section
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#166534', fontWeight: 700, fontSize: '0.95rem' }}>
              <Icon name="user" size={18} /> Manage Your Profile, Goals & Membership
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#15803d' }}>
              Your baselines, active fitness targets, preferences, and subscription renewal are unified in the You Hub.
            </p>
          </div>
          <Link
            to="/profile"
            className="submit-btn"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            Open You Hub →
          </Link>
        </section>
      )}

      {/* Group 1: Lifestyle & Simulation Tools */}
      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontSize: '1.05rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
          Lifestyle & Simulation Tools
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {member && (
            <NavCard
              to="/explorer"
              icon="sliders"
              title="What-If Recourse Explorer"
              description="Test hypothetical changes to your sleep, steps, and fatigue to observe how XGBoost pacing shifts."
            />
          )}

          {user?.role === 'premium' && (
            <NavCard
              to="/premium"
              icon="sparkles"
              title="Plus Generators Hub"
              description="On-demand personalized walking, cycling, yoga, and dietary meal plans tailored to your recovery state."
              badge="PLUS"
            />
          )}

          <NavCard
            to="/store"
            icon="shopping-bag"
            title="Healthy360 Store"
            description="Explore expert-reviewed training routines, nutrition guides, and downloadable healthy habit modules."
          />

          <NavCard
            to="/marketplace"
            icon="compass"
            title="Marketplace & Community"
            description="Book wellness services, register for community events, join challenges, and view the live feed."
          />
        </div>
      </section>

      {/* Group 2: Transparency & Ethics */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
          Transparency, Privacy & Platform
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <NavCard
            to="/about"
            icon="book"
            title="About Healthy360 & Explainable AI"
            description="Learn how SHAP attribution values explain model inferences and understand our non-clinical lifestyle guidance boundary."
          />

          <NavCard
            to="/privacy"
            icon="shield"
            title="Privacy Policy & PDPA Compliance"
            description="Singapore Personal Data Protection Act (PDPA) guarantees, telemetry data usage, and user data rights."
          />

          <NavCard
            to="/dev-reset"
            icon="refresh"
            title="Developer Seed & Reset"
            description="Quick utility for evaluators and testers to reseed test users, sample biometrics, and test accounts."
          />
        </div>
      </section>
    </main>
  );
}
