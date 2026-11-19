import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { assessOnboarding, saveOnboarding, updateSubscription } from '../api';
import Icon from '../components/Icon';

const OBJECTIVES = [
  {
    id: 'energy',
    title: 'Build Sustainable Energy',
    desc: 'Eliminate afternoon energy crashes and maintain alert focus throughout the day.',
    icon: 'activity',
  },
  {
    id: 'pacing',
    title: 'Optimize Workout Pacing',
    desc: 'Prevent overtraining with data-backed exertion guidance so every workout counts.',
    icon: 'compass',
  },
  {
    id: 'sleep',
    title: 'Improve Sleep & Recovery',
    desc: 'Balance exertion with deep rest, lowering resting heart rate and waking up restored.',
    icon: 'sparkles',
  },
  {
    id: 'habits',
    title: 'Build Daily Habit Consistency',
    desc: 'Hit consistent step and active-minute goals without extreme or unsustainable diets.',
    icon: 'target',
  },
  {
    id: 'fatigue',
    title: 'Manage Fatigue & Stress',
    desc: 'Understand how nervous system stress impacts recovery and pace yourself effectively.',
    icon: 'shield',
  },
];

const MOTIVATIONS = [
  'I want vibrant, sustained energy for my family, work, and personal hobbies.',
  'I have hit a fitness plateau and need smarter recovery pacing, not just more fatigue.',
  'I feel burnt out from chronic work stress and want balance between output and rest.',
  'I want transparent, explainable data guidance instead of generic fitness advice.',
];

const WORKOUT_TYPES = [
  'Walking & Light Aerobic',
  'Strength & Calisthenics',
  'Yoga & Flexibility',
  'Cycling & Outdoor Cardio',
];

const AGE_BRACKETS = ['18-29', '30-44', '45-59', '60+'];
const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary (Desk work, minimal exercise)' },
  { id: 'light', label: 'Lightly Active (1-2 light walks or sessions/wk)' },
  { id: 'moderate', label: 'Moderately Active (3-4 workouts or 7k+ steps/day)' },
  { id: 'very_active', label: 'Very Active (5+ intense workouts or physical job)' },
];

export default function OnboardingPage() {
  const { user, register, login, refreshUser, completeOnboarding } = useApp();
  const navigate = useNavigate();

  // Phase: 'questionnaire' | 'generating' | 'results'
  const [phase, setPhase] = useState('questionnaire');
  const [step, setStep] = useState(1);

  // Questionnaire Data
  const [objective, setObjective] = useState(OBJECTIVES[0].title);
  const [dailyStepsGoal, setDailyStepsGoal] = useState(8000);
  const [sleepHoursGoal, setSleepHoursGoal] = useState(7.5);
  const [workoutType, setWorkoutType] = useState(WORKOUT_TYPES[0]);
  const [availableMinutes, setAvailableMinutes] = useState(30);

  const [motivation, setMotivation] = useState(MOTIVATIONS[0]);
  const [customMotivation, setCustomMotivation] = useState('');

  const [ageBracket, setAgeBracket] = useState(user?.ageBracket || '30-44');
  const [activityLevel, setActivityLevel] = useState(user?.activityLevel || 'moderate');
  const [baselineSleep, setBaselineSleep] = useState(7.0);
  const [baselineHeartRate, setBaselineHeartRate] = useState(70);
  const [baselineSteps, setBaselineSteps] = useState(7500);

  // Scale of 1 to 5 metrics
  const [energyRating, setEnergyRating] = useState(3);
  const [stressRating, setStressRating] = useState(3);
  const [consistencyRating, setConsistencyRating] = useState(3);
  const [recoveryRating, setRecoveryRating] = useState(3);

  // Generation & Results state
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStageText, setGenerationStageText] = useState('Calibrating XGBoost pacing engine...');
  const [planResult, setPlanResult] = useState(null);
  const [error, setError] = useState(null);

  // Unlock / Checkout modal & inputs
  const [unlockMode, setUnlockMode] = useState('free'); // 'free' or 'plus'
  const [billingCycle, setBillingCycle] = useState('annual');
  const [regName, setRegName] = useState(user?.name || '');
  const [regEmail, setRegEmail] = useState(user?.email || '');
  const [regPassword, setRegPassword] = useState('');
  const [regConsent, setRegConsent] = useState(false);
  const [authAction, setAuthAction] = useState('register'); // 'register' or 'login'
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [submitting, setSubmitting] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Step navigation
  const nextStep = () => {
    setError(null);
    if (step < 5) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      triggerPlanGeneration();
    }
  };

  const prevStep = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Trigger Plan Generation with Machine Learning
  const triggerPlanGeneration = async () => {
    setPhase('generating');
    setGenerationProgress(10);
    setGenerationStageText('Calibrating XGBoost pacing engine to your baseline...');
    setError(null);

    // Compute derived fatigue from 1-5 ratings
    const derivedFatigue = Math.round(
      Math.min(Math.max((6.0 - energyRating) * 0.9 + stressRating * 0.9 + (6.0 - recoveryRating) * 0.4, 1.0), 10.0) * 10
    ) / 10;

    const payload = {
      objective,
      motivation: customMotivation.trim() || motivation,
      goals: {
        dailySteps: Number(dailyStepsGoal),
        sleepHours: Number(sleepHoursGoal),
        workoutType,
        availableMinutes: Number(availableMinutes),
      },
      ratings: {
        energyLevel: Number(energyRating),
        stressLevel: Number(stressRating),
        habitConsistency: Number(consistencyRating),
        recoveryQuality: Number(recoveryRating),
      },
      ageBracket,
      activityLevel,
      baseline: {
        sleep: Number(baselineSleep),
        heartRate: Number(baselineHeartRate),
        steps: Number(baselineSteps),
        fatigue: derivedFatigue,
      },
    };

    try {
      // Step interval animation for realistic feedback
      const timer1 = setTimeout(() => {
        setGenerationProgress(38);
        setGenerationStageText('Computing TreeSHAP impact attributions across sleep & heart rate...');
      }, 600);

      const timer2 = setTimeout(() => {
        setGenerationProgress(72);
        setGenerationStageText('Running Counterfactual recourse simulation for recovery pacing...');
      }, 1300);

      const timer3 = setTimeout(() => {
        setGenerationProgress(95);
        setGenerationStageText('Synthesizing your custom 7-day adaptive lifestyle protocol...');
      }, 1900);

      // Call the actual machine learning backend API
      const result = await assessOnboarding(payload);

      // Save baseline object to localStorage so if the user clicks external links or reloads, their quiz is saved
      localStorage.setItem('h360_pending_baseline', JSON.stringify({
        ageBracket,
        activityLevel,
        baseline: payload.baseline,
        goals: payload.goals,
      }));

      setTimeout(() => {
        setPlanResult(result);
        setGenerationProgress(100);
        setPhase('results');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 2300);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } catch (err) {
      setError(err.message || 'Could not generate model plan. Please try again.');
      setPhase('questionnaire');
    }
  };

  // Handle plan unlock / registration
  const handleUnlockPlan = async (e) => {
    e.preventDefault();
    setUnlockError('');
    setSubmitting(true);

    try {
      const baselinePayload = {
        ageBracket,
        activityLevel,
        baseline: planResult?.calibrated_baseline || {
          sleep: Number(baselineSleep),
          heartRate: Number(baselineHeartRate),
          steps: Number(baselineSteps),
          fatigue: 4.0,
        },
        goals: {
          dailySteps: Number(dailyStepsGoal),
          sleepHours: Number(sleepHoursGoal),
          workoutType,
          availableMinutes: Number(availableMinutes),
        },
      };

      if (!user) {
        if (authAction === 'register') {
          if (!regName.trim() || !regEmail.trim() || !regPassword) {
            throw new Error('Please enter your name, email, and password.');
          }
          if (!regConsent) {
            throw new Error('You must accept the PDPA data processing consent to proceed.');
          }
          await register({
            name: regName.trim(),
            email: regEmail.trim(),
            password: regPassword,
            role: 'registered',
            consent: true,
          });
        } else {
          if (!regEmail.trim() || !regPassword) {
            throw new Error('Please enter your email and password.');
          }
          await login({
            email: regEmail.trim(),
            password: regPassword,
          });
        }
      }

      // If user chose Plus unlock
      if (unlockMode === 'plus') {
        await updateSubscription('start', billingCycle);
      }

      // Save onboarding baseline to persist data
      if (completeOnboarding) {
        await completeOnboarding(baselinePayload);
      } else {
        await saveOnboarding(baselinePayload);
      }

      if (refreshUser) {
        await refreshUser();
      }

      localStorage.removeItem('h360_pending_baseline');
      navigate(unlockMode === 'plus' ? '/premium' : '/dashboard', { replace: true });
    } catch (err) {
      setUnlockError(err.message || 'Failed to complete setup. Please check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  // If already logged in, simple save baseline
  const handleLoggedInSave = async () => {
    setSubmitting(true);
    setUnlockError('');
    try {
      const baselinePayload = {
        ageBracket,
        activityLevel,
        baseline: planResult?.calibrated_baseline || {
          sleep: Number(baselineSleep),
          heartRate: Number(baselineHeartRate),
          steps: Number(baselineSteps),
          fatigue: 4.0,
        },
        goals: {
          dailySteps: Number(dailyStepsGoal),
          sleepHours: Number(sleepHoursGoal),
          workoutType,
          availableMinutes: Number(availableMinutes),
        },
      };

      await completeOnboarding(baselinePayload);
      if (refreshUser) await refreshUser();
      localStorage.removeItem('h360_pending_baseline');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setUnlockError(err.message || 'Could not save baseline.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="dashboard-container" style={{ maxWidth: '820px', minHeight: '80vh', padding: '1.5rem 1rem' }}>
      {/* PHASE 2: GENERATING ANIMATION */}
      {phase === 'generating' && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', maxWidth: '580px', margin: '0 auto' }}>
          <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 2rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '6px solid #e5e7eb', borderTopColor: '#10b981', animation: 'spin 1.2s linear infinite' }} />
            <span style={{ position: 'absolute', fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
              {generationProgress}%
            </span>
          </div>

          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>Generating Your Personalized Plan</h2>
          <p className="sub-text" style={{ fontSize: '1.05rem', minHeight: '3rem', color: '#4b5563' }}>
            {generationStageText}
          </p>

          <div style={{ background: '#f3f4f6', borderRadius: '999px', height: '10px', width: '100%', overflow: 'hidden', margin: '1.5rem 0' }}>
            <div
              style={{
                background: '#10b981',
                height: '100%',
                width: `${generationProgress}%`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600 }}>
            <Icon name="shield" size={15} /> Non-clinical XGBoost Classifier + TreeSHAP Explainability
          </div>
        </div>
      )}

      {/* PHASE 1: QUESTIONNAIRE */}
      {phase === 'questionnaire' && (
        <div>
          {/* Header & Stepper */}
          <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              <Icon name="sparkles" size={14} /> Personalized AI Health Calibration
            </div>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {step === 1 && 'What are you trying to achieve?'}
              {step === 2 && 'What are your core targets?'}
              {step === 3 && 'Why is this important to you?'}
              {step === 4 && 'Your biometric baseline'}
              {step === 5 && 'Rate your current daily state'}
            </h1>
            <p className="sub-text" style={{ fontSize: '1rem', margin: 0 }}>
              {step === 1 && 'Select your primary wellness and energy focus for today.'}
              {step === 2 && 'Set targets for steps, sleep, and workout preferences.'}
              {step === 3 && 'Connecting with your deeper motivation helps reinforce habit adherence.'}
              {step === 4 && 'Provide your typical daily numbers to calibrate the XGBoost model.'}
              {step === 5 && 'On a scale of 1 to 5, assess your energy, stress, and recovery.'}
            </p>

            {/* Stepper Progress Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  style={{
                    height: '6px',
                    width: '50px',
                    borderRadius: '999px',
                    background: s <= step ? '#10b981' : '#e5e7eb',
                    transition: 'background 0.2s ease',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem', fontWeight: 500 }}>
              Step {step} of 5
            </div>
          </header>

          {error && <div className="alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          {/* STEP 1: OBJECTIVE */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {OBJECTIVES.map((item) => {
                const isSelected = objective === item.title;
                return (
                  <div
                    key={item.id}
                    onClick={() => setObjective(item.title)}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: `2px solid ${isSelected ? '#10b981' : '#e5e7eb'}`,
                      background: isSelected ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: isSelected ? '#10b981' : '#f3f4f6', color: isSelected ? '#ffffff' : '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={item.icon} size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', color: '#111827' }}>{item.title}</h3>
                      <p className="sub-text" style={{ margin: 0, fontSize: '0.9rem' }}>{item.desc}</p>
                    </div>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${isSelected ? '#10b981' : '#d1d5db'}`, background: isSelected ? '#10b981' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                      {isSelected && <Icon name="check" size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 2: TARGET GOALS */}
          {step === 2 && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Daily Step Target: <span style={{ color: '#059669' }}>{Number(dailyStepsGoal).toLocaleString()} steps</span>
                </label>
                <div className="stats-2col-grid">
                  {[6000, 8000, 10000, 12000].map((s) => (
                    <button
                      key={s}
                      type="button"
                      style={{
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: `1.5px solid ${dailyStepsGoal === s ? '#10b981' : '#d1d5db'}`,
                        background: dailyStepsGoal === s ? '#ecfdf5' : '#ffffff',
                        color: dailyStepsGoal === s ? '#065f46' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => setDailyStepsGoal(s)}
                    >
                      {s.toLocaleString()} steps
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Nightly Sleep Target: <span style={{ color: '#059669' }}>{sleepHoursGoal} hours</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {[6.5, 7.0, 7.5, 8.0, 8.5].map((h) => (
                    <button
                      key={h}
                      type="button"
                      style={{
                        flex: '1 1 calc(33.333% - 0.5rem)',
                        minWidth: '70px',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: `1.5px solid ${sleepHoursGoal === h ? '#10b981' : '#d1d5db'}`,
                        background: sleepHoursGoal === h ? '#ecfdf5' : '#ffffff',
                        color: sleepHoursGoal === h ? '#065f46' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                      onClick={() => setSleepHoursGoal(h)}
                    >
                      {h} hrs
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Primary Movement Style
                </label>
                <div className="stats-2col-grid">
                  {WORKOUT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      style={{
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: `1.5px solid ${workoutType === t ? '#10b981' : '#d1d5db'}`,
                        background: workoutType === t ? '#ecfdf5' : '#ffffff',
                        color: workoutType === t ? '#065f46' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                      onClick={() => setWorkoutType(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Available Active Minutes Per Day: <span style={{ color: '#059669' }}>{availableMinutes} mins</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[20, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: `1.5px solid ${availableMinutes === m ? '#10b981' : '#d1d5db'}`,
                        background: availableMinutes === m ? '#ecfdf5' : '#ffffff',
                        color: availableMinutes === m ? '#065f46' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => setAvailableMinutes(m)}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MOTIVATION */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {MOTIVATIONS.map((m, idx) => {
                const isSelected = motivation === m;
                return (
                  <div
                    key={idx}
                    onClick={() => setMotivation(m)}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: `2px solid ${isSelected ? '#10b981' : '#e5e7eb'}`,
                      background: isSelected ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${isSelected ? '#10b981' : '#d1d5db'}`, background: isSelected ? '#10b981' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', flexShrink: 0 }}>
                      {isSelected && <Icon name="check" size={14} />}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: '#1f2937' }}>{m}</p>
                  </div>
                );
              })}

              <div className="card" style={{ marginTop: '0.5rem' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                  Anything specific driving your motivation right now? (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Preparing for a 10km charity walk, or recovering from high work burnout..."
                  value={customMotivation}
                  onChange={(e) => setCustomMotivation(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 4: BIOMETRIC BASELINE */}
          {step === 4 && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="stats-2col-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="ageBracket">Age Bracket (Fairness Audited)</label>
                  <select id="ageBracket" value={ageBracket} onChange={(e) => setAgeBracket(e.target.value)}>
                    {AGE_BRACKETS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="activityLevel">Typical Activity Level</label>
                  <select id="activityLevel" value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}>
                    {ACTIVITY_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 600 }}>Typical Nightly Sleep</label>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{baselineSleep} hours</span>
                </div>
                <input
                  type="range"
                  min="3.0"
                  max="12.0"
                  step="0.5"
                  value={baselineSleep}
                  onChange={(e) => setBaselineSleep(parseFloat(e.target.value))}
                />
                <span className="sub-text" style={{ fontSize: '0.75rem' }}>Reference average: 7.0 - 8.0 hours</span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 600 }}>Resting Heart Rate</label>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{baselineHeartRate} bpm</span>
                </div>
                <input
                  type="range"
                  min="45"
                  max="110"
                  step="1"
                  value={baselineHeartRate}
                  onChange={(e) => setBaselineHeartRate(parseInt(e.target.value, 10))}
                />
                <span className="sub-text" style={{ fontSize: '0.75rem' }}>Typical adult resting range: 60 - 80 bpm</span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontWeight: 600 }}>Typical Daily Steps</label>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{Number(baselineSteps).toLocaleString()} steps</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="20000"
                  step="500"
                  value={baselineSteps}
                  onChange={(e) => setBaselineSteps(parseInt(e.target.value, 10))}
                />
              </div>
            </div>
          )}

          {/* STEP 5: SCALE OF 1 TO 5 */}
          {step === 5 && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {/* Energy Rating */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    1. Daily Energy Level (1 = Exhausted, 5 = Peak Energy)
                  </label>
                  <span style={{ background: '#ecfdf5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    {energyRating}/5
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        padding: '0.65rem 0',
                        borderRadius: '8px',
                        border: `1.5px solid ${energyRating === val ? '#10b981' : '#d1d5db'}`,
                        background: energyRating === val ? '#10b981' : '#ffffff',
                        color: energyRating === val ? '#ffffff' : '#374151',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                      onClick={() => setEnergyRating(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stress Rating */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    2. Work & Life Stress (1 = Relaxed, 5 = High Chronic Stress)
                  </label>
                  <span style={{ background: '#ecfdf5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    {stressRating}/5
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        padding: '0.65rem 0',
                        borderRadius: '8px',
                        border: `1.5px solid ${stressRating === val ? '#10b981' : '#d1d5db'}`,
                        background: stressRating === val ? '#10b981' : '#ffffff',
                        color: stressRating === val ? '#ffffff' : '#374151',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                      onClick={() => setStressRating(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Habit Consistency */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    3. Habit Consistency (1 = Hard to Maintain, 5 = Highly Consistent)
                  </label>
                  <span style={{ background: '#ecfdf5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    {consistencyRating}/5
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        padding: '0.65rem 0',
                        borderRadius: '8px',
                        border: `1.5px solid ${consistencyRating === val ? '#10b981' : '#d1d5db'}`,
                        background: consistencyRating === val ? '#10b981' : '#ffffff',
                        color: consistencyRating === val ? '#ffffff' : '#374151',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                      onClick={() => setConsistencyRating(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recovery Quality */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    4. Morning Physical Recovery (1 = Stiff / Tired, 5 = Fully Restored)
                  </label>
                  <span style={{ background: '#ecfdf5', color: '#065f46', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem' }}>
                    {recoveryRating}/5
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      style={{
                        padding: '0.65rem 0',
                        borderRadius: '8px',
                        border: `1.5px solid ${recoveryRating === val ? '#10b981' : '#d1d5db'}`,
                        background: recoveryRating === val ? '#10b981' : '#ffffff',
                        color: recoveryRating === val ? '#ffffff' : '#374151',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                      onClick={() => setRecoveryRating(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
            {step > 1 ? (
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '0.65rem 1.5rem', fontSize: '0.95rem' }}
                onClick={prevStep}
              >
                Back
              </button>
            ) : <div />}

            <button
              type="button"
              className="submit-btn"
              style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600 }}
              onClick={nextStep}
            >
              {step === 5 ? 'Generate My Personalized Plan' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: RESULTS & UNLOCK GATE */}
      {phase === 'results' && planResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Top Banner */}
          <header style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#ecfdf5', color: '#065f46', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              <Icon name="check" size={16} /> Plan Generated with XGBoost & TreeSHAP
            </div>
            <h1 style={{ fontSize: '2.1rem', marginBottom: '0.5rem' }}>
              Your Personalized Health Blueprint
            </h1>
            <p className="sub-text" style={{ fontSize: '1rem', margin: 0 }}>
              Calibrated for <strong>{objective}</strong>. Here is your evidence-based pacing tier and habit guidance.
            </p>
          </header>

          {/* ML RECOMMENDATION BLUEPRINT CARD */}
          <div className="card" style={{ border: '2px solid #10b981', background: '#ffffff', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <span className="role-badge role-premium" style={{ display: 'inline-block', marginBottom: '0.4rem' }}>
                  CALIBRATED TIER {planResult.plan_level}
                </span>
                <h2 style={{ margin: 0, fontSize: '1.6rem', color: '#111827' }}>
                  {planResult.recommendation}
                </h2>
              </div>
              <div style={{ background: '#f3f4f6', padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', color: '#4b5563' }}>
                Inference latency: {planResult.latency_ms}ms
              </div>
            </div>

            <p style={{ fontSize: '1.05rem', lineHeight: '1.6', color: '#374151', marginBottom: '1.25rem' }}>
              {planResult.explanation}
            </p>

            {/* TreeSHAP Attributions Breakdown */}
            <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon name="chart" size={18} /> Model Explainability (TreeSHAP Attributions)
              </h3>
              <p className="sub-text" style={{ fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                Shows the exact percentage impact each biometric factor contributed toward today’s pacing guidance.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {planResult.shap_factors && Object.entries(planResult.shap_factors).map(([feature, pct]) => (
                  <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.88rem' }}>
                    <span style={{ width: '90px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {feature === 'heartRate' ? 'Resting HR' : feature}
                    </span>
                    <div style={{ flex: 1, background: '#e5e7eb', height: '10px', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(Math.abs(pct) * 2, 100)}%`,
                          height: '100%',
                          background: pct >= 0 ? '#10b981' : '#f59e0b',
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                    <span style={{ width: '55px', textAlign: 'right', fontWeight: 600, color: pct >= 0 ? '#059669' : '#d97706' }}>
                      {pct >= 0 ? `+${pct}%` : `${pct}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Counterfactual Habit Lever */}
            {planResult.what_if && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#065f46', marginBottom: '0.25rem' }}>
                  <Icon name="compass" size={18} /> Key What-If Recourse Lever
                </div>
                <p style={{ margin: 0, fontSize: '0.92rem', color: '#047857', lineHeight: 1.5 }}>
                  {planResult.what_if}
                </p>
              </div>
            )}

            {/* Tailored 7-Day Roadmap */}
            {planResult.personalized_profile?.roadmap && (
              <div>
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.75rem 0' }}>Your 7-Day Adaptive Progression</h3>
                <div className="responsive-card-grid" style={{ gap: '0.75rem' }}>
                  {planResult.personalized_profile.roadmap.map((r, i) => (
                    <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        {r.day} · {r.focus}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151', lineHeight: 1.4 }}>
                        {r.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* UNLOCK GATE / SIGNUP SECTION */}
          {user ? (
            /* User already authenticated */
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                <Icon name="check" size={28} />
              </div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Ready to Activate in Your Account</h2>
              <p className="sub-text" style={{ maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
                Save this calibrated baseline directly to your profile. Daily check-ins and trend tracking will reflect this pacing model immediately.
              </p>

              {unlockError && <div className="alert-error" role="alert" style={{ marginBottom: '1rem' }}>{unlockError}</div>}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="submit-btn"
                  style={{ padding: '0.8rem 2rem', fontSize: '1.05rem', fontWeight: 600 }}
                  onClick={handleLoggedInSave}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Save Baseline & Go to Today’s Dashboard'}
                </button>
                {user.role === 'registered' && (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ padding: '0.8rem 1.5rem', fontSize: '1.05rem', fontWeight: 600 }}
                    onClick={() => navigate('/subscription')}
                  >
                    Upgrade to Plus
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Unregistered User Gate */
            <div className="card" style={{ border: '2px solid #2563eb', padding: '2rem' }}>
              <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 1.5rem auto' }}>
                <span className="role-badge role-registered" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                  UNLOCK YOUR PROTOCOL
                </span>
                <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>
                  Save Your Blueprint & Start Today
                </h2>
                <p className="sub-text" style={{ margin: 0 }}>
                  Create an account to persist your baseline and receive daily pacing check-ins. Choose Core (Free) or Plus to unlock all custom generators.
                </p>
              </div>

              {/* Mode Toggle: Free vs Plus */}
              <div style={{ display: 'flex', background: '#f3f4f6', padding: '0.35rem', borderRadius: '12px', gap: '0.5rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: unlockMode === 'free' ? '#ffffff' : 'transparent',
                    color: unlockMode === 'free' ? '#111827' : '#6b7280',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: unlockMode === 'free' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                  onClick={() => setUnlockMode('free')}
                >
                  Register Free (Core Plan)
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: unlockMode === 'plus' ? '#ffffff' : 'transparent',
                    color: unlockMode === 'plus' ? '#111827' : '#6b7280',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: unlockMode === 'plus' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                  }}
                  onClick={() => setUnlockMode('plus')}
                >
                  <span>Plus Plan</span>
                  <span style={{ background: '#ecfdf5', color: '#059669', fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '6px' }}>
                    ALL TOOLS
                  </span>
                </button>
              </div>

              {unlockError && <div className="alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>{unlockError}</div>}

              <form onSubmit={handleUnlockPlan} style={{ maxWidth: '520px', margin: '0 auto' }}>
                {/* Billing cycle picker if Plus */}
                {unlockMode === 'plus' && (
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: '#065f46', fontSize: '0.95rem' }}>Select Plus Billing Cycle</span>
                      <span style={{ background: '#10b981', color: '#ffffff', fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                        14-DAY GUARANTEE
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.55rem',
                          borderRadius: '8px',
                          border: `1.5px solid ${billingCycle === 'annual' ? '#10b981' : '#d1d5db'}`,
                          background: billingCycle === 'annual' ? '#ffffff' : 'transparent',
                          color: billingCycle === 'annual' ? '#065f46' : '#4b5563',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                        onClick={() => setBillingCycle('annual')}
                      >
                        Annual SGD $95.00/yr (Save 20%)
                      </button>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.55rem',
                          borderRadius: '8px',
                          border: `1.5px solid ${billingCycle === 'monthly' ? '#10b981' : '#d1d5db'}`,
                          background: billingCycle === 'monthly' ? '#ffffff' : 'transparent',
                          color: billingCycle === 'monthly' ? '#065f46' : '#4b5563',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                        onClick={() => setBillingCycle('monthly')}
                      >
                        Monthly SGD $9.90/mo
                      </button>
                    </div>
                  </div>
                )}

                {/* Account details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Your Full Name</label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. Jason Tan"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email Address</label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@example.sg"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Create Password</label>
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', lineHeight: 1.4, marginTop: '0.2rem' }}>
                    <input
                      type="checkbox"
                      checked={regConsent}
                      onChange={(e) => setRegConsent(e.target.checked)}
                      required
                      style={{ marginTop: '0.15rem' }}
                    />
                    <span>
                      I consent under the Singapore PDPA to the processing of my biometrics for personalized lifestyle guidance and understand this is not medical advice.
                    </span>
                  </label>
                </div>

                {/* Payment simulated fields if Plus */}
                {unlockMode === 'plus' && (
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                      Payment Method (Simulated Sandbox)
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem' }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: `1px solid ${paymentMethod === 'card' ? '#10b981' : '#d1d5db'}`,
                          background: paymentMethod === 'card' ? '#ecfdf5' : '#ffffff',
                          color: paymentMethod === 'card' ? '#065f46' : '#374151',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                        onClick={() => setPaymentMethod('card')}
                      >
                        Credit Card
                      </button>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: `1px solid ${paymentMethod === 'paynow' ? '#10b981' : '#d1d5db'}`,
                          background: paymentMethod === 'paynow' ? '#ecfdf5' : '#ffffff',
                          color: paymentMethod === 'paynow' ? '#065f46' : '#374151',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                        onClick={() => setPaymentMethod('paynow')}
                      >
                        PayNow QR
                      </button>
                    </div>

                    {paymentMethod === 'card' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="Card Number"
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM/YY"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="text"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            placeholder="CVC"
                            style={{ flex: 1 }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <div style={{ display: 'inline-block', padding: '0.5rem', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                          <div style={{ width: '80px', height: '80px', background: '#111827', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
                            PAYNOW QR
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="submit-btn"
                  style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem', fontWeight: 600 }}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Setting Up Your Profile...'
                    : unlockMode === 'plus'
                    ? `Purchase Plus (SGD $${billingCycle === 'annual' ? '95.00' : '9.90'}) & Unlock Protocol`
                    : 'Register Free & Unlock My Protocol'}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginTop: '0.75rem' }}>
                  Already have an account? <Link to="/login" style={{ textDecoration: 'underline' }}>Log in here</Link> to save to your existing profile.
                </p>
              </form>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
