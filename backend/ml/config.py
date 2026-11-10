from pathlib import Path

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "model.joblib"
DATA_PATH = ARTIFACT_DIR / "train_data.csv"

FEATURES = ["sleep", "heartRate", "steps", "fatigue"]

RANGES = {
    "sleep": (3.0, 12.0),
    "heartRate": (45.0, 110.0),
    "steps": (1000.0, 20000.0),
    "fatigue": (1.0, 10.0),
}

# Reference values used to word explanations: (norm, tolerance, higher_is_better)
NORMS = {
    "sleep": (7.0, 0.5, True),
    "heartRate": (70.0, 3.0, False),
    "steps": (7500.0, 1000.0, True),
    "fatigue": (5.0, 0.5, False),
}

PLANS = {
    0: "Active Recovery: 30-Minute Light Walk",
    1: "Moderate Cardio & Tempo Training",
    2: "High-Intensity Interval Training",
}

SHORT_PLANS = {0: "Active Recovery", 1: "Moderate Cardio", 2: "High-Intensity Training"}

AGE_BRACKETS = ["18-29", "30-39", "40-49", "50-59", "60+"]
ACTIVITY_BASELINES = ["Sedentary", "Light", "Moderate", "Active"]

DISPLAY_NAMES = {
    "sleep": "Sleep",
    "heartRate": "Resting HR",
    "steps": "Steps",
    "fatigue": "Fatigue",
}


def display_value(feature, value):
    if feature == "sleep":
        return f"{value:g} hrs"
    if feature == "heartRate":
        return f"{value:g} bpm"
    if feature == "steps":
        return f"{int(value):,}"
    return f"{int(value)}/10"