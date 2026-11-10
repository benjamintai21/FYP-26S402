from .config import NORMS, PLANS, DISPLAY_NAMES;


BANNED_TERMS = (
    "diagnos", "disease", "disorder", "syndrome", "treatment", "medical", "medication",
    "symptom", "cure", "prescri", "patient", "clinical", "illness", "therapy",
)

# (feature, state) -> phrase. State is judged from the value itself, not the SHAP sign.
PHRASES = {
    ("sleep", "good"): "your sleep of {v} supports hard training",
    ("sleep", "average"): "your sleep of {v} is about average",
    ("sleep", "poor"): "your sleep of {v} is lower than ideal",
    ("heartRate", "good"): "your resting heart rate of {v} looks settled",
    ("heartRate", "average"): "your resting heart rate of {v} is about average",
    ("heartRate", "poor"): "your resting heart rate of {v} is elevated",
    ("steps", "good"): "your step count of {v} shows a strong activity base",
    ("steps", "average"): "your step count of {v} is about average",
    ("steps", "poor"): "your step count of {v} is on the low side",
    ("fatigue", "good"): "your fatigue level of {v} is low",
    ("fatigue", "average"): "your fatigue level of {v} is moderate",
    ("fatigue", "poor"): "your fatigue level of {v} is high",
}


def is_non_clinical(text):
    lowered = text.lower()
    return not any(term in lowered for term in BANNED_TERMS)


def value_state(feature, value):
    norm, tolerance, higher_is_better = NORMS[feature]
    delta = value - norm
    if abs(delta) <= tolerance:
        return "average"
    return "good" if (delta > 0) == higher_is_better else "poor"


def build_explanation(plan_class, factors, display_values, imputed=()):
    ranked = [f for f in factors if abs(f["impact"]) >= 5][:3]
    phrases = [
        PHRASES[(f["key"], value_state(f["key"], f["value"]))].format(v=display_values[f["key"]])
        for f in ranked
    ]
    if not phrases:
        body = "your signals are balanced"
    elif len(phrases) == 1:
        body = phrases[0]
    else:
        body = ", ".join(phrases[:-1]) + f" and {phrases[-1]}"

    text = f"We suggested {PLANS[plan_class].split(':')[0]} mainly because {body}."
    if imputed:
        names = ", ".join(DISPLAY_NAMES[f].lower() for f in imputed)
        text += f" Note: no {names} was provided, so typical values were used."
    if not is_non_clinical(text):
        raise ValueError("Explanation contains clinical wording")
    return text