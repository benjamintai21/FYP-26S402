import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  generatePremiumPlan,
  getGoalInsights,
  getPremiumArticles,
  getPremiumPlans,
  deletePremiumPlan,
} from '../api';
import Icon from '../components/Icon';

const SAMPLE_PREVIEWS = {
  workout: {
    title: 'Aerobic Zone 2 Power Walk (Walking · 30m)',
    details: {
      modality: 'walking',
      focus: 'Cardiovascular Endurance',
      intensityZone: 'Zone 2 (115-135 bpm)',
      intensity: 'Moderate / Aerobic Base',
      recoveryRecommendation: 'Moderate Steady Pacing',
      items: [
        'Session 1 (Walking · 30 min): Steady-state brisk walk building aerobic base and cardiovascular endurance.',
        'Warm-up (3-5 min): 4 min dynamic warm-up: high knees, butt kicks, and torso twists.',
        'Main Workout (30 min): Brisk conversational pace (115-125 steps/min) in Heart Rate Zone 2.',
        'Cool-down & Flexibility: 3 min decelerating pace and calf wall stretch.',
      ],
      notes: 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.',
    },
  },
  meal: {
    title: 'Sustained Glycogen & Plant Power (Vegan)',
    details: {
      dietType: 'vegan',
      macroHighlight: '62g Protein · 220g Carbs · 48g Healthy Fats (~2,100 kcal)',
      recoveryRecommendation: 'Optimal Glycogen Replenishment',
      items: [
        'Breakfast: Spiced Tofu Scramble with bell peppers, baby spinach, nutritional yeast, and seeded toast.',
        'Lunch: Mediterranean Chickpea & Quinoa Bowl with diced cucumbers, cherry tomatoes, and kalamata olives.',
        'Recovery Snack: Raw energy trail mix with pumpkin seeds, dried cranberries, and almonds.',
        'Dinner: Hearty Black Bean & Lentil Chili with avocado slices and steamed brown rice.',
      ],
      notes: 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.',
    },
  },
};

export default function PremiumPage() {
  const { user } = useApp();
  const isPremium = user?.role === 'premium';

  const [plans, setPlans] = useState([]);
  const [articles, setArticles] = useState([]);
  const [insights, setInsights] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'workout' | 'meal'
  const [modality, setModality] = useState('walking');
  const [dietary, setDietary] = useState('vegan');
  const [duration, setDuration] = useState(30);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (isPremium) {
      Promise.all([getPremiumPlans(), getPremiumArticles(), getGoalInsights()])
        .then(([planData, articleData, insightData]) => {
          if (!active) return;
          setPlans(planData.plans || []);
          setArticles(articleData.articles || []);
          setInsights(insightData.insights || []);
        })
        .catch((err) => {
          if (active) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [isPremium]);

  const handleGenerate = async (type) => {
    setError('');
    setMessage('');
    setGenerating(true);
    try {
      const options = type === 'workout' ? { modality, duration } : { dietary };
      const res = await generatePremiumPlan(type, options);
      setPlans(res.plans || []);
      const newPlan = res.plans?.[0];
      setMessage(`Generated new ${type === 'workout' ? 'workout routine' : 'meal blueprint'}: "${newPlan?.title || 'Plan'}"`);
    } catch (err) {
      setError(err.message || 'Could not generate plan. Ensure you have logged a check-in today.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (planId) => {
    if (!window.confirm('Delete this plan from your history?')) return;
    setDeletingId(planId);
    setError('');
    try {
      await deletePremiumPlan(planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      setMessage('Plan removed from your library.');
    } catch (err) {
      setError(err.message || 'Failed to delete plan.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = (plan) => {
    const text = `${plan.title}\n\n${(plan.details?.items || []).join('\n')}\n\nNotes: ${plan.details?.notes || ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(plan.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredPlans =
    selectedCategory === 'all'
      ? plans
      : plans.filter((p) => p.type === selectedCategory);

  return (
    <main className="dashboard-container">
      {/* Header Banner */}
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          <Icon name="sparkles" size={14} /> Healthy360 Plus Studio
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>AI Workout & Nutrition Generators</h1>
            <p className="sub-text" style={{ margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
              Adaptive routines and whole-food meal blueprints calibrated to today's XGBoost recovery state.
            </p>
          </div>
          <span className={`role-badge role-${user?.role}`} style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}>
            {user?.role?.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Free Tier Preview & Upsell Gate */}
      {!isPremium && (
        <section
          className="card"
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            color: '#ffffff',
            padding: '1.75rem',
            borderRadius: '16px',
            marginBottom: '1.75rem',
            border: 'none',
          }}
        >
          <div style={{ maxWidth: '640px' }}>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em' }}>
              PLUS FEATURE SUITE
            </span>
            <h2 style={{ fontSize: '1.6rem', margin: '0.5rem 0', color: '#ffffff' }}>
              Unlock Unlimited Personalized Generators
            </h2>
            <p style={{ fontSize: '0.92rem', opacity: 0.9, lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              Healthy360 Plus members receive on-demand workout sessions (walking, cadence cycling, restorative yoga) with target heart rate zones and complete plant-based meal plans tailored to each day's recovery score.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link
                to="/subscription"
                className="submit-btn"
                style={{
                  background: '#ffffff',
                  color: '#065f46',
                  fontWeight: 700,
                  width: 'auto',
                  padding: '0.65rem 1.4rem',
                  fontSize: '0.95rem',
                }}
              >
                Upgrade to Plus ($9.90/mo) →
              </Link>
              <Link
                to="/subscription"
                className="btn-outline"
                style={{
                  color: '#ffffff',
                  borderColor: 'rgba(255,255,255,0.5)',
                  background: 'transparent',
                  padding: '0.65rem 1.2rem',
                  fontSize: '0.95rem',
                }}
              >
                View Full Benefit Matrix
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Feedback & Error Notices */}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontWeight: 500 }}>
          ✓ {message}
        </div>
      )}
      {error && <div className="alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* MAIN TWO-COLUMN STUDIO GRID */}
      <div className="content-grid">
        {/* LEFT COLUMN: INTERACTIVE GENERATORS & PLANS */}
        <div className="grid-col">
          {/* GENERATOR STUDIO CONTROLS */}
          <section className="card" style={{ border: '1.5px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>On-Demand Generator</h2>
                <p className="sub-text" style={{ margin: '0.15rem 0 0 0', fontSize: '0.85rem' }}>
                  Calibrated to your latest daily recovery level and target time
                </p>
              </div>
              <Icon name="refresh" size={20} style={{ color: '#059669' }} />
            </div>

            {/* Workout Generator Box */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                <Icon name="activity" size={16} /> 1. Generate Structured Workout
              </div>
              <div className="stats-2col-grid" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Modality
                  </label>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    <option value="walking">Walking (Zone 1/2)</option>
                    <option value="cycling">Cycling (Cadence Intervals)</option>
                    <option value="yoga">Yoga & Mobility Flow</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                    Target Duration
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    <option value={15}>15 Minutes (Express)</option>
                    <option value={30}>30 Minutes (Standard)</option>
                    <option value={45}>45 Minutes (Extended)</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="submit-btn"
                disabled={generating || !isPremium}
                onClick={() => handleGenerate('workout')}
                style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600 }}
              >
                {generating ? 'Generating Fresh Routine...' : '⚡ Generate New Workout Routine'}
              </button>
            </div>

            {/* Meal Plan Generator Box */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                <Icon name="sparkles" size={16} /> 2. Generate Plant-Based Meal Plan
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                  Dietary Style
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['vegan', 'vegetarian'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        borderRadius: '6px',
                        border: `1.5px solid ${dietary === d ? '#10b981' : '#cbd5e1'}`,
                        background: dietary === d ? '#ecfdf5' : '#ffffff',
                        color: dietary === d ? '#065f46' : '#475569',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                      onClick={() => setDietary(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                disabled={generating || !isPremium}
                onClick={() => handleGenerate('meal')}
                style={{ width: '100%', padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600 }}
              >
                {generating ? 'Formulating Menu...' : '🥗 Generate Daily Meal Blueprint'}
              </button>
            </div>
          </section>

          {/* PLANS SHOWCASE & HISTORY */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
                {isPremium ? `Your Plan Library (${plans.length})` : 'Sample Generated Plans (Preview)'}
              </h2>
              {isPremium && (
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'workout', label: 'Workouts' },
                    { id: 'meal', label: 'Meals' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className="btn-outline btn-sm"
                      style={{
                        background: selectedCategory === tab.id ? '#ecfdf5' : '#ffffff',
                        borderColor: selectedCategory === tab.id ? '#10b981' : '#cbd5e1',
                        color: selectedCategory === tab.id ? '#065f46' : '#64748b',
                      }}
                      onClick={() => setSelectedCategory(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Plans Rendering */}
            {isPremium ? (
              filteredPlans.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <Icon name="sparkles" size={32} style={{ color: '#94a3b8', margin: '0 auto 0.75rem auto' }} />
                  <h3 style={{ margin: '0 0 0.35rem 0' }}>No Plans Generated Yet</h3>
                  <p className="sub-text" style={{ margin: 0 }}>
                    Use the generator above to create your first customized workout routine or daily meal blueprint.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredPlans.map((plan) => {
                    const isWorkout = plan.type === 'workout';
                    return (
                      <article
                        key={plan.id}
                        className="card"
                        style={{
                          borderLeft: `4px solid ${isWorkout ? '#2563eb' : '#10b981'}`,
                          padding: '1.25rem',
                        }}
                      >
                        {/* Plan Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: isWorkout ? '#eff6ff' : '#ecfdf5', color: isWorkout ? '#1d4ed8' : '#065f46', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                              <Icon name={isWorkout ? 'activity' : 'sparkles'} size={12} /> {plan.type}
                            </div>
                            <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.25rem 0', color: '#0f172a' }}>{plan.title}</h3>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              onClick={() => handleCopy(plan)}
                            >
                              {copiedId === plan.id ? '✓ Copied' : 'Copy'}
                            </button>
                            <button
                              type="button"
                              className="btn-outline btn-sm"
                              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                              onClick={() => handleDelete(plan.id)}
                              disabled={deletingId === plan.id}
                            >
                              {deletingId === plan.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>

                        {/* Metadata Tagline */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.85rem' }}>
                          {plan.details?.intensityZone && (
                            <span style={{ background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              🎯 {plan.details.intensityZone}
                            </span>
                          )}
                          {plan.details?.focus && (
                            <span style={{ background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              ⚡ {plan.details.focus}
                            </span>
                          )}
                          {plan.details?.macroHighlight && (
                            <span style={{ background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              🥗 {plan.details.macroHighlight}
                            </span>
                          )}
                          {plan.details?.recoveryRecommendation && (
                            <span style={{ background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              🔄 Calibrated to: {plan.details.recoveryRecommendation}
                            </span>
                          )}
                        </div>

                        {/* Structured Items List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', background: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                          {(plan.details?.items || []).map((item, idx) => (
                            <div key={idx} style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.45 }}>
                              • {item}
                            </div>
                          ))}
                        </div>

                        {/* Non-clinical Disclaimer Note */}
                        {plan.details?.notes && (
                          <p className="sub-text" style={{ fontSize: '0.75rem', margin: '0.75rem 0 0 0', lineHeight: 1.4 }}>
                            {plan.details.notes}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )
            ) : (
              /* Non-premium sample display */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[SAMPLE_PREVIEWS.workout, SAMPLE_PREVIEWS.meal].map((sample, idx) => (
                  <article
                    key={idx}
                    className="card"
                    style={{
                      borderLeft: `4px solid ${idx === 0 ? '#2563eb' : '#10b981'}`,
                      padding: '1.25rem',
                      opacity: 0.9,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#f1f5f9', color: '#475569', textTransform: 'uppercase' }}>
                        Sample Routine (Preview)
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>Included in Plus</span>
                    </div>
                    <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.5rem 0' }}>{sample.title}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', background: '#f9fafb', padding: '0.85rem', borderRadius: '8px' }}>
                      {sample.details.items.map((it, i) => (
                        <div key={i} style={{ fontSize: '0.85rem', color: '#334155' }}>• {it}</div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: AI GOAL INSIGHTS & EDUCATIONAL ARTICLES */}
        <div className="grid-col">
          {/* AI GOAL PROGRESS SUGGESTIONS */}
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <Icon name="target" size={18} style={{ color: '#059669' }} />
              <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Adaptive Goal Suggestions</h2>
            </div>
            <p className="sub-text" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
              Progress-based algorithmic adjustments calculated from your active goals and fatigue logs.
            </p>

            {insights.length === 0 ? (
              <p className="sub-text" style={{ padding: '0.5rem 0' }}>
                No active goals detected. Set goals in the <Link to="/profile?tab=goals" style={{ color: '#059669', fontWeight: 600 }}>You Hub</Link> to generate AI adjustments.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {insights.map((insight, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#f8fafc',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{insight.goal}</strong>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: insight.progressPercent >= 100 ? '#059669' : '#2563eb' }}>
                        {insight.progressPercent}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ background: '#e2e8f0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                      <div
                        style={{
                          width: `${Math.min(100, insight.progressPercent)}%`,
                          height: '100%',
                          background: insight.progressPercent >= 100 ? '#10b981' : '#3b82f6',
                        }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.4 }}>
                      💡 {insight.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* APPROVED EDUCATIONAL ARTICLES LIBRARY */}
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <Icon name="book" size={18} style={{ color: '#059669' }} />
              <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Approved Recovery & Health Science</h2>
            </div>
            <p className="sub-text" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
              Expert-reviewed educational guides on sleep hygiene, parasympathetic recovery, and nutrition science.
            </p>

            {articles.length === 0 ? (
              <p className="sub-text" style={{ padding: '0.5rem 0' }}>
                No published articles available yet. Check back soon for approved scientific content.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {articles.map((article) => (
                  <article
                    key={article.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '0.85rem',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>
                      {article.category || 'Recovery Science'}
                    </span>
                    <h3 style={{ fontSize: '0.98rem', margin: '0.2rem 0 0.35rem 0', color: '#0f172a' }}>
                      {article.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                      {article.summary}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
