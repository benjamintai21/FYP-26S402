import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MetricForm from '../components/MetricForm';
import { DEFAULT_BASELINE } from '../constants';

const AGE_BRACKETS = ['18–29', '30–39', '40–49', '50–59', '60+'];
const ACTIVITY_LEVELS = ['Mostly sedentary', 'Lightly active', 'Moderately active', 'Very active'];

export default function OnboardingPage() {
  const { completeOnboarding } = useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ ageBracket: AGE_BRACKETS[0], activityLevel: ACTIVITY_LEVELS[1] });

  const handleChange = (e) => setProfile({ ...profile, [e.target.name]: e.target.value });

  const handleSubmit = (baseline) => {
    completeOnboarding({ ...profile, baseline });
    navigate('/dashboard');
  };

  return (
    <main className="dashboard-container narrow">
      <header className="page-header">
        <h1>Set up your baseline</h1>
        <p>Tell us what's typical for you, so recommendations are personal. Age bracket and activity level are also used for fairness auditing.</p>
      </header>
      <div className="grid-col">
        <section className="card">
          <div className="card-header"><h2>About you</h2></div>
          <div className="form-group">
            <label htmlFor="ageBracket">Age bracket</label>
            <select id="ageBracket" name="ageBracket" value={profile.ageBracket} onChange={handleChange}>
              {AGE_BRACKETS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="activityLevel">Typical activity level</label>
            <select id="activityLevel" name="activityLevel" value={profile.activityLevel} onChange={handleChange}>
              {ACTIVITY_LEVELS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </section>
        <MetricForm
          initial={DEFAULT_BASELINE}
          title="Your typical day"
          subtitle="These become your personal baselines"
          submitLabel="Save baseline and continue"
          onSubmit={handleSubmit}
        />
      </div>
    </main>
  );
}