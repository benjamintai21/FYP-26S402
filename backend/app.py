import logging
from functools import wraps
from datetime import datetime, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS

from ml.service import InvalidMetricError, RecommendationService
from database import init_db, SessionLocal
from models import User, DailyLog
from auth import hash_password, verify_password, create_access_token, verify_token

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app, origins=["http://localhost", "http://localhost:5173", "capacitor://localhost"])
service = RecommendationService()

DEFAULT_METRICS = {"sleep": 6.5, "heartRate": 72, "steps": 7500, "fatigue": 5}


@app.before_request
def startup():
    if not hasattr(app, 'db_initialized'):
        init_db()
        app.db_initialized = True


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user_id = verify_token(token)
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


@app.route('/api/register', methods=['POST'])
def register():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password') or not data.get('name'):
            return jsonify({'error': 'Missing email, password, or name'}), 400
        if len(data['password']) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        existing = db.query(User).filter(User.email == data['email']).first()
        if existing:
            return jsonify({'error': 'Email already registered'}), 409

        user = User(
            email=data['email'],
            password_hash=hash_password(data['password']),
            name=data['name']
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(user.user_id)
        return jsonify({
            'token': token,
            'user': {'user_id': user.user_id, 'email': user.email, 'name': user.name, 'onboarded': user.onboarded}
        }), 201
    except Exception as err:
        db.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        db.close()


@app.route('/api/login', methods=['POST'])
def login():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Missing email or password'}), 400

        user = db.query(User).filter(User.email == data['email']).first()
        if not user or not verify_password(data['password'], user.password_hash):
            return jsonify({'error': 'Invalid email or password'}), 401

        token = create_access_token(user.user_id)
        return jsonify({
            'token': token,
            'user': {'user_id': user.user_id, 'email': user.email, 'name': user.name, 'onboarded': user.onboarded}
        }), 200
    except Exception as err:
        return jsonify({'error': str(err)}), 500
    finally:
        db.close()


@app.route('/api/me', methods=['GET'])
@require_auth
def get_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == request.user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({
            'user': {'user_id': user.user_id, 'email': user.email, 'name': user.name, 'onboarded': user.onboarded}
        }), 200
    finally:
        db.close()


@app.route('/api/log-metrics', methods=['POST'])
@require_auth
def log_metrics():
    db = SessionLocal()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({'error': 'Request body must be a JSON object'}), 400

        try:
            result = service.recommend(payload)
        except InvalidMetricError as err:
            return jsonify({'error': str(err)}), 400

        log_entry = DailyLog(
            user_id=request.user_id,
            date=payload.get('date', datetime.now().strftime('%Y-%m-%d')),
            sleep=payload.get('sleep'),
            heart_rate=payload.get('heartRate'),
            steps=payload.get('steps'),
            fatigue=payload.get('fatigue')
        )
        db.add(log_entry)
        db.commit()

        return jsonify({'project_id': 'CSIT-26-S4-03', **result}), 200
    except Exception as err:
        db.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        db.close()


@app.route('/api/trends', methods=['GET'])
@require_auth
def get_trends():
    db = SessionLocal()
    try:
        cutoff = (datetime.now().date() - timedelta(days=29)).strftime('%Y-%m-%d')
        logs = (
            db.query(DailyLog)
            .filter(DailyLog.user_id == request.user_id, DailyLog.date >= cutoff)
            .order_by(DailyLog.date.desc())
            .all()
        )
        return jsonify({
            'logs': [
                {
                    'date': log.date,
                    'sleep': log.sleep,
                    'heartRate': log.heart_rate,
                    'steps': log.steps,
                    'fatigue': log.fatigue
                } for log in logs
            ]
        }), 200
    finally:
        db.close()


@app.route('/api/whatif', methods=['POST'])
@require_auth
def what_if():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'Request body must be a JSON object'}), 400

    try:
        result = service.recommend(payload)
    except InvalidMetricError as err:
        return jsonify({'error': str(err)}), 400
    return jsonify({'project_id': 'CSIT-26-S4-03', **result}), 200


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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)