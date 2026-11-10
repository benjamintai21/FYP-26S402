export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="brand-badge">CSIT-26-S4-03</span>
        <span className="brand-title">Healthy360</span>
      </div>
      <ul className="nav-links">
        <li><a href="#dashboard" className="active">Dashboard</a></li>
        <li><a href="#log-metrics">Log Metrics</a></li>
        <li><a href="#analytics">Trends</a></li>
      </ul>
    </nav>
  );
}