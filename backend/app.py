from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/recommendation', methods=['GET', 'POST'])
def recommendation_endpoint():
    # Read metrics sent by user slider, or fall back to baseline defaults
    metrics = request.get_json(silent=True) or {
        "sleep": 6.5,
        "heartRate": 72,
        "steps": 7500,
        "fatigue": 5
    }

    sleep = metrics.get('sleep', 6.5)
    fatigue = metrics.get('fatigue', 5)
    hr = metrics.get('heartRate', 72)
    steps = metrics.get('steps', 7500)

    # Dynamic recommendation logic mimicking ML decision boundary
    if sleep < 6.0 or fatigue >= 7 or hr > 78:
        plan = "Active Recovery: 30-Minute Light Walk"
        explanation = f"Recommended active recovery because your sleep ({sleep} hrs) dropped below your 7.5 hr baseline and resting heart rate ({hr} bpm) is elevated."
        shap_factors = [
            {"feature": f"Sleep ({sleep} hrs)", "impact": -45},
            {"feature": f"Resting HR ({hr} bpm)", "impact": -30},
            {"feature": f"Steps ({steps:,})", "impact": +15}
        ]
        what_if = "If your sleep reaches 7.5 hours tonight and fatigue drops under 5, tomorrow's plan scales up to Moderate Cardio."
    else:
        plan = "Moderate Cardio & Tempo Training"
        explanation = f"Your recovery signals are healthy (Sleep: {sleep} hrs, Resting HR: {hr} bpm). You are cleared for moderate endurance activity."
        shap_factors = [
            {"feature": f"Sleep ({sleep} hrs)", "impact": +40},
            {"feature": f"Resting HR ({hr} bpm)", "impact": +25},
            {"feature": f"Fatigue Level ({fatigue}/10)", "impact": +15}
        ]
        what_if = "To reach High-Intensity Interval Training (HIIT), aim for 8,500+ daily steps while maintaining sleep above 7.0 hours."

    return jsonify({
        "project_id": "CSIT-26-S4-03",
        "recommendation": plan,
        "explanation": explanation,
        "shap_factors": shap_factors,
        "what_if": what_if
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)