import numpy as np
import pandas as pd
import shap

from .config import DISPLAY_NAMES, FEATURES, display_value


class Explainer:
    def __init__(self, model):
        self._explainer = shap.TreeExplainer(model)

    def attribute(self, metrics, predicted_class):
        row = pd.DataFrame([metrics], columns=FEATURES)
        values = self._explainer.shap_values(row)
        if isinstance(values, list):
            contrib = np.asarray(values[predicted_class])[0]
        else:
            contrib = np.asarray(values)[0, :, predicted_class]

        total = float(np.abs(contrib).sum()) or 1.0
        factors = [
            {
                "key": f,
                "feature": f"{DISPLAY_NAMES[f]} ({display_value(f, metrics[f])})",
                "value": metrics[f],
                "impact": round(100 * float(c) / total, 1),
            }
            for f, c in zip(FEATURES, contrib)
        ]
        return sorted(factors, key=lambda x: abs(x["impact"]), reverse=True)