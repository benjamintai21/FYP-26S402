import logging

from flask import Flask, jsonify, request
from flask_cors import CORS

from ml.service import InvalidMetricError, RecommendationService

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)
service = RecommendationService()

DEFAULT_METRICS = {"sleep": 6.5, "heartRate": 72, "steps": 7500, "fatigue": 5}


@app.route("/api/recommendation", methods=["GET", "POST"])
def recommendation_endpoint():
    if request.method == "GET":
        payload = DEFAULT_METRICS
    else:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Request body must be a JSON object"}), 400
    try:
        result = service.recommend(payload)
    except InvalidMetricError as err:
        return jsonify({"error": str(err)}), 400
    return jsonify({"project_id": "CSIT-26-S4-03", **result})

if __name__ == "__main__":
    app.run(debug=True, port=5000)