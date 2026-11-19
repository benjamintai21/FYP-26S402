import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getMarketplace, reserveOffering, cancelOfferingReservation, getEventNotifications } from '../api';
import { MEMBER_ROLES } from '../roles';
import Community from '../components/Community';
import Icon from '../components/Icon';

export default function MarketplacePage() {
  const { user } = useApp();
  const member = user && MEMBER_ROLES.includes(user.role);

  const [data, setData] = useState({ services: [], events: [], posts: [] });
  const [notifications, setNotifications] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'events' | 'services' | 'bookings' | 'posts' | 'challenges'
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async (active = true) => {
    try {
      const result = await getMarketplace();
      if (active) setData(result);
    } catch (err) {
      if (active) setError(err.message);
    } finally {
      if (active) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadData(active);
    if (member) {
      getEventNotifications()
        .then((result) => { if (active) setNotifications(result.notifications || []); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [member]);

  const handleReserve = async (resource, id, title) => {
    setError('');
    setMessage('');
    setBusyId(`${resource}-${id}`);
    try {
      const res = await reserveOffering(resource, id);
      setMessage(res.message || `Successfully reserved spot for "${title}"!`);

      // Optimistic UI update
      setData((prev) => {
        const next = { ...prev };
        next[resource] = next[resource].map((item) => {
          if (item.id === id) {
            const registered_count = (item.registered_count || 0) + 1;
            const spots_left = item.capacity ? Math.max(0, item.capacity - registered_count) : item.spots_left;
            return {
              ...item,
              is_reserved: true,
              registered_count,
              spots_left,
              is_full: spots_left === 0,
            };
          }
          return item;
        });
        return next;
      });

      // Background fresh fetch to guarantee state sync
      loadData(true);
    } catch (err) {
      setError(err.message || 'Could not complete reservation.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (resource, id, title) => {
    setError('');
    setMessage('');
    setBusyId(`${resource}-${id}`);
    try {
      const res = await cancelOfferingReservation(resource, id);
      setMessage(res.message || `Reservation for "${title}" cancelled.`);

      // Optimistic UI update
      setData((prev) => {
        const next = { ...prev };
        next[resource] = next[resource].map((item) => {
          if (item.id === id) {
            const registered_count = Math.max(0, (item.registered_count || 1) - 1);
            const spots_left = item.capacity ? item.capacity - registered_count : item.spots_left;
            return {
              ...item,
              is_reserved: false,
              registered_count,
              spots_left,
              is_full: false,
            };
          }
          return item;
        });
        return next;
      });

      loadData(true);
    } catch (err) {
      setError(err.message || 'Could not cancel reservation.');
    } finally {
      setBusyId(null);
    }
  };

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-SG', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  // Filter items by search query
  const matchesSearch = (item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.business && item.business.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.venue && item.venue.toLowerCase().includes(q))
    );
  };

  const filteredEvents = data.events.filter(matchesSearch);
  const filteredServices = data.services.filter(matchesSearch);
  const filteredPosts = data.posts.filter(matchesSearch);

  // My Bookings (events + services where is_reserved is true)
  const myReservedEvents = data.events.filter((e) => e.is_reserved);
  const myReservedServices = data.services.filter((s) => s.is_reserved);
  const totalBookingsCount = myReservedEvents.length + myReservedServices.length;

  return (
    <main className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* HEADER */}
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <Icon name="compass" size={14} /> Community & Partner Ecosystem
        </div>
        <h1 style={{ margin: 0, fontSize: '2.2rem' }}>Explore & Discover</h1>
        <p className="sub-text" style={{ fontSize: '1rem', marginTop: '0.25rem' }}>
          Join community workouts, book local fitness coaching, browse partner tips, and join step challenges.
        </p>
      </header>

      {/* EVENT NOTIFICATIONS ALERT */}
      {notifications.length > 0 && (
        <section className="card" style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#92400e', marginBottom: '0.4rem' }}>
            <Icon name="info" size={18} /> Schedule Updates on Your Registered Events
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {notifications.map((notice) => (
              <p key={notice.id} style={{ margin: 0, fontSize: '0.9rem', color: '#78350f' }}>
                • <strong>{notice.message}</strong> ({notice.event?.title} · {notice.event?.dateTime} · {notice.event?.venue})
              </p>
            ))}
          </div>
        </section>
      )}

      {/* STATUS & FEEDBACK NOTICES */}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 500 }}>
          {message}
        </div>
      )}
      {error && <div className="alert-error" role="alert">{error}</div>}

      {/* SEARCH AND CATEGORY FILTER TABS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search events, gym classes, coaches, venues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              borderRadius: '10px',
              border: '1.5px solid #d1d5db',
              width: '100%',
              fontSize: '0.95rem',
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>
            <Icon name="compass" size={18} />
          </span>
          {searchQuery && (
            <button
              type="button"
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="scroll-tabs">
          {[
            { id: 'all', label: 'All Offerings', count: data.events.length + data.services.length + data.posts.length },
            { id: 'events', label: '📅 Events & Workshops', count: data.events.length },
            { id: 'services', label: '🏋️ Services & Training', count: data.services.length },
            { id: 'bookings', label: '🎟️ My Bookings', count: totalBookingsCount },
            { id: 'posts', label: '📢 Community Feed', count: data.posts.length },
            { id: 'challenges', label: '🏆 Step Challenges', count: null },
          ].map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                style={{
                  padding: '0.55rem 1.15rem',
                  borderRadius: '999px',
                  border: `1.5px solid ${isActive ? '#10b981' : '#e5e7eb'}`,
                  background: isActive ? '#ecfdf5' : '#ffffff',
                  color: isActive ? '#065f46' : '#4b5563',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: isActive ? '0 1px 2px rgba(16,185,129,0.1)' : 'none',
                }}
                onClick={() => setActiveCategory(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span style={{ background: isActive ? '#10b981' : '#f3f4f6', color: isActive ? '#ffffff' : '#6b7280', fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '999px', fontWeight: 700 }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading marketplace offerings...</div>}

      {/* TAB: MY BOOKINGS ONLY */}
      {activeCategory === 'bookings' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>My Active Bookings & Reservations</h2>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{totalBookingsCount} active reservation(s)</span>
          </div>

          {totalBookingsCount === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f3f4f6', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                <Icon name="calendar" size={28} />
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>No Active Reservations</h3>
              <p className="sub-text" style={{ maxWidth: '420px', margin: '0 auto 1.5rem auto' }}>
                You have not reserved any events or fitness services yet. Browse upcoming workshops or classes to reserve your spot.
              </p>
              <button type="button" className="submit-btn" onClick={() => setActiveCategory('events')}>
                Browse Upcoming Events
              </button>
            </div>
          ) : (
            <div className="responsive-card-grid">
              {/* Reserved Events */}
              {myReservedEvents.map((evt) => (
                <div key={`booked-evt-${evt.id}`} className="card" style={{ border: '2px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                        CONFIRMED EVENT
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>By {evt.business}</span>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>{evt.title}</h3>
                    <p className="sub-text" style={{ fontSize: '0.88rem', margin: '0 0 0.75rem 0' }}>{evt.description}</p>
                    <div style={{ fontSize: '0.85rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div>📅 <strong>Date:</strong> {formatDateTime(evt.dateTime)}</div>
                      <div>📍 <strong>Venue:</strong> {evt.venue}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>✓ Spot Secured</span>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => handleCancel('events', evt.id, evt.title)}
                      disabled={busyId === `events-${evt.id}`}
                    >
                      {busyId === `events-${evt.id}` ? 'Cancelling...' : 'Cancel Booking'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Reserved Services */}
              {myReservedServices.map((svc) => (
                <div key={`booked-svc-${svc.id}`} className="card" style={{ border: '2px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                        CONFIRMED SERVICE
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>By {svc.business}</span>
                    </div>
                    <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>{svc.title}</h3>
                    <p className="sub-text" style={{ fontSize: '0.88rem', margin: '0 0 0.75rem 0' }}>{svc.description}</p>
                    <div style={{ fontSize: '0.85rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div>🕒 <strong>Schedule:</strong> {svc.schedule}</div>
                      <div>💰 <strong>Fee:</strong> {svc.price}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>✓ Service Reserved</span>
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => handleCancel('services', svc.id, svc.title)}
                      disabled={busyId === `services-${svc.id}`}
                    >
                      {busyId === `services-${svc.id}` ? 'Cancelling...' : 'Cancel Booking'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: EVENTS & WORKSHOPS */}
      {(activeCategory === 'all' || activeCategory === 'events') && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Fitness Events & Workshops</h2>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{filteredEvents.length} upcoming</span>
          </div>

          {filteredEvents.length === 0 ? (
            <p className="sub-text">No matching fitness events found.</p>
          ) : (
            <div className="responsive-card-grid">
              {filteredEvents.map((item) => (
                <div key={`evt-${item.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: item.is_reserved ? '2px solid #10b981' : '1px solid #e5e7eb', position: 'relative' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        By {item.business}
                      </span>
                      {item.is_reserved ? (
                        <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                          ✓ RESERVED
                        </span>
                      ) : item.is_full ? (
                        <span style={{ background: '#fef2f2', color: '#991b1b', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                          FULL
                        </span>
                      ) : (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                          {item.spots_left != null ? `${item.spots_left} spots left` : 'Open'}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.4rem 0' }}>{item.title}</h3>
                    <p className="sub-text" style={{ fontSize: '0.9rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                      {item.description}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', color: '#4b5563', background: '#f9fafb', padding: '0.75rem', borderRadius: '8px' }}>
                      <div>📅 <strong>Date:</strong> {formatDateTime(item.dateTime)}</div>
                      <div>📍 <strong>Venue:</strong> {item.venue}</div>
                      <div>👥 <strong>Capacity:</strong> {item.capacity} attendees ({item.registered_count || 0} booked)</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                    {item.is_reserved ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>Spot Reserved</span>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => handleCancel('events', item.id, item.title)}
                          disabled={busyId === `events-${item.id}`}
                        >
                          {busyId === `events-${item.id}` ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    ) : member ? (
                      <button
                        type="button"
                        className="submit-btn"
                        style={{ width: '100%', padding: '0.65rem' }}
                        onClick={() => handleReserve('events', item.id, item.title)}
                        disabled={item.is_full || busyId === `events-${item.id}`}
                      >
                        {busyId === `events-${item.id}` ? 'Booking...' : item.is_full ? 'Event Full' : 'Reserve Spot'}
                      </button>
                    ) : !user ? (
                      <Link to="/login" className="btn-outline" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
                        Sign In to Reserve
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: SERVICES & MEMBERSHIPS */}
      {(activeCategory === 'all' || activeCategory === 'services') && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Fitness Services & Studio Classes</h2>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{filteredServices.length} offerings</span>
          </div>

          {filteredServices.length === 0 ? (
            <p className="sub-text">No matching fitness services found.</p>
          ) : (
            <div className="responsive-card-grid">
              {filteredServices.map((item) => (
                <div key={`svc-${item.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: item.is_reserved ? '2px solid #10b981' : '1px solid #e5e7eb' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        By {item.business}
                      </span>
                      {item.is_reserved && (
                        <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                          ✓ RESERVED
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.4rem 0' }}>{item.title}</h3>
                    <p className="sub-text" style={{ fontSize: '0.9rem', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                      {item.description}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', color: '#4b5563', background: '#f9fafb', padding: '0.75rem', borderRadius: '8px' }}>
                      <div>🕒 <strong>Schedule:</strong> {item.schedule}</div>
                      <div>💰 <strong>Pricing:</strong> {item.price}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                    {item.is_reserved ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>Service Reserved</span>
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => handleCancel('services', item.id, item.title)}
                          disabled={busyId === `services-${item.id}`}
                        >
                          {busyId === `services-${item.id}` ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    ) : member ? (
                      <button
                        type="button"
                        className="submit-btn"
                        style={{ width: '100%', padding: '0.65rem' }}
                        onClick={() => handleReserve('services', item.id, item.title)}
                        disabled={busyId === `services-${item.id}`}
                      >
                        {busyId === `services-${item.id}` ? 'Reserving...' : 'Reserve Service'}
                      </button>
                    ) : !user ? (
                      <Link to="/login" className="btn-outline" style={{ display: 'block', textAlign: 'center', width: '100%' }}>
                        Sign In to Reserve
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: COMMUNITY FEED & TIPS */}
      {(activeCategory === 'all' || activeCategory === 'posts') && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Community Updates & Partner Tips</h2>
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{filteredPosts.length} posts</span>
          </div>

          {filteredPosts.length === 0 ? (
            <p className="sub-text">No community posts published yet.</p>
          ) : (
            <div className="responsive-card-grid">
              {filteredPosts.map((post) => (
                <div key={`post-${post.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        From {post.business}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.5rem 0' }}>{post.title}</h3>
                    <p style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.6, margin: 0 }}>
                      {post.body || post.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: STEP CHALLENGES & COHORTS */}
      {(activeCategory === 'all' || activeCategory === 'challenges') && (
        <section>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Community Step Challenges & Cohorts</h2>
            <p className="sub-text" style={{ margin: '0.2rem 0 0 0' }}>
              Compete on public leaderboards under a privacy-safe pseudonym, or opt in to anonymous business research cohorts.
            </p>
          </div>
          <Community member={Boolean(member)} />
        </section>
      )}
    </main>
  );
}
