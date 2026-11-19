import { useEffect, useState, useMemo, useRef } from 'react';
import { deleteActivity, getActivities, saveActivity } from '../api';
import { useWorkout, MODALITIES, INTENSITIES, calculateCalories, formatStopwatch } from '../context/WorkoutContext';
import Icon from './Icon';

const QUICK_DURATIONS = [15, 30, 45, 60, 90];
const todayIso = () => new Date().toISOString().slice(0, 10);

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

export default function ActivityLog() {
  const {
    isActive,
    status,
    seconds,
    currentCalories,
    activeModality,
    lastSavedTimestamp,
    startWorkout,
    maximizeWorkout,
    pauseWorkout,
    resumeWorkout,
    stopAndFinish,
  } = useWorkout();

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Top Tracker Mode: 'live' or 'quick'
  const [trackerMode, setTrackerMode] = useState('live');

  // Selected modality for starting a new live workout
  const [selectedLiveModality, setSelectedLiveModality] = useState('running');
  const [selectedLiveIntensity, setSelectedLiveIntensity] = useState('moderate');

  // Quick Log State
  const [quickModality, setQuickModality] = useState('running');
  const [quickForm, setQuickForm] = useState({
    date: todayIso(),
    title: 'Running Workout',
    duration: '30',
    calories: '',
    distance_km: '',
    intensity: 'moderate',
    notes: '',
    imageData: null,
  });
  const [quickImageProcessing, setQuickImageProcessing] = useState(false);
  const quickFileInputRef = useRef(null);

  // Calendar & History View State
  const [historyView, setHistoryView] = useState('calendar'); // 'calendar' | 'list'
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [historySort, setHistorySort] = useState('date-desc');
  const [historyFilterModality, setHistoryFilterModality] = useState('all');

  // Photo viewer modal state
  const [viewingPhoto, setViewingPhoto] = useState(null);

  const fetchActivities = () => {
    getActivities()
      .then((result) => {
        setActivities(result.activities || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  // Load activities on mount and whenever a workout is saved
  useEffect(() => {
    fetchActivities();
  }, [lastSavedTimestamp]);

  // Launch Full-Screen Workout
  const handleLaunchLiveWorkout = () => {
    startWorkout(selectedLiveModality, selectedLiveIntensity);
  };

  // Quick Log Modality Change
  const handleQuickModalityChange = (modId) => {
    setQuickModality(modId);
    const mod = MODALITIES.find((m) => m.id === modId);
    const title = mod ? `${mod.label} Workout` : 'Workout';
    const mins = Number(quickForm.duration) || 30;
    const cal = calculateCalories(mod?.met || 5.0, mins, quickForm.intensity);
    setQuickForm((prev) => ({
      ...prev,
      title,
      calories: String(cal),
    }));
  };

  // Quick Log Duration Change
  const handleQuickDurationChange = (durMins) => {
    const mod = MODALITIES.find((m) => m.id === quickModality);
    const cal = calculateCalories(mod?.met || 5.0, durMins, quickForm.intensity);
    setQuickForm((prev) => ({
      ...prev,
      duration: String(durMins),
      calories: String(cal),
    }));
  };

  const handleQuickImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setQuickImageProcessing(true);
    try {
      const compressed = await compressImage(file);
      setQuickForm((prev) => ({ ...prev, imageData: compressed }));
    } catch (err) {
      setError(err.message || 'Could not process photo.');
    } finally {
      setQuickImageProcessing(false);
    }
  };

  const handleQuickRemoveImage = () => {
    setQuickForm((prev) => ({ ...prev, imageData: null }));
    if (quickFileInputRef.current) quickFileInputRef.current.value = '';
  };

  // Quick Log Submit
  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const mod = MODALITIES.find((m) => m.id === quickModality);
      const mins = quickForm.duration === '' ? null : Number(quickForm.duration);
      const estCal = mins ? calculateCalories(mod?.met || 5.0, mins, quickForm.intensity) : null;
      const finalCal = quickForm.calories ? Number(quickForm.calories) : estCal;

      const payload = {
        title: quickForm.title.trim() || (mod ? `${mod.label} Workout` : 'Workout'),
        date: quickForm.date || todayIso(),
        duration: mins,
        notes: quickForm.notes.trim(),
        workout_type: quickModality,
        calories: finalCal,
        distance_km: quickForm.distance_km ? Number(quickForm.distance_km) : null,
        intensity: quickForm.intensity,
        image_data: quickForm.imageData,
      };

      const result = await saveActivity(payload);
      setActivities(result.activities);
      setQuickForm({
        date: quickForm.date,
        title: mod ? `${mod.label} Workout` : 'Workout',
        duration: '30',
        calories: '',
        distance_km: '',
        intensity: 'moderate',
        notes: '',
        imageData: null,
      });
      if (quickFileInputRef.current) quickFileInputRef.current.value = '';
      setMessage('Activity successfully logged.');
    } catch (err) {
      setError(err.message || 'Could not log activity.');
    }
  };

  // Delete Activity
  const handleDeleteActivity = async (id) => {
    if (!window.confirm('Delete this workout from history?')) return;
    setError('');
    setMessage('');
    try {
      await deleteActivity(id);
      setActivities((current) => current.filter((entry) => entry.id !== id));
      setMessage('Workout deleted from history.');
    } catch (err) {
      setError(err.message || 'Could not delete workout.');
    }
  };

  // Helper: infer modality if missing in legacy records
  const getActivityModality = (item) => {
    if (item.workout_type) {
      const found = MODALITIES.find((m) => m.id === item.workout_type);
      if (found) return found;
    }
    const titleLower = (item.title || '').toLowerCase();
    for (const mod of MODALITIES) {
      if (titleLower.includes(mod.id) || titleLower.includes(mod.label.toLowerCase())) {
        return mod;
      }
    }
    return MODALITIES.find((m) => m.id === 'other');
  };

  // Summary Metrics Aggregations
  const summaryStats = useMemo(() => {
    const totalCount = activities.length;
    let totalMinutes = 0;
    let totalCalories = 0;
    let totalDistance = 0;

    activities.forEach((act) => {
      if (act.duration) totalMinutes += act.duration;
      if (act.calories) {
        totalCalories += act.calories;
      } else if (act.duration) {
        const mod = getActivityModality(act);
        totalCalories += calculateCalories(mod.met, act.duration, act.intensity || 'moderate');
      }
      if (act.distance_km) totalDistance += act.distance_km;
    });

    return {
      count: totalCount,
      minutes: totalMinutes,
      hours: (totalMinutes / 60).toFixed(1),
      calories: totalCalories,
      distance: totalDistance > 0 ? totalDistance.toFixed(1) : null,
    };
  }, [activities]);

  // Calendar Calculations
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ empty: true, key: `empty-${i}` });
    }

    const todayStr = todayIso();

    for (let d = 1; d <= daysInMonth; d++) {
      const monthPad = String(month + 1).padStart(2, '0');
      const dayPad = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthPad}-${dayPad}`;
      const dayActivities = activities.filter((a) => a.date === dateStr);

      days.push({
        empty: false,
        dayNum: d,
        dateStr,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedCalendarDate,
        activities: dayActivities,
        count: dayActivities.length,
        key: dateStr,
      });
    }

    return days;
  }, [calendarMonth, activities, selectedCalendarDate]);

  const monthLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  const handlePrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleJumpToday = () => {
    const d = new Date();
    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedCalendarDate(todayIso());
  };

  // Filter & Sort Activities for List View or Calendar Selection
  const processedActivities = useMemo(() => {
    let list = [...activities];

    // Filter by date if a calendar date is picked
    if (selectedCalendarDate) {
      list = list.filter((a) => a.date === selectedCalendarDate);
    }

    // Filter by modality
    if (historyFilterModality !== 'all') {
      list = list.filter((a) => {
        const mod = getActivityModality(a);
        return mod.id === historyFilterModality;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (historySort === 'date-desc') {
        return (b.date || '').localeCompare(a.date || '') || (b.id - a.id);
      }
      if (historySort === 'date-asc') {
        return (a.date || '').localeCompare(b.date || '') || (a.id - b.id);
      }
      if (historySort === 'duration-desc') {
        return (b.duration || 0) - (a.duration || 0);
      }
      if (historySort === 'duration-asc') {
        return (a.duration || 0) - (b.duration || 0);
      }
      if (historySort === 'calories-desc') {
        const calA = a.calories || calculateCalories(getActivityModality(a).met, a.duration || 0);
        const calB = b.calories || calculateCalories(getActivityModality(b).met, b.duration || 0);
        return calB - calA;
      }
      return 0;
    });

    return list;
  }, [activities, selectedCalendarDate, historyFilterModality, historySort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Flash Messages */}
      {error && <div className="alert-error" role="alert">{error}</div>}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '8px' }} role="status">
          ✓ {message}
        </div>
      )}

      {/* ACTIVE WORKOUT RUNNING BANNER (If a session is active in background) */}
      {isActive && status !== 'finished' && (
        <div className="workout-active-in-progress-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '2rem' }}>{activeModality.icon}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                  {activeModality.label} Session Active
                </strong>
                <span className={`workout-floating-badge ${status}`} style={{ background: status === 'running' ? '#10b981' : '#f59e0b', color: '#fff' }}>
                  {status === 'running' ? '● RECORDING' : '❚❚ PAUSED'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.2rem', fontSize: '0.9rem', color: '#475569' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatStopwatch(seconds)}</span>
                <span>🔥 {currentCalories} kcal</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {status === 'running' ? (
              <button type="button" className="btn-outline btn-sm" onClick={pauseWorkout}>
                <Icon name="pause" size={14} /> Pause
              </button>
            ) : (
              <button type="button" className="btn-outline btn-sm" onClick={resumeWorkout}>
                <Icon name="play" size={14} /> Resume
              </button>
            )}
            <button type="button" className="btn-outline btn-sm" onClick={stopAndFinish}>
              <Icon name="check" size={14} /> Finish
            </button>
            <button type="submit" className="submit-btn btn-sm" onClick={maximizeWorkout} style={{ width: 'auto' }}>
              Maximize Full Screen ⛶
            </button>
          </div>
        </div>
      )}

      {/* SECTION 1: WORKOUT LAUNCHER & QUICK LOGGER */}
      <section className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Record Workout</h2>
            <p className="sub-text" style={{ margin: '0.2rem 0 0' }}>
              Choose a workout type to launch full-screen immersion tracker or quick-log past sessions.
            </p>
          </div>

          {/* Tracker Mode Toggle */}
          <div className="segmented-nav-bar" style={{ minWidth: '280px' }}>
            <button
              type="button"
              className={`segmented-nav-btn ${trackerMode === 'live' ? 'active' : ''}`}
              onClick={() => setTrackerMode('live')}
            >
              <Icon name="clock" size={16} /> Live Tracker
            </button>
            <button
              type="button"
              className={`segmented-nav-btn ${trackerMode === 'quick' ? 'active' : ''}`}
              onClick={() => setTrackerMode('quick')}
            >
              <Icon name="activity" size={16} /> Quick Log
            </button>
          </div>
        </div>

        {/* 1A: LIVE WORKOUT LAUNCHPAD */}
        {trackerMode === 'live' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                1. Select Workout Type:
              </label>
              <div className="modality-chips-grid">
                {MODALITIES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className={`modality-chip-btn ${selectedLiveModality === mod.id ? 'selected' : ''}`}
                    onClick={() => setSelectedLiveModality(mod.id)}
                  >
                    <span className="modality-icon-large">{mod.icon}</span>
                    <span className="modality-title">{mod.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                2. Target Effort / Intensity:
              </label>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {INTENSITIES.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className={`duration-chip-btn ${selectedLiveIntensity === i.id ? 'selected' : ''}`}
                    onClick={() => setSelectedLiveIntensity(i.id)}
                    style={{ padding: '0.55rem 1rem' }}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: '16px',
              padding: '1.5rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 8px 20px -4px rgba(15, 23, 42, 0.25)',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.8rem' }}>
                    {MODALITIES.find((m) => m.id === selectedLiveModality)?.icon}
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ffffff' }}>
                      Ready for {MODALITIES.find((m) => m.id === selectedLiveModality)?.label}?
                    </h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                      Opens full-screen tracker with live stopwatch and calorie burn counter. Can be minimized to multitask anytime!
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="submit-btn"
                onClick={handleLaunchLiveWorkout}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  padding: '0.85rem 1.75rem',
                  width: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                }}
              >
                <Icon name="play" size={20} /> START WORKOUT (FULL SCREEN)
              </button>
            </div>
          </div>
        )}

        {/* 1B: QUICK LOG COMPLETED WORKOUT */}
        {trackerMode === 'quick' && (
          <form onSubmit={handleQuickSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                Workout Modality:
              </label>
              <div className="modality-chips-grid">
                {MODALITIES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className={`modality-chip-btn ${quickModality === mod.id ? 'selected' : ''}`}
                    onClick={() => handleQuickModalityChange(mod.id)}
                  >
                    <span className="modality-icon-large">{mod.icon}</span>
                    <span className="modality-title">{mod.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group">
                <label htmlFor="quick-date">Date</label>
                <input
                  id="quick-date"
                  type="date"
                  required
                  value={quickForm.date}
                  onChange={(e) => setQuickForm({ ...quickForm, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="quick-title">Workout Title</label>
                <input
                  id="quick-title"
                  type="text"
                  maxLength={150}
                  required
                  value={quickForm.title}
                  onChange={(e) => setQuickForm({ ...quickForm, title: e.target.value })}
                />
              </div>
            </div>

            {/* Quick Duration Buttons + Input */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label htmlFor="quick-duration">Duration (Minutes)</label>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Quick picks:</span>
              </div>
              <div className="duration-chips-row" style={{ marginBottom: '0.5rem' }}>
                {QUICK_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`duration-chip-btn ${Number(quickForm.duration) === d ? 'selected' : ''}`}
                    onClick={() => handleQuickDurationChange(d)}
                  >
                    +{d} min
                  </button>
                ))}
              </div>
              <input
                id="quick-duration"
                type="number"
                min="0"
                max="1440"
                value={quickForm.duration}
                onChange={(e) => handleQuickDurationChange(e.target.value)}
              />
            </div>

            {/* Intensity & Live Calorie Tracker Calculation */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group">
                <label htmlFor="quick-intensity">Effort / Intensity</label>
                <select
                  id="quick-intensity"
                  value={quickForm.intensity}
                  onChange={(e) => {
                    const newInt = e.target.value;
                    const mod = MODALITIES.find((m) => m.id === quickModality);
                    const mins = Number(quickForm.duration) || 0;
                    const cal = calculateCalories(mod?.met || 5.0, mins, newInt);
                    setQuickForm({ ...quickForm, intensity: newInt, calories: String(cal) });
                  }}
                >
                  {INTENSITIES.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="quick-calories">Calories (kcal)</label>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Auto-calculated</span>
                </div>
                <input
                  id="quick-calories"
                  type="number"
                  min="0"
                  max="20000"
                  placeholder="e.g. 240"
                  value={quickForm.calories}
                  onChange={(e) => setQuickForm({ ...quickForm, calories: e.target.value })}
                />
              </div>

              {MODALITIES.find((m) => m.id === quickModality)?.distance && (
                <div className="form-group">
                  <label htmlFor="quick-distance">Distance (km)</label>
                  <input
                    id="quick-distance"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    placeholder="e.g. 5.2"
                    value={quickForm.distance_km}
                    onChange={(e) => setQuickForm({ ...quickForm, distance_km: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Photo Attachment for Quick Log */}
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Attach Photo (Optional)</span>
                {quickImageProcessing && <span style={{ fontSize: '0.8rem', color: '#2563eb' }}>Processing...</span>}
              </label>
              {quickForm.imageData ? (
                <div style={{ position: 'relative', display: 'inline-block', marginTop: '0.25rem' }}>
                  <img
                    src={quickForm.imageData}
                    alt="Quick workout capture"
                    style={{ maxHeight: '140px', borderRadius: '10px', border: '1px solid #cbd5e1', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={handleQuickRemoveImage}
                    style={{
                      position: 'absolute', top: '6px', right: '6px', background: 'rgba(15, 23, 42, 0.8)',
                      color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px',
                      cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '0.75rem',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => quickFileInputRef.current?.click()}
                  style={{
                    border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '0.85rem', textAlign: 'center',
                    background: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem', color: '#2563eb', fontWeight: 600,
                  }}
                >
                  📸 Click to attach a workout photo
                  <input
                    ref={quickFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleQuickImageSelect}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="quick-notes">Workout Notes & Reflections (Optional)</label>
              <textarea
                id="quick-notes"
                rows={2}
                maxLength={1000}
                placeholder="How did the session feel? Pace, route, or equipment used."
                value={quickForm.notes}
                onChange={(e) => setQuickForm({ ...quickForm, notes: e.target.value })}
              />
            </div>

            <button type="submit" className="submit-btn" style={{ alignSelf: 'flex-start', minWidth: '160px' }}>
              Save Activity
            </button>
          </form>
        )}
      </section>

      {/* SECTION 2: WORKOUT HISTORY & CALENDAR */}
      <section className="card" style={{ padding: '1.5rem' }}>
        {/* Header & View Mode Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Activity History & Calendar</h2>
            <p className="sub-text" style={{ margin: '0.2rem 0 0' }}>
              Inspect past workouts, sort by performance, or view by calendar day.
            </p>
          </div>

          <div className="segmented-nav-bar" style={{ minWidth: '260px' }}>
            <button
              type="button"
              className={`segmented-nav-btn ${historyView === 'calendar' ? 'active' : ''}`}
              onClick={() => setHistoryView('calendar')}
            >
              <Icon name="calendar" size={16} /> Calendar View
            </button>
            <button
              type="button"
              className={`segmented-nav-btn ${historyView === 'list' ? 'active' : ''}`}
              onClick={() => {
                setHistoryView('list');
                setSelectedCalendarDate(null);
              }}
            >
              <Icon name="activity" size={16} /> Timeline List
            </button>
          </div>
        </div>

        {/* Aggregate Summary Stats */}
        <div className="workout-stats-banner">
          <div className="workout-stat-tile">
            <span className="workout-stat-tile-label"><Icon name="activity" size={14} /> Total Workouts</span>
            <span className="workout-stat-tile-val">{summaryStats.count}</span>
          </div>
          <div className="workout-stat-tile">
            <span className="workout-stat-tile-label"><Icon name="clock" size={14} /> Active Time</span>
            <span className="workout-stat-tile-val">{summaryStats.minutes} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>min</span></span>
          </div>
          <div className="workout-stat-tile">
            <span className="workout-stat-tile-label"><Icon name="flame" size={14} /> Total Burned</span>
            <span className="workout-stat-tile-val" style={{ color: '#dc2626' }}>
              {summaryStats.calories.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>kcal</span>
            </span>
          </div>
          {summaryStats.distance && (
            <div className="workout-stat-tile">
              <span className="workout-stat-tile-label"><Icon name="compass" size={14} /> Distance</span>
              <span className="workout-stat-tile-val" style={{ color: '#059669' }}>
                {summaryStats.distance} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>km</span>
              </span>
            </div>
          )}
        </div>

        {/* 2A: MONTHLY CALENDAR VIEW */}
        {historyView === 'calendar' && (
          <div className="calendar-card" style={{ marginBottom: '1.25rem' }}>
            <div className="calendar-header-nav">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="calendar-header-title">{monthLabel}</span>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={handleJumpToday}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                >
                  Today
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" className="btn-outline btn-sm" onClick={handlePrevMonth} aria-label="Previous month">
                  ← Prev
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={handleNextMonth} aria-label="Next month">
                  Next →
                </button>
              </div>
            </div>

            <div className="calendar-weekdays-row">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="calendar-days-grid">
              {calendarDays.map((cell) => {
                if (cell.empty) {
                  return <div key={cell.key} className="calendar-day-cell empty" />;
                }
                const hasWorkouts = cell.count > 0;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-day-cell ${cell.isToday ? 'today' : ''} ${cell.isSelected ? 'selected' : ''} ${hasWorkouts ? 'has-activities' : ''}`}
                    onClick={() => {
                      if (selectedCalendarDate === cell.dateStr) {
                        setSelectedCalendarDate(null);
                      } else {
                        setSelectedCalendarDate(cell.dateStr);
                      }
                    }}
                  >
                    <span className="day-num">{cell.dayNum}</span>
                    {hasWorkouts && (
                      <div className="day-dots">
                        <span className="day-badge-count">{cell.count}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter & Sorting Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          {selectedCalendarDate && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.88rem',
              color: '#1e40af',
            }}>
              <span>
                Showing workouts for <strong>{selectedCalendarDate}</strong> ({processedActivities.length} found)
              </span>
              <button
                type="button"
                className="btn-outline btn-sm"
                style={{ background: '#ffffff', fontSize: '0.75rem' }}
                onClick={() => setSelectedCalendarDate(null)}
              >
                Show all dates
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="filter-pills-scroll" style={{ flex: 1, minWidth: '220px' }}>
              <button
                type="button"
                className={`filter-pill-btn ${historyFilterModality === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryFilterModality('all')}
              >
                All Workouts
              </button>
              {MODALITIES.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  className={`filter-pill-btn ${historyFilterModality === mod.id ? 'active' : ''}`}
                  onClick={() => setHistoryFilterModality(mod.id)}
                >
                  {mod.icon} {mod.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label htmlFor="history-sort-select" style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                Sort:
              </label>
              <select
                id="history-sort-select"
                value={historySort}
                onChange={(e) => setHistorySort(e.target.value)}
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="date-desc">Date (Newest first)</option>
                <option value="date-asc">Date (Oldest first)</option>
                <option value="duration-desc">Duration (Longest first)</option>
                <option value="duration-asc">Duration (Shortest first)</option>
                <option value="calories-desc">Calories (Highest burn)</option>
              </select>
            </div>
          </div>
        </div>

        {/* WORKOUT LIST CARDS */}
        {loading && <p className="sub-text">Loading workout logs...</p>}

        {!loading && processedActivities.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: '2.5rem' }}>🏃</span>
            <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.1rem' }}>No workouts recorded yet</h3>
            <p className="sub-text" style={{ margin: 0 }}>
              {selectedCalendarDate ? 'No sessions logged on this date.' : 'Use the tracker above to log your first activity!'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {processedActivities.map((entry) => {
            const mod = getActivityModality(entry);
            const entryCal = entry.calories || (entry.duration ? calculateCalories(mod.met, entry.duration, entry.intensity || 'moderate') : null);

            return (
              <div key={entry.id} className="activity-item-card">
                <div className="activity-item-left">
                  <div className="activity-modality-avatar" style={{ background: `${mod.color}18`, color: mod.color }}>
                    {mod.icon}
                  </div>
                  <div className="activity-item-meta" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="activity-item-title">{entry.title}</span>
                      {entry.image_data && (
                        <span
                          style={{ fontSize: '0.75rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          onClick={() => setViewingPhoto(entry.image_data)}
                          title="Click to view workout photo"
                        >
                          📸 Photo
                        </span>
                      )}
                    </div>

                    <div className="activity-item-sub">
                      <span>{entry.date}</span>
                      {entry.duration !== null && (
                        <span className="activity-stat-chip dur">
                          <Icon name="clock" size={12} /> {entry.duration} min
                        </span>
                      )}
                      {entryCal && (
                        <span className="activity-stat-chip cal">
                          🔥 {entryCal} kcal
                        </span>
                      )}
                      {entry.distance_km && (
                        <span className="activity-stat-chip dist">
                          📍 {entry.distance_km} km
                        </span>
                      )}
                      {entry.intensity && (
                        <span style={{ textTransform: 'capitalize', fontSize: '0.75rem', color: '#64748b' }}>
                          • {entry.intensity} effort
                        </span>
                      )}
                    </div>

                    {entry.notes && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.4 }}>
                        {entry.notes}
                      </p>
                    )}

                    {entry.image_data && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <img
                          src={entry.image_data}
                          alt="Workout thumbnail"
                          onClick={() => setViewingPhoto(entry.image_data)}
                          style={{ height: '70px', borderRadius: '8px', cursor: 'pointer', objectFit: 'cover', border: '1px solid #cbd5e1' }}
                          title="Click to view full photo"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-outline btn-sm"
                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '0.3rem 0.65rem' }}
                  onClick={() => handleDeleteActivity(entry.id)}
                  title="Delete workout"
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Full Photo Modal Preview */}
      {viewingPhoto && (
        <div
          className="workout-fullscreen-overlay"
          style={{ background: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setViewingPhoto(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={viewingPhoto}
              alt="Full workout photo"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
            />
            <button
              type="button"
              onClick={() => setViewingPhoto(null)}
              style={{
                position: 'absolute', top: '-14px', right: '-14px', background: '#ffffff', color: '#0f172a',
                border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer',
                fontWeight: 700, fontSize: '1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
