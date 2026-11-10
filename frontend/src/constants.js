export const METRIC_FIELDS = [
  { name: 'sleep', label: 'Sleep Duration', unit: 'hrs', min: 3, max: 12, step: 0.5 },
  { name: 'heartRate', label: 'Resting Heart Rate', unit: 'bpm', min: 45, max: 110, step: 1 },
  { name: 'steps', label: 'Daily Step Count', unit: '', min: 1000, max: 20000, step: 500 },
  { name: 'fatigue', label: 'Perceived Fatigue (1–10)', unit: '', min: 1, max: 10, step: 1 },
];

export const DEFAULT_BASELINE = { sleep: 7.5, heartRate: 70, steps: 8000, fatigue: 4 };