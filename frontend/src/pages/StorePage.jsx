import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getProducts, purchaseProduct, getPurchases } from '../api';

export default function StorePage() {
  const { user } = useApp();
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyIds, setBusyIds] = useState(new Set());

  useEffect(() => {
    let active = true;
    Promise.all([getProducts(), getPurchases()])
      .then(([productData, purchaseData]) => {
        if (!active) return;
        setProducts(productData.products);
        setPurchases(purchaseData.purchases);
      }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  const purchase = async (productId) => {
    setError('');
    setMessage('');
    setBusyIds(prev => new Set(prev).add(productId));
    try {
      const result = await purchaseProduct(productId);
      setMessage(result.message || 'Purchase successful!');
      setPurchases(prev => [...prev, result.purchase]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
    }
  };

  const isPurchased = (productId) => purchases.some(p => p.product_id === productId);
  const isPremiumUser = user?.role === 'premium';
  const availableProducts = products.filter(p => p.is_active && (!p.premium_only || isPremiumUser));

  return (
    <main className="dashboard-container">
      <header className="page-header"><h1>Store</h1><p>Browse and purchase meal plans, workout plans, and expert articles.</p></header>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}

      <section className="card">
        <h2>Available products</h2>
        <p className="sub-text">Non-clinical lifestyle content. Not medical advice.</p>
        {availableProducts.length === 0 && <p className="sub-text">No products available at the moment.</p>}
        <div className="content-grid">
          {availableProducts.map((product) => {
            const purchased = isPurchased(product.product_id);
            const priceText = product.price_cents === 0 ? 'Free' : `SGD ${(product.price_cents / 100).toFixed(2)}`;
            return (
              <section key={product.product_id} className="card">
                <h3>{product.title}</h3>
                <p className="sub-text">{product.description}</p>
                <p className="sub-text">Type: {product.product_type.replace('_', ' ')} · {priceText}</p>
                {purchased ? (
                  <button type="button" className="btn-primary" disabled>Owned</button>
                ) : product.premium_only && !isPremiumUser ? (
                  <button type="button" className="btn-outline" disabled>Premium only</button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busyIds.has(product.product_id)}
                    onClick={() => purchase(product.product_id)}
                  >
                    {busyIds.has(product.product_id) ? 'Purchasing...' : `Buy for ${priceText}`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Your purchases</h2>
        {purchases.length === 0 && <p className="sub-text">You haven't purchased any products yet.</p>}
        {purchases.map((purchase) => {
          const product = products.find(p => p.product_id === purchase.product_id);
          if (!product) return null;
          return (
            <div key={purchase.purchase_id} className="form-group">
              <strong>{product.title}</strong>
              <span className="sub-text">Purchased on {new Date(purchase.purchased_at).toLocaleDateString()} · {product.price_cents === 0 ? 'Free' : `SGD ${(product.price_cents / 100).toFixed(2)}`}</span>
              <details>
                <summary>View content</summary>
                <pre className="code-block">{JSON.stringify(product.content_json, null, 2)}</pre>
              </details>
            </div>
          );
        })}
      </section>
    </main>
  );
}