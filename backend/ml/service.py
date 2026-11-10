import logging
import time

import joblib
import pandas as pd

from .config import FEATURES, MODEL_PATH, PLANS, RANGES, display_value
from .counterfactual import CounterfactualEngine, build_what_if
from .explain import Explainer
from .rationale import build_explanation

log = logging.getLogger("healthy360.audit")


class InvalidMetricError(ValueError):
    pass


class RecommendationService:
    def __init__(self):
        artifact = joblib.load(MODEL_PATH)
        self._model = artifact["model"]
        self._medians = artifact["medians"]
        self._explainer = Explainer(self._model)
        self._counterfactuals = CounterfactualEngine(self._model)

    def _clean(self, raw):
        metrics, imputed = {}, []
        for feature in FEATURES:
            value = raw.get(feature)
            if value is None or value == "":
                metrics[feature] = float(self._medians[feature])
                imputed.append(feature)
                continue
            try:
                value = float(value)
            except (TypeError, ValueError):
                raise InvalidMetricError(f"{feature} must be a number")
            low, high = RANGES[feature]
            metrics[feature] = min(max(value, low), high)
        return metrics, imputed

    def recommend(self, raw):
        start = time.perf_counter()
        metrics, imputed = self._clean(raw)
        row = pd.DataFrame([metrics], columns=FEATURES)
        plan_class = int(self._model.predict(row)[0])

        factors = self._explainer.attribute(metrics, plan_class)
        inference_ms = (time.perf_counter() - start) * 1000

        display = {f: display_value(f, v) for f, v in metrics.items()}
        suggestion = self._counterfactuals.suggest(metrics, plan_class)
        total_ms = (time.perf_counter() - start) * 1000

        log.info("inference_ms=%.1f total_ms=%.1f imputed=%s", inference_ms, total_ms, imputed)
        return {
            "recommendation": PLANS[plan_class],
            "plan_level": plan_class,
            "explanation": build_explanation(plan_class, factors, display, imputed),
            "shap_factors": factors,
            "what_if": build_what_if(plan_class, suggestion),
            "counterfactual": suggestion,
            "imputed_features": imputed,
            "latency_ms": round(total_ms, 1),
        }