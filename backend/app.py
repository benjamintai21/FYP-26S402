from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
# Enable CORS so React (localhost:5173) can talk to Flask (localhost:5000)
CORS(app)

@app.route('/api/recommendation', methods=['GET'])
def get_recommendation():
    return jsonify({
        "project_id": "CSIT-26-S4-03",
        "recommendation": "Active Recovery: 30-Minute Light Walk",
        "explanation": "We recommended active recovery instead of high-intensity cardio because your sleep dropped below baseline and your resting heart rate is elevated.",
        "shap_factors": [
            {"feature": "Sleep Duration (5.2 hrs)", "impact": -45},
            {"feature": "Resting Heart Rate (74 bpm)", "impact": -30},
            {"feature": "Yesterday's Steps (8,400)", "impact": +15}
        ],
        "what_if": "If your sleep reaches 7.5 hours tonight, tomorrow's plan will scale up to Moderate Cardio."
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)