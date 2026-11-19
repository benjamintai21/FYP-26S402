import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export const MODALITIES = [
  { id: 'running', label: 'Running', icon: '🏃', met: 9.8, distance: true, color: '#ef4444' },
  { id: 'cycling', label: 'Cycling', icon: '🚴', met: 7.5, distance: true, color: '#f59e0b' },
  { id: 'walking', label: 'Brisk Walking', icon: '🚶', met: 3.8, distance: true, color: '#10b981' },
  { id: 'gym', label: 'Strength / Gym', icon: '🏋️', met: 5.5, distance: false, color: '#6366f1' },
  { id: 'yoga', label: 'Yoga & Mobility', icon: '🧘', met: 3.0, distance: false, color: '#8b5cf6' },
  { id: 'hiit', label: 'HIIT & Circuit', icon: '⚡', met: 8.5, distance: false, color: '#ec4899' },
  { id: 'swimming', label: 'Swimming', icon: '🏊', met: 8.0, distance: true, color: '#06b6d4' },
  { id: 'other', label: 'Other Activity', icon: '⏱️', met: 5.0, distance: false, color: '#64748b' },
];

export const INTENSITIES = [
  { id: 'light', label: 'Light Effort', multiplier: 0.85, tag: 'Light', maxRpe: 4 },
  { id: 'moderate', label: 'Moderate', multiplier: 1.0, tag: 'Moderate', maxRpe: 7 },
  { id: 'vigorous', label: 'Vigorous / High', multiplier: 1.25, tag: 'Vigorous', maxRpe: 10 },
];

export function calculateCalories(met, minutes, intensity = 'moderate', weightKg = 70) {
  if (!minutes || minutes <= 0) return 0;
  const intObj = INTENSITIES.find((i) => i.id === intensity) || INTENSITIES[1];
  const cal = ((met * intObj.multiplier * 3.5 * weightKg) / 200) * minutes;
  return Math.max(1, Math.round(cal));
}

export function formatStopwatch(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

const WorkoutContext = createContext(null);

export function WorkoutProvider({ children }) {
  // Session states
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'paused' | 'finished'
  const [isMinimized, setIsMinimized] = useState(false);
  const [modalityId, setModalityId] = useState('running');
  const [intensity, setIntensity] = useState('moderate');
  const [seconds, setSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState('');
  const [summaryData, setSummaryData] = useState(null);

  // Closed-loop recommendation prefill metadata
  const [recMeta, setRecMeta] = useState(null);

  // Callbacks for notifying listeners (e.g. ActivityLog) when a workout is saved
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(0);

  const timerRef = useRef(null);

  // Background interval timer
  useEffect(() => {
    if (status === 'running') {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const activeModality = MODALITIES.find((m) => m.id === modalityId) || MODALITIES[0];

  const currentCalories = calculateCalories(
    activeModality.met,
    seconds / 60,
    intensity
  );

  // Estimate distance for distance sports if not manually set
  const currentDistance = distanceKm !== '' ? distanceKm : (() => {
    if (!activeModality.distance || seconds < 10) return null;
    const speedKmh = modalityId === 'running' ? 9.5 : modalityId === 'cycling' ? 20.0 : modalityId === 'walking' ? 4.8 : 2.5;
    const estKm = (speedKmh * (seconds / 3600)).toFixed(2);
    return estKm;
  })();

  // Actions
  const startWorkout = useCallback((modality = 'running', initialIntensity = 'moderate', recommendationMeta = null) => {
    setModalityId(modality);
    setIntensity(initialIntensity);
    setRecMeta(recommendationMeta);
    setSeconds(0);
    setDistanceKm('');
    setIsActive(true);
    setStatus('running');
    setIsMinimized(false);
    setSummaryData(null);
  }, []);

  const openTrackerPreview = useCallback((modality = 'running', recommendationMeta = null) => {
    setModalityId(modality);
    setRecMeta(recommendationMeta);
    setSeconds(0);
    setDistanceKm('');
    setIsActive(true);
    setStatus('idle');
    setIsMinimized(false);
    setSummaryData(null);
  }, []);

  const pauseWorkout = useCallback(() => {
    setStatus('paused');
  }, []);

  const resumeWorkout = useCallback(() => {
    setStatus('running');
  }, []);

  const minimizeWorkout = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximizeWorkout = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const stopAndFinish = useCallback(() => {
    setStatus('finished');
    const mins = Math.max(1, Math.round(seconds / 60));
    const modObj = MODALITIES.find((m) => m.id === modalityId) || MODALITIES[0];
    const estCal = calculateCalories(modObj.met, mins, intensity);
    const defaultRpe = intensity === 'light' ? 3 : intensity === 'moderate' ? 6 : 8;

    setSummaryData({
      title: recMeta?.title || `${modObj.label} Workout`,
      modalityId,
      date: new Date().toISOString().slice(0, 10),
      durationMinutes: mins,
      calories: estCal,
      distanceKm: currentDistance || '',
      intensity,
      rpeScore: defaultRpe,
      adherenceStatus: recMeta ? 'completed' : 'completed',
      recommendationId: recMeta?.recommendationId || null,
      targetDuration: recMeta?.targetDuration || null,
      targetRpeCap: recMeta?.targetRpeCap || null,
      notes: '',
      imageData: null,
    });
  }, [seconds, modalityId, intensity, currentDistance, recMeta]);

  const discardWorkout = useCallback(() => {
    setStatus('idle');
    setIsActive(false);
    setIsMinimized(false);
    setSeconds(0);
    setSummaryData(null);
    setRecMeta(null);
  }, []);

  const completeAndSaved = useCallback(() => {
    setStatus('idle');
    setIsActive(false);
    setIsMinimized(false);
    setSeconds(0);
    setSummaryData(null);
    setRecMeta(null);
    setLastSavedTimestamp(Date.now());
  }, []);

  const value = {
    isActive,
    status,
    isMinimized,
    modalityId,
    activeModality,
    intensity,
    seconds,
    currentCalories,
    currentDistance,
    distanceKm,
    summaryData,
    recMeta,
    lastSavedTimestamp,
    setModalityId,
    setIntensity,
    setDistanceKm,
    setSummaryData,
    startWorkout,
    openTrackerPreview,
    pauseWorkout,
    resumeWorkout,
    minimizeWorkout,
    maximizeWorkout,
    stopAndFinish,
    discardWorkout,
    completeAndSaved,
  };

  return (
    <WorkoutContext.Provider value={value}>
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkout = () => useContext(WorkoutContext);
