import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const METRICS = [
  { key: 'sleep', label: 'Sleep duration', unit: 'hrs', color: '#2563eb' },
  { key: 'heartRate', label: 'Resting heart rate', unit: 'bpm', color: '#db2777' },
  { key: 'steps', label: 'Daily steps', unit: 'steps', color: '#16a34a' },
  { key: 'fatigue', label: 'Perceived fatigue', unit: '/10', color: '#d97706' },
];

export default function Trends({ history }) {
  const [days, setDays] = useState(7);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffDate = [
    cutoff.getFullYear(),
    String(cutoff.getMonth() + 1).padStart(2, '0'),
    String(cutoff.getDate()).padStart(2, '0'),
  ].join('-');
  const recent = [...history]
    .filter((log) => log.date >= cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({
      ...log,
      dateLabel: new Date(`${log.date}T00:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    }));

  return (
    <section className="card">
      <div className="card-header trend-header">
        <div>
          <h3>Metric trends</h3>
          <span className="sub-text">Your recent check-ins</span>
        </div>
        <div className="trend-controls" aria-label="Trend time range">
          {[7, 30].map((range) => (
            <button
              key={range}
              type="button"
              className={days === range ? 'chip chip-on' : 'chip'}
              aria-pressed={days === range}
              onClick={() => setDays(range)}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>
      {recent.length === 0 ? (
        <p className="sub-text">
          {history.length
            ? `No check-ins in the selected ${days}-day period.`
            : 'No history yet. Log your metrics to see trends.'}
        </p>
      ) : (
        <div className="trend-chart-grid">
          {METRICS.map((metric) => (
            <article className="trend-chart-card" key={metric.key}>
              <h4>{metric.label}</h4>
              <div className="trend-chart">
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={recent} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} minTickGap={20} />
                    <YAxis width={42} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [`${value} ${metric.unit}`, metric.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric.key}
                      name={metric.label}
                      stroke={metric.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
