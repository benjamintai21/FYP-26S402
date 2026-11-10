import pytest

from app import app
from ml.rationale import BANNED_TERMS

TIRED = {"sleep": 5.5, "heartRate": 80, "steps": 6000, "fatigue": 7}
FIT = {"sleep": 8.5, "heartRate": 58, "steps": 12000, "fatigue": 2}


@pytest.fixture(scope="module")
def client():
    return app.test_client()


def post(client, body):
    return client.post("/api/recommendation", json=body)


def test_response_contract(client):
    data = post(client, TIRED).get_json()
    for key in ("recommendation", "explanation", "shap_factors", "what_if", "latency_ms"):
        assert key in data
    for factor in data["shap_factors"]:
        assert {"key", "feature", "value", "impact"} <= set(factor)


def test_tired_user_gets_recovery_and_fit_user_gets_hiit(client):
    assert post(client, TIRED).get_json()["plan_level"] == 0
    assert post(client, FIT).get_json()["plan_level"] == 2


def test_shap_impacts_are_percentages_of_total(client):
    factors = post(client, TIRED).get_json()["shap_factors"]
    assert sum(abs(f["impact"]) for f in factors) == pytest.approx(100, abs=0.5)


def test_latency_under_two_seconds(client):
    assert post(client, TIRED).get_json()["latency_ms"] <= 2000


def test_text_is_non_clinical(client):
    for body in (TIRED, FIT, {"sleep": 3, "heartRate": 110, "steps": 1000, "fatigue": 10}):
        data = post(client, body).get_json()
        text = (data["explanation"] + " " + data["what_if"]).lower()
        assert not any(term in text for term in BANNED_TERMS)


def test_missing_values_are_imputed_and_reported(client):
    data = post(client, {"sleep": 7, "fatigue": 4}).get_json()
    assert set(data["imputed_features"]) == {"heartRate", "steps"}


def test_non_numeric_input_is_rejected(client):
    response = post(client, {"sleep": "abc"})
    assert response.status_code == 400


def test_out_of_range_values_are_clamped(client):
    response = post(client, {"sleep": 99, "heartRate": 500, "steps": 10**9, "fatigue": 99})
    assert response.status_code == 200


def test_counterfactual_really_changes_the_plan(client):
    data = post(client, TIRED).get_json()
    suggestion = data["counterfactual"]
    assert suggestion is not None
    changed = dict(TIRED)
    for change in suggestion["changes"]:
        changed[change["feature"]] = change["to"]
    assert post(client, changed).get_json()["plan_level"] == suggestion["target_class"]


def test_counterfactual_only_improves_habits(client):
    for change in post(client, TIRED).get_json()["counterfactual"]["changes"]:
        if change["feature"] == "fatigue":
            assert change["to"] < change["from"]
        else:
            assert change["to"] > change["from"]

def test_malformed_json_is_rejected(client):
    response = client.post(
        "/api/recommendation", data="not json", content_type="application/json"
    )
    assert response.status_code == 400