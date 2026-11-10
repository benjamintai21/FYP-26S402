import itertools

import pandas as pd

from .config import FEATURES, PLANS, RANGES, SHORT_PLANS, display_value
from .rationale import is_non_clinical

# Habits a person can realistically change: direction that improves readiness, step size,
# and the largest change we are willing to suggest.
DIRECTION = {"sleep": 1, "steps": 1, "fatigue": -1}
STEP = {"sleep": 0.5, "steps": 500, "fatigue": 1}
MAX_CHANGE = {"sleep": 2.0, "steps": 5000, "fatigue": 3}
FEATURE_PENALTY = 0.05

PHRASES = {
    "sleep": "your sleep reaches {v}",
    "steps": "your daily steps reach {v}",
    "fatigue": "your fatigue drops to {v}",
}


def _axis(feature, value):
    low, high = RANGES[feature]
    count = int(MAX_CHANGE[feature] / STEP[feature])
    values = [round(value + DIRECTION[feature] * STEP[feature] * i, 2) for i in range(count + 1)]
    return [v for v in values if low <= v <= high]


class CounterfactualEngine:
    """Exhaustive search over a bounded grid of habit changes, scored with the real model."""

    def __init__(self, model):
        self._model = model

    def suggest(self, metrics, current_class):
        target = current_class + 1
        if target not in PLANS:
            return None

        names = list(DIRECTION)
        axes = [_axis(f, metrics[f]) for f in names]
        grid = pd.DataFrame(list(itertools.product(*axes)), columns=names)
        grid["heartRate"] = metrics["heartRate"]
        grid = grid[FEATURES]

        hits = grid[self._model.predict(grid) == target]
        if hits.empty:
            return None

        cost = pd.Series(0.0, index=hits.index)
        for f in names:
            changed = (hits[f] - metrics[f]).abs()
            cost += changed / MAX_CHANGE[f] + FEATURE_PENALTY * (changed > 0)
        best = hits.loc[cost.idxmin()]

        changes = [
            {"feature": f, "from": metrics[f], "to": float(best[f])}
            for f in names if float(best[f]) != metrics[f]
        ]
        if not changes:
            return None
        return {"target_plan": PLANS[target], "target_class": target, "changes": changes}


def build_what_if(plan_class, suggestion):
    if suggestion is None:
        if plan_class == max(PLANS):
            text = "You are already at the top training level. Keep your sleep and recovery habits consistent."
        else:
            text = "No small habit change was found that would raise your next plan. Keep building consistent sleep and recovery."
    else:
        parts = [
            PHRASES[c["feature"]].format(v=display_value(c["feature"], c["to"]))
            for c in suggestion["changes"]
        ]
        joined = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + f" and {parts[-1]}"
        target_name = SHORT_PLANS[suggestion["target_class"]]
        text = f"If {joined}, your plan could scale up to {target_name}."
    if not is_non_clinical(text):
        raise ValueError("What-if text contains clinical wording")
    return text