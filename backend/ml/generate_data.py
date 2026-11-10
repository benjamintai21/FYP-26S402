import numpy as np
import pandas as pd

from .config import ACTIVITY_BASELINES, AGE_BRACKETS, DATA_PATH, RANGES


def generate(n=5000, seed=42):
    rng = np.random.default_rng(seed)
    age = rng.choice(AGE_BRACKETS, n, p=[0.25, 0.25, 0.20, 0.17, 0.13])
    act = rng.choice(ACTIVITY_BASELINES, n, p=[0.20, 0.35, 0.30, 0.15])

    sleep = rng.normal(6.9, 1.2, n)
    hr = rng.normal(70, 8, n) + (act == "Sedentary") * 4 - (act == "Active") * 5
    steps = rng.normal(7500, 3000, n) + (act == "Active") * 2500
    fatigue = rng.normal(5, 2, n) - (sleep - 7) * 0.5

    df = pd.DataFrame({
        "sleep": np.clip(sleep, *RANGES["sleep"]).round(1),
        "heartRate": np.clip(hr, *RANGES["heartRate"]).round(),
        "steps": np.clip(steps, *RANGES["steps"]).round(-2),
        "fatigue": np.clip(fatigue, *RANGES["fatigue"]).round(),
        "age_bracket": age,
        "activity_baseline": act,
    })

    # Transparent readiness rule + noise; this is the ground truth the model learns.
    score = (
        0.40 * (df.sleep - 7) / 1.2
        - 0.25 * (df.heartRate - 70) / 8
        - 0.30 * (df.fatigue - 5) / 2
        + 0.10 * (df.steps - 7500) / 3000
        + rng.normal(0, 0.25, n)
    )
    df["label"] = np.select([score < -0.35, score < 0.45], [0, 1], 2)
    return df


if __name__ == "__main__":
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = generate()
    data.to_csv(DATA_PATH, index=False)
    print(f"Wrote {len(data)} rows to {DATA_PATH}")
    print(data.label.value_counts(normalize=True).round(2).to_dict())