import { useState, useRef, useMemo } from 'react';
import { useWorkout, MODALITIES, INTENSITIES } from '../../context/WorkoutContext';
import { useApp } from '../../context/AppContext';
import { saveActivity } from '../../api';
import Icon from '../Icon';

// Helper to compress images to crisp lightweight JPEG data URLs
async function compressImage(file, maxDimension = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

const RPE_DESCRIPTIONS = {
  1: '1 - Very Light (Gentle stroll, bare minimal effort)',
  2: '2 - Light (Warm-up pace, conversational)',
  3: '3 - Moderate-Light (Comfortable aerobic pacing)',
  4: '4 - Moderate (Steady aerobic effort)',
  5: '5 - Somewhat Hard (Noticeable breathing)',
  6: '6 - Hard (Challenging tempo, heavy breathing)',
  7: '7 - Vigorous (Borderline threshold pace)',
  8: '8 - Very Hard (Deep strain, difficult to talk)',
  9: '9 - Extremely Hard (Near maximum heart rate)',
  10: '10 - Maximum Effort (All-out sprint, absolute limit)',
};

export default function WorkoutSummaryModal() {
  const { latest, updateRecommendationAdherence } = useApp();
  const {
    status,
    summaryData,
    discardWorkout,
    completeAndSaved,
  } = useWorkout();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [imageProcessing, setImageProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Initialize form state when summaryData arrives
  if (status === 'finished' && summaryData && (!form || form.initializedId !== summaryData.title)) {
    setForm({
      initializedId: summaryData.title,
      title: summaryData.title || 'Workout Session',
      modalityId: summaryData.modalityId || 'running',
      date: summaryData.date || new Date().toISOString().slice(0, 10),
      durationMinutes: summaryData.durationMinutes || 1,
      calories: summaryData.calories || 0,
      distanceKm: summaryData.distanceKm || '',
      intensity: summaryData.intensity || 'moderate',
      rpeScore: summaryData.rpeScore || 6,
      adherenceStatus: summaryData.adherenceStatus || 'completed',
      recommendationId: summaryData.recommendationId || null,
      notes: summaryData.notes || '',
      imageData: summaryData.imageData || null,
    });
  }

  // Calculate training load (duration * RPE)
  const trainingLoad = useMemo(() => {
    if (!form) return 0;
    const dur = Number(form.durationMinutes) || 0;
    const rpe = Number(form.rpeScore) || 5;
    return dur * rpe;
  }, [form]);

  // Live XAI Guardrail Warning computation for RPE and Intensity
  const guardrailWarning = useMemo(() => {
    if (!latest || !form) return null;
    const isHighStrain = form.modalityId === 'hiit' || form.intensity === 'vigorous' || Number(form.rpeScore) >= 8;

    if (latest.plan_level === 0 || (latest.recommendation && latest.recommendation.toLowerCase().includes('recovery'))) {
      if (isHighStrain) {
        const factors = Array.isArray(latest.shap_factors) ? latest.shap_factors : [];
        const sleepF = factors.find((f) => f.key === 'sleep');
        const hrF = factors.find((f) => f.key === 'heartRate');
        const sleepStr = sleepF ? `sleep deficit (${sleepF.impact >= 0 ? `-${sleepF.impact}%` : `${sleepF.impact}%`})` : 'sleep deficit (-45%)';
        const hrStr = hrF ? `elevated resting HR (${hrF.impact >= 0 ? `-${hrF.impact}%` : `${hrF.impact}%`})` : 'elevated resting HR (-30%)';

        return {
          title: 'Safety Nudge',
          text: `Today's model weighted your ${sleepStr} and ${hrStr} toward recovery. Pushing at high intensity (RPE ${form.rpeScore}/10) today increases burnout risk.`,
        };
      }
    }
    return null;
  }, [latest, form]);

  if (status !== 'finished' || !summaryData || !form) {
    return null;
  }

  const activeModObj = MODALITIES.find((m) => m.id === form.modalityId) || MODALITIES[0];

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setImageProcessing(true);
    try {
      const compressed = await compressImage(file);
      setForm((prev) => ({ ...prev, imageData: compressed }));
    } catch (err) {
      setError(err.message || 'Could not process photo.');
    } finally {
      setImageProcessing(false);
    }
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, imageData: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || 'Workout Session',
        date: form.date,
        duration: form.durationMinutes ? Number(form.durationMinutes) : 1,
        notes: form.notes.trim(),
        workout_type: form.modalityId,
        calories: form.calories ? Number(form.calories) : null,
        distance_km: form.distanceKm ? Number(form.distanceKm) : null,
        intensity: form.intensity,
        rpe_score: Number(form.rpeScore) || 6,
        training_load: trainingLoad,
        adherence_status: form.adherenceStatus,
        recommendation_id: form.recommendationId,
        image_data: form.imageData,
      };

      await saveActivity(payload);
      if (form.recommendationId && updateRecommendationAdherence) {
        updateRecommendationAdherence(form.recommendationId, form.adherenceStatus);
      }
      setSaving(false);
      completeAndSaved();
    } catch (err) {
      setError(err.message || 'Failed to save workout.');
      setSaving(false);
    }
  };

  return (
    <div className="workout-summary-overlay" role="dialog" aria-modal="true" aria-label="Workout Summary and Save">
      <div className="workout-summary-card">
        {/* Header */}
        <div className="workout-summary-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🎉</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>Workout Complete!</h2>
              <p className="sub-text" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
                Review session stats, log your RPE exertion, add photo or comments, and save to your history.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="workout-fs-close-btn"
            style={{ color: '#64748b' }}
            onClick={() => {
              if (window.confirm('Discard workout without saving?')) discardWorkout();
            }}
            title="Discard"
          >
            ✕
          </button>
        </div>

        {error && <div className="alert-error" role="alert">{error}</div>}

        {/* Live XAI Guardrail Warning Banner */}
        {guardrailWarning && (
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #ef4444',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              color: '#991b1b',
              fontSize: '0.85rem',
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
              ⚠️ {guardrailWarning.title}
            </strong>
            <span>{guardrailWarning.text}</span>
          </div>
        )}

        {/* Quick Highlights Telemetry Strip with Training Load */}
        <div className="workout-summary-stat-strip">
          <div className="summary-stat-box">
            <span className="summary-stat-lbl">DURATION</span>
            <span className="summary-stat-val">{form.durationMinutes} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>min</span></span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-lbl">CALORIES BURNED</span>
            <span className="summary-stat-val" style={{ color: '#dc2626' }}>
              🔥 {form.calories} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>kcal</span>
            </span>
          </div>
          <div className="summary-stat-box">
            <span className="summary-stat-lbl">TRAINING LOAD</span>
            <span className="summary-stat-val" style={{ color: trainingLoad >= 250 ? '#dc2626' : '#2563eb' }}>
              {trainingLoad} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>units</span>
            </span>
          </div>
          {activeModObj.distance && form.distanceKm && (
            <div className="summary-stat-box">
              <span className="summary-stat-lbl">DISTANCE</span>
              <span className="summary-stat-val" style={{ color: '#059669' }}>
                📍 {form.distanceKm} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>km</span>
              </span>
            </div>
          )}
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            <div className="form-group">
              <label htmlFor="summary-title">Workout Title</label>
              <input
                id="summary-title"
                type="text"
                required
                maxLength={150}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="summary-modality">Workout Type</label>
              <select
                id="summary-modality"
                value={form.modalityId}
                onChange={(e) => setForm({ ...form, modalityId: e.target.value })}
              >
                {MODALITIES.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.icon} {mod.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group">
              <label htmlFor="summary-duration">Duration (Minutes)</label>
              <input
                id="summary-duration"
                type="number"
                min="1"
                max="1440"
                required
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="summary-calories">Calories (kcal)</label>
              <input
                id="summary-calories"
                type="number"
                min="0"
                max="20000"
                value={form.calories}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
              />
            </div>
            {activeModObj.distance && (
              <div className="form-group">
                <label htmlFor="summary-distance">Distance (km)</label>
                <input
                  id="summary-distance"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000"
                  placeholder="e.g. 5.2"
                  value={form.distanceKm}
                  onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="summary-intensity">Intensity Cap</label>
              <select
                id="summary-intensity"
                value={form.intensity}
                onChange={(e) => setForm({ ...form, intensity: e.target.value })}
              >
                {INTENSITIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rate of Perceived Exertion (RPE 1-10) Slider & Rating */}
          <div className="form-group" style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label htmlFor="summary-rpe" style={{ fontWeight: 700, color: '#1e293b' }}>
                Rate of Perceived Exertion (RPE 1–10)
              </label>
              <span style={{
                fontWeight: 800,
                fontSize: '1.05rem',
                color: form.rpeScore >= 8 ? '#dc2626' : form.rpeScore >= 5 ? '#d97706' : '#10b981',
              }}>
                RPE {form.rpeScore} / 10
              </span>
            </div>
            <input
              id="summary-rpe"
              type="range"
              min="1"
              max="10"
              step="1"
              value={form.rpeScore}
              onChange={(e) => setForm({ ...form, rpeScore: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.8rem', color: '#64748b' }}>
              <span>{RPE_DESCRIPTIONS[form.rpeScore]}</span>
              <span style={{ fontWeight: 600 }}>Load: {trainingLoad} units</span>
            </div>
          </div>

          {/* Adherence Status */}
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
              Plan Adherence:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
              {[
                { id: 'completed', label: '✓ Completed' },
                { id: 'modified', label: '~ Modified' },
                { id: 'skipped', label: '✕ Skipped / Changed' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setForm({ ...form, adherenceStatus: item.id })}
                  style={{
                    padding: '0.5rem 0.6rem',
                    borderRadius: '8px',
                    border: `1.5px solid ${form.adherenceStatus === item.id ? '#10b981' : '#cbd5e1'}`,
                    background: form.adherenceStatus === item.id ? '#ecfdf5' : '#ffffff',
                    color: form.adherenceStatus === item.id ? '#065f46' : '#334155',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Picture / Photo Attachment Section */}
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Workout Photo / Picture (Optional)</span>
              {imageProcessing && <span style={{ fontSize: '0.8rem', color: '#2563eb' }}>Processing photo...</span>}
            </label>

            {form.imageData ? (
              <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.25rem' }}>
                <img
                  src={form.imageData}
                  alt="Workout capture"
                  style={{
                    maxHeight: '160px',
                    maxWidth: '100%',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    border: '1.5px solid #cbd5e1',
                  }}
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.85rem',
                  }}
                  title="Remove photo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '12px',
                  padding: '1.1rem',
                  textAlign: 'center',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  transition: 'background-color 140ms ease',
                }}
              >
                <div style={{ fontSize: '1.6rem', marginBottom: '0.2rem' }}>📸</div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2563eb' }}>
                  Click to add a workout photo or scenery
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageSelect}
                />
              </div>
            )}
          </div>

          {/* Comments / Notes */}
          <div className="form-group">
            <label htmlFor="summary-notes">Comments & Reflections (Optional)</label>
            <textarea
              id="summary-notes"
              rows={2}
              maxLength={1000}
              placeholder="How did this workout feel? Weather, pace notes, route, or equipment used..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {/* Bottom Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-outline"
              disabled={saving}
              onClick={() => {
                if (window.confirm('Discard workout without saving?')) discardWorkout();
              }}
            >
              Discard
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={saving || imageProcessing}
              style={{ width: 'auto', padding: '0.65rem 1.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Icon name="check" size={16} />
              {saving ? 'Saving...' : 'Save to Workout History'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
