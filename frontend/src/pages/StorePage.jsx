import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getProducts, purchaseProduct, getPurchases } from '../api';
import Icon from '../components/Icon';

export default function StorePage() {
  const { user } = useApp();
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyIds, setBusyIds] = useState(new Set());

  // Filter & UI states
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'meal_plan' | 'workout_plan' | 'article'
  const [previewProduct, setPreviewProduct] = useState(null);
  const [activeReadingProduct, setActiveReadingProduct] = useState(null);
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([getProducts(), getPurchases()])
      .then(([productData, purchaseData]) => {
        if (!active) return;
        setProducts(productData.products || []);
        setPurchases(purchaseData.purchases || []);
      })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const isPurchased = (productId) => purchases.some(p => p.product_id === productId);
  const isPremiumUser = user?.role === 'premium';

  const handlePurchase = async (product) => {
    setError('');
    setMessage('');
    setBusyIds(prev => new Set(prev).add(product.id));
    try {
      const result = await purchaseProduct(product.id);
      setMessage(result.message || `Successfully purchased ${product.title}!`);
      setPurchases(prev => [...prev, result.purchase || { product_id: product.id, purchased_at: new Date().toISOString(), product }]);
      setPreviewProduct(null);
      setShowPurchaseSuccess(product);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }
  };

  const filteredProducts = products.filter(p => {
    if (!p.is_active) return false;
    if (activeCategory !== 'all' && p.type !== activeCategory) return false;
    return true;
  });

  const getCategoryLabel = (type) => {
    switch (type) {
      case 'meal_plan': return 'Meal Plan';
      case 'workout_plan': return 'Workout Program';
      case 'article': return 'Expert Article';
      default: return 'Wellness Resource';
    }
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'meal_plan': return 'target';
      case 'workout_plan': return 'activity';
      case 'article': return 'book';
      default: return 'compass';
    }
  };

  return (
    <main className="dashboard-container">
      {/* Header */}
      <header className="page-header" style={{ maxWidth: '840px', margin: '0 auto 2rem auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', color: '#065f46', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          <Icon name="shopping-bag" size={16} /> Digital Wellness Store
        </div>
        <h1 style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Programs, Plans & Expert Guides</h1>
        <p className="sub-text" style={{ fontSize: '1.05rem', margin: 0 }}>
          Expand your health journey with structured plant-based nutrition plans, recovery routines, and evidence-based science.
        </p>
      </header>

      {error && <div className="alert-error" role="alert" style={{ maxWidth: '840px', margin: '0 auto 1.5rem auto' }}>{error}</div>}
      {message && <div style={{ maxWidth: '840px', margin: '0 auto 1.5rem auto', padding: '0.75rem 1rem', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', border: '1px solid #a7f3d0' }}>{message}</div>}

      {/* Category Filter Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { id: 'all', label: 'All Items' },
          { id: 'meal_plan', label: '🥗 Meal Plans' },
          { id: 'workout_plan', label: '🏃 Workout Programs' },
          { id: 'article', label: '📖 Expert Articles' },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '999px',
              border: activeCategory === cat.id ? '1.5px solid #10b981' : '1px solid #e5e7eb',
              background: activeCategory === cat.id ? '#ecfdf5' : '#ffffff',
              color: activeCategory === cat.id ? '#065f46' : '#4b5563',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Catalog Grid */}
      <section style={{ maxWidth: '1000px', margin: '0 auto 3rem auto' }}>
        {filteredProducts.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="sub-text">No items found in this category.</p>
          </div>
        ) : (
          <div className="responsive-card-grid">
            {filteredProducts.map((product) => {
              const owned = isPurchased(product.id);
              const priceFormatted = product.price_cents === 0 ? 'Free' : `SGD $${(product.price_cents / 100).toFixed(2)}`;
              const lockedForNonPremium = product.premium_only && !isPremiumUser;

              return (
                <div
                  key={product.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: owned ? '1.5px solid #10b981' : '1px solid #e5e7eb',
                    background: owned ? '#fafdfb' : '#ffffff',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#059669', background: '#ecfdf5', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        <Icon name={getCategoryIcon(product.type)} size={14} /> {getCategoryLabel(product.type)}
                      </span>
                      {product.premium_only && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          Plus Member
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>{product.title}</h3>
                    <p className="sub-text" style={{ fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                      {product.description}
                    </p>

                    {/* Meta info pills */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      {product.content?.duration_days && <span>📅 {product.content.duration_days} Days</span>}
                      {product.content?.duration_weeks && <span>📅 {product.content.duration_weeks} Weeks</span>}
                      {product.content?.reading_time_minutes && <span>⏱️ {product.content.reading_time_minutes} min read</span>}
                      {product.content?.diet && <span style={{ textTransform: 'capitalize' }}>🌱 {product.content.diet}</span>}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#111827' }}>
                        {priceFormatted}
                      </span>
                    </div>
                    <div>
                      {owned ? (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ borderColor: '#10b981', color: '#059669', fontWeight: 600 }}
                          onClick={() => setActiveReadingProduct(product)}
                        >
                          View Content
                        </button>
                      ) : lockedForNonPremium ? (
                        <Link to="/subscription" className="btn-outline" style={{ textDecoration: 'none', color: '#b45309', borderColor: '#fde68a' }}>
                          Unlock with Plus
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="submit-btn"
                          style={{ padding: '0.5rem 1rem' }}
                          onClick={() => setPreviewProduct(product)}
                        >
                          Buy Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* OWNED LIBRARY SECTION */}
      {purchases.length > 0 && (
        <section className="card" style={{ maxWidth: '1000px', margin: '0 auto 3rem auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Your Library ({purchases.length})</h2>
            <span className="sub-text">Instant access anytime</span>
          </div>

          <div className="responsive-card-grid">
            {purchases.map((purchase) => {
              const product = products.find(p => p.id === purchase.product_id) || purchase.product;
              if (!product) return null;
              return (
                <div
                  key={purchase.id || purchase.product_id}
                  style={{
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>
                      {getCategoryLabel(product.type)}
                    </span>
                    <h4 style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '1.05rem' }}>{product.title}</h4>
                    <p className="sub-text" style={{ fontSize: '0.85rem', margin: 0 }}>
                      Purchased on {new Date(purchase.purchased_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="submit-btn"
                      style={{ width: '100%', padding: '0.45rem', fontSize: '0.9rem' }}
                      onClick={() => setActiveReadingProduct(product)}
                    >
                      Read / Open Plan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* PRODUCT PREVIEW & CHECKOUT DRAWER */}
      {previewProduct && (
        <div className="modal-overlay" onClick={() => setPreviewProduct(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                {getCategoryLabel(previewProduct.type)}
              </span>
              <button type="button" className="btn-outline" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setPreviewProduct(null)}>✕</button>
            </div>

            <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>{previewProduct.title}</h2>
            <p className="sub-text" style={{ lineHeight: '1.5', marginBottom: '1.25rem' }}>{previewProduct.description}</p>

            {/* Included highlights */}
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '1rem', border: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#374151' }}>What’s Included:</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: '#4b5563', lineHeight: '1.6' }}>
                {previewProduct.type === 'meal_plan' && (
                  <>
                    <li>7-day structured plant-based meal schedule (Breakfast, Lunch, Dinner)</li>
                    <li>Simple ingredients list & balanced macros</li>
                    <li>Allergen & customization guidance</li>
                  </>
                )}
                {previewProduct.type === 'workout_plan' && (
                  <>
                    <li>4-week progressive training breakdown (3 sessions/week)</li>
                    <li>Pacing benchmarks calibrated to your recovery rate</li>
                    <li>Mobility & breathing cues for safe progression</li>
                  </>
                )}
                {previewProduct.type === 'article' && (
                  <>
                    <li>Full expert-reviewed wellness guide</li>
                    <li>Circadian, physiological, and metabolic breakdowns</li>
                    <li>Actionable daily habit changes</li>
                  </>
                )}
              </ul>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#6b7280', display: 'block' }}>One-time payment</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
                  {previewProduct.price_cents === 0 ? 'Free' : `SGD $${(previewProduct.price_cents / 100).toFixed(2)}`}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Icon name="shield" size={16} /> Instant simulated receipt
              </div>
            </div>

            <button
              type="button"
              className="submit-btn"
              style={{ width: '100%', padding: '0.75rem', fontSize: '1.05rem' }}
              disabled={busyIds.has(previewProduct.id)}
              onClick={() => handlePurchase(previewProduct)}
            >
              {busyIds.has(previewProduct.id) ? 'Processing Order...' : `Confirm & Unlock (${previewProduct.price_cents === 0 ? 'Free' : `SGD $${(previewProduct.price_cents / 100).toFixed(2)}`})`}
            </button>
          </div>
        </div>
      )}

      {/* PURCHASE SUCCESS MODAL */}
      {showPurchaseSuccess && (
        <div className="modal-overlay" onClick={() => setShowPurchaseSuccess(null)}>
          <div className="modal" style={{ maxWidth: '440px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <Icon name="check" size={30} />
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0' }}>Item Unlocked!</h2>
            <p className="sub-text" style={{ marginBottom: '1.5rem' }}>
              <strong>{showPurchaseSuccess.title}</strong> has been added to your library.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="submit-btn"
                onClick={() => {
                  const p = showPurchaseSuccess;
                  setShowPurchaseSuccess(null);
                  setActiveReadingProduct(p);
                }}
              >
                Read / View Now
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowPurchaseSuccess(null)}>
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RICH CONTENT READER VIEW (For Owned Products) */}
      {activeReadingProduct && (
        <div className="modal-overlay" onClick={() => setActiveReadingProduct(null)}>
          <div className="modal" style={{ maxWidth: '720px', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                  {getCategoryLabel(activeReadingProduct.type)}
                </span>
                <h2 style={{ margin: '0.25rem 0 0 0' }}>{activeReadingProduct.title}</h2>
              </div>
              <button type="button" className="btn-outline" style={{ padding: '0.25rem 0.6rem' }} onClick={() => setActiveReadingProduct(null)}>✕</button>
            </div>

            {/* Non-clinical banner */}
            <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Healthy360 Non-Clinical Notice: General lifestyle ideas only. Always verify ingredients and exercise pacing with your healthcare professional.
            </div>

            {/* Meal Plan Reader View */}
            {activeReadingProduct.type === 'meal_plan' && (
              <div>
                <h3 style={{ marginBottom: '1rem' }}>7-Day Meal Schedule</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(activeReadingProduct.content?.days || []).map((day) => (
                    <div key={day.day} style={{ background: '#f9fafb', borderRadius: '8px', padding: '1rem', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#065f46' }}>Day {day.day}</h4>
                      <p style={{ margin: '0.35rem 0', fontSize: '0.95rem' }}><strong>🍳 Breakfast:</strong> {day.breakfast}</p>
                      <p style={{ margin: '0.35rem 0', fontSize: '0.95rem' }}><strong>🥗 Lunch:</strong> {day.lunch}</p>
                      <p style={{ margin: '0.35rem 0', fontSize: '0.95rem' }}><strong>🍲 Dinner:</strong> {day.dinner}</p>
                    </div>
                  ))}
                  {(!activeReadingProduct.content?.days || activeReadingProduct.content?.days.length === 0) && (
                    <div className="card">
                      <p>{activeReadingProduct.description}</p>
                      <p className="sub-text">{activeReadingProduct.content?.notes || 'Complete recipes included in PDF guide.'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Workout Plan Reader View */}
            {activeReadingProduct.type === 'workout_plan' && (
              <div>
                <h3 style={{ marginBottom: '1rem' }}>Progressive Training Program</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(activeReadingProduct.content?.weeks || []).map((week) => (
                    <div key={week.week} style={{ background: '#f9fafb', borderRadius: '8px', padding: '1rem', border: '1px solid #e5e7eb' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#065f46' }}>Week {week.week}</h4>
                      <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, lineHeight: '1.6' }}>
                        {week.sessions.map((s, idx) => (
                          <li key={idx} style={{ margin: '0.35rem 0' }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {(!activeReadingProduct.content?.weeks || activeReadingProduct.content?.weeks.length === 0) && (
                    <div className="card">
                      <p>{activeReadingProduct.description}</p>
                      <p className="sub-text">{activeReadingProduct.content?.notes || 'Detailed exercise cues included in program.'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Article Reader View */}
            {activeReadingProduct.type === 'article' && (
              <div style={{ lineHeight: '1.7', color: '#374151' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 500, color: '#111827', marginBottom: '1.5rem' }}>
                  {activeReadingProduct.content?.summary || activeReadingProduct.description}
                </p>
                {(activeReadingProduct.content?.sections || []).map((sec, idx) => (
                  <div key={idx} style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '1.15rem', color: '#111827', margin: '0 0 0.5rem 0' }}>{sec.heading}</h4>
                    <p style={{ margin: 0 }}>{sec.body}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '2rem', textAlign: 'right' }}>
              <button type="button" className="submit-btn" onClick={() => setActiveReadingProduct(null)}>Done Reading</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
