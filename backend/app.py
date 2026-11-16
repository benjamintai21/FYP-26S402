import logging
import hashlib
import hmac
import os
import secrets
import uuid
from functools import wraps
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ml.service import InvalidMetricError, RecommendationService
from database import init_db, SessionLocal
from models import User, UserProfile, DailyLog, Recommendation, UserPreference, FitnessGoal, RevokedToken, BusinessService, BusinessEvent, BusinessPost, EventRegistration, ServiceReservation, EventNotification, Feedback, SubscriptionPlan, UserSubscription, GeneratedPlan, EducationalArticle, Challenge, ChallengeEntry, Cohort, CohortMember, Consent, ActivityLog
from ml.config import SHORT_PLANS
from auth import hash_password, verify_password, create_access_token, verify_token

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app, origins=["http://localhost", "http://localhost:5173", "capacitor://localhost"])
service = RecommendationService()

DEFAULT_METRICS = {"sleep": 6.5, "heartRate": 72, "steps": 7500, "fatigue": 5}
MEMBER_ROLES = ('registered', 'premium')
PROFILE_ROLES = {'member': MEMBER_ROLES, 'business': ('business',)}


@app.errorhandler(500)
def internal_error(_error):
    return jsonify({'error': 'An internal error occurred'}), 500


def user_payload(user):
    return {
        'user_id': user.user_id, 'email': user.email, 'name': user.name,
        'onboarded': user.onboarded, 'role': user.role,
    }


def profile_payload(profile):
    return {
        'ageBracket': profile.age_bracket,
        'activityLevel': profile.activity_tier,
        'baseline': {
            'sleep': float(profile.target_sleep_hours), 'heartRate': profile.baseline_resting_hr,
            'steps': profile.baseline_steps, 'fatigue': profile.baseline_fatigue,
        },
    }


def refresh_subscription_role(db, user):
    if user.role not in MEMBER_ROLES:
        return
    subscription = db.query(UserSubscription).filter_by(user_id=user.id).order_by(UserSubscription.subscription_id.desc()).first()
    if subscription:
        eligible = subscription.status in ('active', 'cancelled') and subscription.renewal_date >= date.today()
        role = 'premium' if eligible else 'registered'
        changed = False
        if not eligible and subscription.status != 'expired':
            subscription.status = 'expired'
            changed = True
        if user.role != role:
            user.role = role
            changed = True
        if changed:
            db.commit()


def goal_payload(goal):
    return {
        'id': goal.goal_id, 'title': goal.title, 'category': goal.category,
        'target': float(goal.target_value), 'current': float(goal.current_value),
        'unit': goal.unit, 'deadline': goal.deadline.isoformat() if goal.deadline else None,
        'status': goal.status,
    }


def validate_goal(data):
    if not isinstance(data, dict):
        raise ValueError('A goal object is required')
    title, unit, category = data.get('title'), data.get('unit'), data.get('category')
    if not isinstance(title, str) or not title.strip() or len(title) > 150:
        raise ValueError('A title of at most 150 characters is required')
    if not isinstance(unit, str) or not unit.strip() or len(unit) > 30:
        raise ValueError('A unit of at most 30 characters is required')
    if category not in ('steps', 'sleep', 'cardio_minutes', 'recovery_days', 'general_fitness'):
        raise ValueError('Invalid goal category')
    try:
        target = Decimal(str(data.get('target')))
        current = Decimal(str(data.get('current', 0)))
        if not target.is_finite() or not current.is_finite() or not 0 < target <= Decimal('999999.99') or not 0 <= current <= Decimal('999999.99'):
            raise ValueError('Invalid goal values')
        if target.as_tuple().exponent < -2 or current.as_tuple().exponent < -2:
            raise ValueError('Goal values may have at most two decimal places')
    except (InvalidOperation, TypeError):
        raise ValueError('Invalid goal values')
    try:
        deadline = date.fromisoformat(data['deadline']) if data.get('deadline') else None
    except (ValueError, TypeError):
        raise ValueError('Deadline must be an ISO date')
    status = data.get('status', 'active')
    if status not in ('active', 'completed', 'archived'):
        raise ValueError('Invalid goal status')
    return dict(title=title.strip(), unit=unit.strip(), category=category, target_value=target,
                current_value=current, deadline=deadline, status=status)


def business_payload(resource, item):
    if resource == 'services':
        return {'id': item.service_id, 'title': item.title, 'category': item.category,
                'description': item.description, 'price': float(item.price),
                'schedule': item.schedule_info, 'active': item.is_active}
    if resource == 'events':
        return {'id': item.event_id, 'title': item.title, 'description': item.description,
                'dateTime': item.event_datetime.isoformat(timespec='minutes'), 'venue': item.venue,
                'capacity': item.capacity, 'status': item.status}
    return {'id': item.post_id, 'title': item.title, 'body': item.body, 'type': item.post_type,
            'expiresAt': item.expires_at.isoformat(timespec='minutes') if item.expires_at else None}


def validate_business_item(resource, data):
    if not isinstance(data, dict):
        raise ValueError('An item object is required')
    title = data.get('title')
    if not isinstance(title, str) or not title.strip() or len(title) > (180 if resource == 'posts' else 150):
        raise ValueError('A valid title is required')
    content_key = 'body' if resource == 'posts' else 'description'
    content = data.get(content_key)
    if not isinstance(content, str) or not content.strip() or len(content) > 5000:
        raise ValueError('Description must contain 1 to 5000 characters')
    if resource == 'services':
        category, schedule = data.get('category'), data.get('schedule')
        if category not in ('personal_training', 'group_class', 'gym_membership', 'wellness_program'):
            raise ValueError('Invalid service category')
        if not isinstance(schedule, str) or not schedule.strip() or len(schedule) > 255:
            raise ValueError('A valid schedule is required')
        try:
            price = Decimal(str(data.get('price')))
            if not price.is_finite() or not 0 <= price <= Decimal('999999.99') or price.as_tuple().exponent < -2:
                raise ValueError('Invalid price')
        except (InvalidOperation, TypeError):
            raise ValueError('Invalid price')
        return {'title': title.strip(), 'description': content.strip(), 'category': category,
                'schedule_info': schedule.strip(), 'price': price}
    if resource == 'events':
        venue, capacity = data.get('venue'), data.get('capacity')
        if not isinstance(venue, str) or not venue.strip() or len(venue) > 255:
            raise ValueError('A valid venue is required')
        if isinstance(capacity, bool) or not isinstance(capacity, int) or not 1 <= capacity <= 100000:
            raise ValueError('Invalid capacity')
        try:
            event_date = datetime.fromisoformat(data.get('dateTime', ''))
            if event_date.tzinfo is not None:
                raise ValueError('Time zones are not supported')
        except (TypeError, ValueError):
            raise ValueError('A valid local date and time is required')
        return {'title': title.strip(), 'description': content.strip(), 'venue': venue.strip(),
                'capacity': capacity, 'event_datetime': event_date}
    if data.get('type') not in ('tip', 'promotion', 'announcement'):
        raise ValueError('Invalid post type')
    expires = data.get('expiresAt')
    try:
        expires_at = datetime.fromisoformat(expires) if expires else None
        if expires_at and expires_at.tzinfo is not None:
            raise ValueError('Time zones are not supported')
    except (TypeError, ValueError):
        raise ValueError('Invalid expiry date')
    return {'title': title.strip(), 'body': content.strip(), 'post_type': data['type'], 'expires_at': expires_at}


@app.before_request
def startup():
    if not hasattr(app, 'db_initialized'):
        init_db()
        app.db_initialized = True


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        token_data = verify_token(token)
        if not token_data:
            return jsonify({'error': 'Unauthorized'}), 401
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.user_id == token_data['sub']).first()
            revoked = db.query(RevokedToken).filter_by(token_id=token_data['jti']).first()
            if not user or not user.is_active or user.session_version != token_data['ver'] or revoked:
                return jsonify({'error': 'Unauthorized'}), 401
            refresh_subscription_role(db, user)
            request.user_id = user.user_id
            request.user_role = user.role
            request.token_data = token_data
        finally:
            db.close()
        return f(*args, **kwargs)
    return decorated


def require_roles(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.user_role not in roles:
                return jsonify({'error': 'Forbidden'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


@app.route('/api/register', methods=['POST'])
def register():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key].strip() for key in ('email', 'password', 'name')):
            return jsonify({'error': 'Missing email, password, or name'}), 400
        if len(data['password']) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        role = data.get('role', 'registered')
        if role not in ('registered', 'business'):
            return jsonify({'error': 'Invalid registration role'}), 400
        if data.get('consent') is not True:
            return jsonify({'error': 'Consent is required'}), 400

        existing = db.query(User).filter(User.email == data['email']).first()
        if existing:
            return jsonify({'error': 'Email already registered'}), 409

        user = User(
            email=data['email'],
            password_hash=hash_password(data['password']),
            name=data['name'],
            role=role,
        )
        db.add(user)
        db.flush()
        db.add(UserProfile(user_id=user.id, display_name=data['name'][:100]))
        db.add(Consent(user_id=user.id, consent_type='pdpa_lifestyle_processing' if role == 'registered' else 'business_account_processing',
                       policy_version='v1.0', is_granted=True))
        db.commit()
        db.refresh(user)

        token = create_access_token(user.user_id, user.session_version)
        return jsonify({
            'token': token,
            'user': user_payload(user)
        }), 201
    except Exception:
        db.rollback()
        app.logger.exception('Registration failed')
        return jsonify({'error': 'Could not create account'}), 500
    finally:
        db.close()


@app.route('/api/login', methods=['POST'])
def login():
    db = SessionLocal()
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key] for key in ('email', 'password')):
            return jsonify({'error': 'Missing email or password'}), 400
        profile = data.get('profile')
        if profile is not None and (not isinstance(profile, str) or profile not in PROFILE_ROLES):
            return jsonify({'error': 'Invalid account type'}), 400

        user = db.query(User).filter(User.email == data['email']).first()
        if (not user or not user.is_active or user.role not in (*MEMBER_ROLES, 'business')
                or not verify_password(data['password'], user.password_hash)
                or (profile is not None and user.role not in PROFILE_ROLES[profile])):
            return jsonify({'error': 'Invalid email, password, or account type'}), 401

        refresh_subscription_role(db, user)
        token = create_access_token(user.user_id, user.session_version)
        result = user_payload(user)
        if user.role in MEMBER_ROLES:
            profile_row = db.query(UserProfile).filter_by(user_id=user.id).one()
            result.update(profile_payload(profile_row))
        return jsonify({
            'token': token,
            'user': result
        }), 200
    except Exception:
        app.logger.exception('Login failed')
        return jsonify({'error': 'Could not sign in'}), 500
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
        result = user_payload(user)
        if user.role in MEMBER_ROLES:
            profile = db.query(UserProfile).filter_by(user_id=user.id).first()
            if not profile:
                app.logger.error('Profile missing for account')
                return jsonify({'error': 'Account profile unavailable'}), 500
            result.update(profile_payload(profile))
        return jsonify({'user': result}), 200
    finally:
        db.close()


@app.route('/api/logout', methods=['POST'])
@require_auth
def logout():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        db.add(RevokedToken(
            token_id=request.token_data['jti'], user_id=user.id,
            expires_at=datetime.fromtimestamp(request.token_data['exp'], timezone.utc).replace(tzinfo=None),
        ))
        db.commit()
        return jsonify({'message': 'Logged out'}), 200
    finally:
        db.close()


@app.route('/api/onboarding', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def onboarding():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('baseline'), dict):
        return jsonify({'error': 'A profile and baseline are required'}), 400
    age = data.get('ageBracket')
    activity = data.get('activityLevel')
    if age not in ('18-29', '30-44', '45-59', '60+') or activity not in ('sedentary', 'light', 'moderate', 'very_active'):
        return jsonify({'error': 'Invalid age bracket or activity level'}), 400
    baseline = data['baseline']
    ranges = {'sleep': (3, 12), 'heartRate': (45, 110), 'steps': (1000, 20000), 'fatigue': (1, 10)}
    for key, (low, high) in ranges.items():
        value = baseline.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
            return jsonify({'error': f'Invalid baseline {key}'}), 400
    for key in ('heartRate', 'steps'):
        if int(baseline[key]) != baseline[key]:
            return jsonify({'error': f'{key} must be a whole number'}), 400
    if Decimal(str(baseline['sleep'])).as_tuple().exponent < -1:
        return jsonify({'error': 'Sleep may have at most one decimal place'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        profile.age_bracket = age
        profile.activity_tier = activity
        profile.target_sleep_hours = baseline['sleep']
        profile.baseline_resting_hr = baseline['heartRate']
        profile.baseline_steps = baseline['steps']
        profile.baseline_fatigue = baseline['fatigue']
        user.onboarded = True
        db.commit()
        return jsonify({'user': {**user_payload(user), **profile_payload(profile)}}), 200
    finally:
        db.close()


@app.route('/api/change-password', methods=['POST'])
@require_auth
def change_password():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key] for key in ('currentPassword', 'newPassword')):
        return jsonify({'error': 'Current and new passwords are required'}), 400
    if len(data['newPassword']) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if not verify_password(data['currentPassword'], user.password_hash):
            return jsonify({'error': 'Current password is incorrect'}), 400
        user.password_hash = hash_password(data['newPassword'])
        user.session_version += 1
        db.commit()
        return jsonify({'message': 'Password changed. Other sessions were signed out.',
                        'token': create_access_token(user.user_id, user.session_version)}), 200
    finally:
        db.close()


@app.route('/api/preferences', methods=['GET', 'PUT'])
@require_auth
@require_roles(*MEMBER_ROLES)
def preferences():
    data = request.get_json(silent=True) if request.method == 'PUT' else None
    if request.method == 'PUT':
        if not isinstance(data, dict):
            return jsonify({'error': 'Preferences must be an object'}), 400
        minutes = data.get('availableMinutes')
        if isinstance(minutes, bool) or not isinstance(minutes, int) or not 0 <= minutes <= 1440:
            return jsonify({'error': 'Available minutes must be between 0 and 1440'}), 400
        for key in ('workout', 'dietary'):
            values = data.get(key)
            if not isinstance(values, list) or len(values) > 30 or any(
                not isinstance(item, str) or not item.strip() or len(item) > 100 for item in values
            ):
                return jsonify({'error': f'{key} must be a list of preferences'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        prefs = db.query(UserPreference).filter_by(user_id=user.id).first()
        if request.method == 'PUT':
            if not prefs:
                prefs = UserPreference(user_id=user.id)
                db.add(prefs)
            prefs.available_minutes_per_day = data['availableMinutes']
            prefs.workout_preferences_json = [value.strip() for value in data['workout']]
            prefs.dietary_preferences_json = [value.strip() for value in data['dietary']]
            db.commit()
        return jsonify({
            'availableMinutes': prefs.available_minutes_per_day if prefs else 45,
            'workout': prefs.workout_preferences_json or [] if prefs else [],
            'dietary': prefs.dietary_preferences_json or [] if prefs else [],
        }), 200
    finally:
        db.close()


@app.route('/api/activities', methods=['GET', 'POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def activities():
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST':
        if not isinstance(data, dict):
            return jsonify({'error': 'Activity details are required'}), 400
        title, notes, duration = data.get('title'), data.get('notes', ''), data.get('duration')
        if not isinstance(title, str) or not title.strip() or len(title) > 150:
            return jsonify({'error': 'A valid title is required'}), 400
        if not isinstance(notes, str) or len(notes) > 1000:
            return jsonify({'error': 'Notes must be at most 1000 characters'}), 400
        if duration is not None and (isinstance(duration, bool) or not isinstance(duration, int) or not 0 <= duration <= 1440):
            return jsonify({'error': 'Duration must be between 0 and 1440 minutes'}), 400
        try:
            activity_date = date.fromisoformat(data.get('date', ''))
        except (TypeError, ValueError):
            return jsonify({'error': 'A valid activity date is required'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        if request.method == 'POST':
            db.add(ActivityLog(pseudonym_token=profile.pseudonym_token, activity_date=activity_date,
                               title=title.strip(), duration_minutes=duration, notes=notes.strip() or None))
            db.commit()
        rows = db.query(ActivityLog).filter_by(pseudonym_token=profile.pseudonym_token).order_by(
            ActivityLog.activity_date.desc(), ActivityLog.activity_id.desc()).limit(100).all()
        return jsonify({'activities': [{'id': row.activity_id, 'date': row.activity_date.isoformat(),
                                        'title': row.title, 'duration': row.duration_minutes,
                                        'notes': row.notes} for row in rows]}), 201 if request.method == 'POST' else 200
    finally:
        db.close()


@app.route('/api/activities/<int:activity_id>', methods=['DELETE'])
@require_auth
@require_roles(*MEMBER_ROLES)
def delete_activity(activity_id):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        activity = db.query(ActivityLog).filter_by(activity_id=activity_id, pseudonym_token=profile.pseudonym_token).first()
        if not activity:
            return jsonify({'error': 'Activity not found'}), 404
        db.delete(activity)
        db.commit()
        return jsonify({'message': 'Activity deleted'}), 200
    finally:
        db.close()


@app.route('/api/subscription', methods=['GET', 'POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def subscription():
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST' and (not isinstance(data, dict) or data.get('action') not in ('start', 'cancel', 'renew')):
        return jsonify({'error': 'Invalid subscription action'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).with_for_update().one()
        plan = db.query(SubscriptionPlan).filter_by(tier_code='premium', is_active=True).first()
        if not plan:
            return jsonify({'error': 'Premium plan is not configured'}), 503
        current = db.query(UserSubscription).filter_by(user_id=user.id).order_by(UserSubscription.subscription_id.desc()).first()
        today = date.today()
        if request.method == 'POST':
            action = data['action']
            if action == 'start':
                if current and current.renewal_date >= today and current.status in ('active', 'cancelled'):
                    return jsonify({'error': 'You already have an active test subscription'}), 409
                current = UserSubscription(user_id=user.id, plan_id=plan.plan_id, status='active',
                                           start_date=today, renewal_date=today + timedelta(days=30))
                db.add(current)
                user.role = 'premium'
            elif action == 'cancel':
                if not current or current.status != 'active' or current.renewal_date < today:
                    return jsonify({'error': 'No active subscription to cancel'}), 409
                current.status = 'cancelled'
                current.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                if not current:
                    return jsonify({'error': 'Start a test subscription first'}), 409
                current.renewal_date = max(today, current.renewal_date) + timedelta(days=30)
                current.status = 'active'
                current.cancelled_at = None
                user.role = 'premium'
            db.commit()
        return jsonify({
            'mode': 'manual_test', 'plan': plan.plan_name, 'referencePrice': float(plan.price_monthly),
            'currency': plan.currency, 'benefits': plan.benefits_json,
            'subscription': None if not current else {
                'status': current.status, 'startDate': current.start_date.isoformat(),
                'accessUntil': current.renewal_date.isoformat(),
            },
            'role': user.role,
        }), 200
    finally:
        db.close()


@app.route('/api/premium/plans', methods=['GET', 'POST'])
@require_auth
@require_roles('premium')
def premium_plans():
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST' and (not isinstance(data, dict) or data.get('type') not in ('workout', 'meal')):
        return jsonify({'error': 'Choose workout or meal'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if request.method == 'POST':
            prefs = db.query(UserPreference).filter_by(user_id=user.id).first()
            goals = db.query(FitnessGoal).filter_by(user_id=user.id, status='active').all()
            goal_titles = [goal.title for goal in goals]
            if data['type'] == 'workout':
                minutes = prefs.available_minutes_per_day if prefs else 45
                if minutes < 1:
                    return jsonify({'error': 'Set a positive amount of available time first'}), 400
                requested = [item.lower() for item in (prefs.workout_preferences_json or [])] if prefs else []
                supported = {'walking', 'cycling', 'yoga'}
                if any(item not in supported for item in requested):
                    return jsonify({'error': 'Workout suggestions currently support walking, cycling, and yoga only'}), 400
                categories = {goal.category for goal in goals}
                activity = 'walking' if 'steps' in categories and (not requested or 'walking' in requested) else requested[0] if requested else 'walking'
                duration = min(minutes, 30)
                third_session = ('Session 3: choose rest or gentle movement for your recovery goal.'
                                 if 'recovery_days' in categories else
                                 f'Session 3: repeat {activity} for up to {duration} minutes if comfortable.')
                payload = {
                    'notes': 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.',
                    'goals': goal_titles, 'preferences': requested, 'minutes': duration,
                    'items': [f'Session 1: {activity} for up to {duration} minutes at a comfortable pace.',
                              'Session 2: choose rest or gentle movement.', third_session],
                }
                title = 'Gentle activity ideas'
            else:
                dietary = [item.lower() for item in (prefs.dietary_preferences_json or [])] if prefs else []
                if any(item not in ('vegetarian', 'vegan') for item in dietary):
                    return jsonify({'error': 'Meal ideas currently support vegetarian and vegan preferences only; other restrictions cannot be checked safely'}), 400
                payload = {
                    'notes': 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.',
                    'goals': goal_titles, 'preferences': dietary,
                    'items': ['Breakfast: oats with fruit.', 'Lunch: rice, beans and vegetables.',
                              'Dinner: lentils and vegetables.'],
                }
                title = 'Plant-based meal ideas'
            plan = GeneratedPlan(user_id=user.id, plan_type=data['type'], title=title, plan_payload_json=payload)
            db.add(plan)
            db.commit()
        plans = db.query(GeneratedPlan).filter_by(user_id=user.id).order_by(GeneratedPlan.plan_id.desc()).limit(50).all()
        return jsonify({'plans': [{'id': plan.plan_id, 'type': plan.plan_type, 'title': plan.title,
                                   'details': plan.plan_payload_json} for plan in plans]}), 201 if request.method == 'POST' else 200
    finally:
        db.close()


@app.route('/api/premium/articles', methods=['GET'])
@require_auth
@require_roles('premium')
def premium_articles():
    db = SessionLocal()
    try:
        articles = db.query(EducationalArticle).filter_by(approval_status='approved').order_by(EducationalArticle.article_id.desc()).all()
        return jsonify({'articles': [{'id': article.article_id, 'title': article.title,
                                      'category': article.category, 'summary': article.summary,
                                      'content': article.content_body} for article in articles]}), 200
    finally:
        db.close()


@app.route('/api/premium/goal-insights', methods=['GET'])
@require_auth
@require_roles('premium')
def premium_goal_insights():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        goals = db.query(FitnessGoal).filter_by(user_id=user.id, status='active').all()
        insights = []
        for goal in goals:
            if goal.target_value <= 0:
                continue
            fraction = float(goal.current_value / goal.target_value)
            if fraction >= 1:
                suggestion = 'You have met this target. Consider maintaining it or adjusting it gradually if appropriate.'
            elif fraction < 0.5:
                suggestion = 'Progress is below halfway. If the target feels difficult, consider a smaller target or a longer timeframe.'
            else:
                suggestion = 'You are over halfway. Consider keeping the target or reviewing its timeframe.'
            insights.append({'goal': goal.title, 'progressPercent': round(fraction * 100, 1), 'suggestion': suggestion})
        return jsonify({'insights': insights}), 200
    finally:
        db.close()


@app.route('/api/goals', methods=['GET', 'POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def goals():
    values = None
    if request.method == 'POST':
        try:
            values = validate_goal(request.get_json(silent=True))
        except ValueError as err:
            return jsonify({'error': str(err)}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if values is not None:
            goal = FitnessGoal(user_id=user.id, **values)
            db.add(goal)
            db.commit()
            return jsonify({'goal': goal_payload(goal)}), 201
        return jsonify({'goals': [goal_payload(goal) for goal in db.query(FitnessGoal).filter_by(user_id=user.id).order_by(FitnessGoal.goal_id.desc()).all()]}), 200
    finally:
        db.close()


@app.route('/api/goals/<int:goal_id>', methods=['PUT', 'DELETE'])
@require_auth
@require_roles(*MEMBER_ROLES)
def goal_detail(goal_id):
    values = None
    if request.method == 'PUT':
        try:
            values = validate_goal(request.get_json(silent=True))
        except ValueError as err:
            return jsonify({'error': str(err)}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        goal = db.query(FitnessGoal).filter_by(goal_id=goal_id, user_id=user.id).first()
        if not goal:
            return jsonify({'error': 'Goal not found'}), 404
        if request.method == 'DELETE':
            db.delete(goal)
            db.commit()
            return jsonify({'message': 'Goal deleted'}), 200
        for key, value in values.items():
            setattr(goal, key, value)
        db.commit()
        return jsonify({'goal': goal_payload(goal)}), 200
    finally:
        db.close()


BUSINESS_MODELS = {'services': BusinessService, 'events': BusinessEvent, 'posts': BusinessPost}


@app.route('/api/business/<resource>', methods=['GET', 'POST'])
@require_auth
@require_roles('business')
def business_items(resource):
    model = BUSINESS_MODELS.get(resource)
    if model is None:
        return jsonify({'error': 'Unknown resource'}), 404
    values = None
    if request.method == 'POST':
        try:
            values = validate_business_item(resource, request.get_json(silent=True))
        except ValueError as err:
            return jsonify({'error': str(err)}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if values is not None:
            item = model(business_user_id=user.id, **values)
            db.add(item)
            db.commit()
            return jsonify({'item': business_payload(resource, item)}), 201
        items = db.query(model).filter_by(business_user_id=user.id).all()
        if resource == 'services':
            items = [item for item in items if item.is_active]
        return jsonify({'items': [business_payload(resource, item) for item in items]}), 200
    finally:
        db.close()


@app.route('/api/business/<resource>/<int:item_id>', methods=['PUT', 'DELETE'])
@require_auth
@require_roles('business')
def business_item(resource, item_id):
    model = BUSINESS_MODELS.get(resource)
    if model is None:
        return jsonify({'error': 'Unknown resource'}), 404
    values = None
    if request.method == 'PUT':
        try:
            values = validate_business_item(resource, request.get_json(silent=True))
        except ValueError as err:
            return jsonify({'error': str(err)}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        item = db.query(model).filter_by(business_user_id=user.id).filter(
            model.__table__.primary_key.columns.values()[0] == item_id
        ).with_for_update().first()
        if not item or (resource == 'services' and not item.is_active):
            return jsonify({'error': 'Item not found'}), 404
        if request.method == 'DELETE':
            if resource == 'services':
                item.is_active = False
            elif resource == 'events':
                if item.status != 'scheduled':
                    return jsonify({'error': 'Only scheduled events can be cancelled'}), 400
                item.status = 'cancelled'
            else:
                db.delete(item)
            if resource == 'events':
                registrations = db.query(EventRegistration).filter_by(event_id=item.event_id).all()
                db.add_all([EventNotification(event_id=item.event_id, user_id=registration.user_id,
                                             message=f'Event cancelled: {item.title}') for registration in registrations])
            db.commit()
            return jsonify({'message': 'Item removed' if resource != 'events' else 'Event cancelled'}), 200
        if resource == 'events' and item.status != 'scheduled':
            return jsonify({'error': 'Only scheduled events can be edited'}), 400
        if resource == 'events':
            registrations = db.query(EventRegistration).filter_by(event_id=item.event_id).all()
            if values['capacity'] < len(registrations):
                return jsonify({'error': 'Capacity cannot be below the number of registered attendees'}), 400
        for key, value in values.items():
            setattr(item, key, value)
        if resource == 'events':
            db.add_all([EventNotification(event_id=item.event_id, user_id=registration.user_id,
                                         message=f'Event updated: {item.title}. Check the latest details.') for registration in registrations])
        db.commit()
        return jsonify({'item': business_payload(resource, item)}), 200
    finally:
        db.close()


@app.route('/api/marketplace', methods=['GET'])
def marketplace():
    db = SessionLocal()
    try:
        result = {}
        for resource, model in BUSINESS_MODELS.items():
            query = db.query(model, User.name).join(User, model.business_user_id == User.id).filter(User.is_active.is_(True))
            if resource == 'services':
                query = query.filter(BusinessService.is_active.is_(True))
            elif resource == 'events':
                query = query.filter(BusinessEvent.status == 'scheduled', BusinessEvent.event_datetime >= datetime.now())
            else:
                query = query.filter((BusinessPost.expires_at.is_(None)) | (BusinessPost.expires_at >= datetime.now()))
            result[resource] = [{**business_payload(resource, item), 'business': name} for item, name in query.all()]
        return jsonify(result), 200
    finally:
        db.close()


def challenge_payload(challenge):
    return {'id': challenge.challenge_id, 'title': challenge.title, 'metric': challenge.metric_type,
            'target': challenge.target_value, 'startDate': challenge.start_date.isoformat(),
            'endDate': challenge.end_date.isoformat()}


@app.route('/api/business/challenges', methods=['GET', 'POST'])
@require_auth
@require_roles('business')
def business_challenges():
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST':
        if not isinstance(data, dict):
            return jsonify({'error': 'Challenge details are required'}), 400
        title, target = data.get('title'), data.get('target')
        if not isinstance(title, str) or not title.strip() or len(title) > 150:
            return jsonify({'error': 'A valid title is required'}), 400
        if isinstance(target, bool) or not isinstance(target, int) or not 1 <= target <= 2000000000:
            return jsonify({'error': 'A positive target is required'}), 400
        try:
            start = date.fromisoformat(data.get('startDate', ''))
            end = date.fromisoformat(data.get('endDate', ''))
        except (ValueError, TypeError):
            return jsonify({'error': 'Valid dates are required'}), 400
        if start > end:
            return jsonify({'error': 'End date must be on or after start date'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if request.method == 'POST':
            challenge = Challenge(business_user_id=user.id, title=title.strip(), target_value=target,
                                  metric_type='steps', start_date=start, end_date=end)
            db.add(challenge)
            db.commit()
            return jsonify({'challenge': challenge_payload(challenge)}), 201
        rows = db.query(Challenge).filter_by(business_user_id=user.id).all()
        return jsonify({'challenges': [challenge_payload(row) for row in rows]}), 200
    finally:
        db.close()


@app.route('/api/challenges', methods=['GET'])
def public_challenges():
    db = SessionLocal()
    try:
        rows = db.query(Challenge, User.name).join(User, Challenge.business_user_id == User.id).filter(
            User.is_active.is_(True), Challenge.end_date >= date.today()
        ).all()
        return jsonify({'challenges': [{**challenge_payload(challenge), 'business': name} for challenge, name in rows]}), 200
    finally:
        db.close()


@app.route('/api/challenges/<int:challenge_id>/participation', methods=['POST', 'DELETE'])
@require_auth
@require_roles(*MEMBER_ROLES)
def challenge_participation(challenge_id):
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST' and (not isinstance(data, dict) or data.get('consent') is not True):
        return jsonify({'error': 'Explicit consent to a public pseudonymous score is required'}), 400
    db = SessionLocal()
    try:
        challenge = db.query(Challenge).filter_by(challenge_id=challenge_id).first()
        if not challenge or (request.method == 'POST' and challenge.end_date < date.today()):
            return jsonify({'error': 'Challenge is unavailable'}), 404
        user = db.query(User).filter_by(user_id=request.user_id).one()
        entry = db.query(ChallengeEntry).filter_by(challenge_id=challenge_id, user_id=user.id).first()
        if request.method == 'DELETE':
            if not entry:
                return jsonify({'error': 'Not participating'}), 404
            db.delete(entry)
            db.commit()
            return jsonify({'message': 'Participation removed'}), 200
        if entry and entry.participant_token:
            return jsonify({'error': 'Already participating'}), 409
        if not entry:
            entry = ChallengeEntry(challenge_id=challenge_id, user_id=user.id)
            db.add(entry)
        entry.participant_token = str(uuid.uuid4())
        db.commit()
        return jsonify({'participant': entry.participant_token}), 201
    except IntegrityError:
        db.rollback()
        return jsonify({'error': 'Already participating'}), 409
    finally:
        db.close()


@app.route('/api/challenges/<int:challenge_id>/leaderboard', methods=['GET'])
def challenge_leaderboard(challenge_id):
    db = SessionLocal()
    try:
        challenge = db.query(Challenge).filter_by(challenge_id=challenge_id).first()
        if not challenge:
            return jsonify({'error': 'Challenge not found'}), 404
        entries = db.query(ChallengeEntry, UserProfile).join(
            UserProfile, UserProfile.user_id == ChallengeEntry.user_id
        ).filter(ChallengeEntry.challenge_id == challenge_id, ChallengeEntry.participant_token.isnot(None)).all()
        standings = []
        for entry, profile in entries:
            daily = db.query(DailyLog.date, func.max(DailyLog.steps)).filter(
                DailyLog.pseudonym_token == profile.pseudonym_token,
                DailyLog.is_simulated.is_(False),
                DailyLog.date >= challenge.start_date.isoformat(),
                DailyLog.date <= challenge.end_date.isoformat(),
                DailyLog.steps.isnot(None),
            ).group_by(DailyLog.date).all()
            score = sum(max(0, min(20000, int(steps))) for _, steps in daily)
            standings.append({'participant': entry.participant_token, 'score': score})
        standings.sort(key=lambda item: (-item['score'], item['participant']))
        return jsonify({'challenge': challenge_payload(challenge), 'standings': standings,
                        'note': 'Scores use non-simulated logs, capped at 20,000 steps per day.'}), 200
    finally:
        db.close()


@app.route('/api/business/cohort', methods=['GET', 'POST'])
@require_auth
@require_roles('business')
def business_cohort():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).with_for_update().one()
        cohort = db.query(Cohort).filter_by(business_user_id=user.id).order_by(Cohort.cohort_id).first()
        if not cohort and request.method == 'POST':
            cohort = Cohort(business_user_id=user.id, cohort_name='Opt-in activity cohort')
            db.add(cohort)
            db.commit()
        return jsonify({'cohort': {'id': cohort.cohort_id, 'name': cohort.cohort_name} if cohort else None}), 200
    finally:
        db.close()


@app.route('/api/cohorts', methods=['GET'])
def public_cohorts():
    db = SessionLocal()
    try:
        rows = db.query(Cohort, User.name).join(User, Cohort.business_user_id == User.id).filter(User.is_active.is_(True)).all()
        return jsonify({'cohorts': [{'id': cohort.cohort_id, 'name': cohort.cohort_name, 'business': name} for cohort, name in rows]}), 200
    finally:
        db.close()


@app.route('/api/cohorts/<int:cohort_id>/participation', methods=['POST', 'DELETE'])
@require_auth
@require_roles(*MEMBER_ROLES)
def cohort_participation(cohort_id):
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST' and (not isinstance(data, dict) or data.get('consent') is not True):
        return jsonify({'error': 'Explicit consent to aggregate sharing is required'}), 400
    db = SessionLocal()
    try:
        cohort = db.query(Cohort).filter_by(cohort_id=cohort_id).first()
        if not cohort:
            return jsonify({'error': 'Cohort not found'}), 404
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        member = db.query(CohortMember).filter_by(cohort_id=cohort_id, pseudonym_token=profile.pseudonym_token).first()
        if request.method == 'POST':
            if member:
                return jsonify({'error': 'Already participating'}), 409
            db.add(CohortMember(cohort_id=cohort_id, pseudonym_token=profile.pseudonym_token))
        else:
            if not member:
                return jsonify({'error': 'Not participating'}), 404
            db.delete(member)
        db.add(Consent(user_id=user.id, consent_type='cohort_anonymized_sharing',
                       policy_version=f'c{cohort_id}:v1', is_granted=request.method == 'POST',
                       revoked_at=datetime.now(timezone.utc).replace(tzinfo=None) if request.method == 'DELETE' else None))
        db.commit()
        return jsonify({'message': 'Participation saved' if request.method == 'POST' else 'Participation removed'}), 200
    except IntegrityError:
        db.rollback()
        return jsonify({'error': 'Already participating'}), 409
    finally:
        db.close()


@app.route('/api/business/analytics', methods=['GET'])
@require_auth
@require_roles('business')
def business_analytics():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        cohort = db.query(Cohort).filter_by(business_user_id=user.id).order_by(Cohort.cohort_id).first()
        if not cohort:
            return jsonify({'error': 'Enable an opt-in cohort first'}), 404
        today = date.today()
        cutoff = (today - timedelta(days=29)).isoformat()
        rows = db.query(DailyLog).join(CohortMember, DailyLog.pseudonym_token == CohortMember.pseudonym_token).filter(
            CohortMember.cohort_id == cohort.cohort_id, DailyLog.is_simulated.is_(False),
            DailyLog.date >= cutoff, DailyLog.date <= today.isoformat(),
        ).order_by(DailyLog.log_id).all()
        daily = {}
        for log in rows:
            key = (log.pseudonym_token, log.date)
            values = daily.setdefault(key, {})
            if log.steps is not None:
                values['steps'] = log.steps
            if log.sleep is not None:
                values['sleep'] = log.sleep
        metrics = {}
        for field in ('steps', 'sleep'):
            by_member = {}
            for (token, _), values in daily.items():
                if field in values:
                    by_member.setdefault(token, []).append(values[field])
            if len(by_member) >= 5:
                averages = [sum(values) / len(values) for values in by_member.values()]
                metrics[field] = {'contributors': len(by_member), 'average': round(sum(averages) / len(averages), 1)}
            else:
                metrics[field] = None
        dates = sorted({log_date for _, log_date in daily})
        trend = []
        for log_date in dates:
            values = [values['steps'] for (_, day), values in daily.items() if day == log_date and 'steps' in values]
            if len(values) >= 5:
                trend.append({'date': log_date, 'contributors': len(values), 'averageSteps': round(sum(values) / len(values), 1)})
        return jsonify({'metrics': metrics, 'stepsTrend': trend,
                        'note': 'Opt-in aggregates only; each displayed value has at least five contributors. Simulated data is excluded. Thresholding alone does not guarantee anonymity.'}), 200
    finally:
        db.close()


@app.route('/api/public-feedback', methods=['GET'])
def public_feedback():
    db = SessionLocal()
    try:
        rows = db.query(Feedback).filter_by(is_public_featured=True).order_by(Feedback.feedback_id.desc()).limit(50).all()
        return jsonify({'feedback': [{
            'id': row.feedback_id, 'clarity': row.clarity_score, 'trust': row.trust_score,
            'comment': row.comment_text,
        } for row in rows]}), 200
    finally:
        db.close()


@app.route('/api/feedback', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def submit_feedback():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Feedback must be an object'}), 400
    for key in ('clarity', 'trust'):
        score = data.get(key)
        if score is not None and (isinstance(score, bool) or not isinstance(score, int) or not 1 <= score <= 5):
            return jsonify({'error': f'{key} must be between 1 and 5'}), 400
    comment = data.get('comment', '')
    public = data.get('public', False)
    rec_id = data.get('recommendation_id')
    adherence = data.get('adherence')
    if not isinstance(comment, str) or len(comment) > 1000 or not isinstance(public, bool):
        return jsonify({'error': 'Invalid feedback'}), 400
    if rec_id is not None and (isinstance(rec_id, bool) or not isinstance(rec_id, int) or rec_id < 1):
        return jsonify({'error': 'Invalid recommendation ID'}), 400
    if adherence is not None and (adherence not in ('completed', 'skipped') or rec_id is None):
        return jsonify({'error': 'Invalid adherence selection'}), 400
    has_feedback = bool(data.get('clarity') or data.get('trust') or comment.strip())
    if not has_feedback and (adherence is None or public):
        return jsonify({'error': 'Provide feedback before submitting'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if rec_id is not None:
            recommendation = db.query(Recommendation).join(DailyLog).join(
                UserProfile, DailyLog.pseudonym_token == UserProfile.pseudonym_token
            ).filter(Recommendation.rec_id == rec_id, UserProfile.user_id == user.id).first()
            if not recommendation:
                return jsonify({'error': 'Recommendation not found'}), 404
            if adherence is not None:
                recommendation.adherence_status = adherence
        if has_feedback:
            db.add(Feedback(user_id=user.id, rec_id=rec_id, clarity_score=data.get('clarity'), trust_score=data.get('trust'),
                            comment_text=comment.strip() or None, is_public_featured=public))
        db.commit()
        return jsonify({'message': 'Feedback saved'}), 201
    finally:
        db.close()


@app.route('/api/marketplace/<resource>/<int:item_id>/reserve', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def reserve_marketplace_item(resource, item_id):
    if resource not in ('services', 'events'):
        return jsonify({'error': 'Unknown resource'}), 404
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if resource == 'services':
            item = db.query(BusinessService).filter_by(service_id=item_id, is_active=True).with_for_update().first()
            if not item:
                return jsonify({'error': 'Service not available'}), 404
            reservation = ServiceReservation(service_id=item_id, user_id=user.id)
        else:
            item = db.query(BusinessEvent).filter_by(event_id=item_id, status='scheduled').with_for_update().first()
            if not item or item.event_datetime < datetime.now():
                return jsonify({'error': 'Event not available'}), 404
            if db.query(EventRegistration).filter_by(event_id=item_id).count() >= item.capacity:
                return jsonify({'error': 'Event is full'}), 409
            reservation = EventRegistration(event_id=item_id, user_id=user.id)
        db.add(reservation)
        db.commit()
        return jsonify({'message': 'Reservation recorded'}), 201
    except IntegrityError:
        db.rollback()
        return jsonify({'error': 'Already reserved'}), 409
    finally:
        db.close()


@app.route('/api/event-notifications', methods=['GET'])
@require_auth
@require_roles(*MEMBER_ROLES)
def event_notifications():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        notices = db.query(EventNotification, BusinessEvent).join(
            BusinessEvent, EventNotification.event_id == BusinessEvent.event_id
        ).filter(EventNotification.user_id == user.id).order_by(EventNotification.notification_id.desc()).all()
        return jsonify({'notifications': [
            {'id': notice.notification_id, 'message': notice.message,
             'event': business_payload('events', event)} for notice, event in notices
        ]}), 200
    finally:
        db.close()


@app.route('/api/simulated-wearable-sync', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def simulated_wearable_sync():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        db.add(DailyLog(
            pseudonym_token=profile.pseudonym_token,
            date=datetime.now().date().isoformat(),
            source='wearable_sync', is_simulated=True, sleep=7.5, heart_rate=70, steps=8000,
        ))
        db.commit()
        return jsonify({'message': 'Sample wearable data imported; no device was connected.'}), 201
    finally:
        db.close()


@app.route('/api/dev/password-reset', methods=['POST'])
def dev_password_reset():
    if os.getenv('DEV_SIMULATED_RESET') != '1' or request.remote_addr not in ('127.0.0.1', '::1'):
        return jsonify({'error': 'Simulated password reset is unavailable'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('email'), str):
        return jsonify({'error': 'Email is required'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=data['email'], role='business', is_active=True).first()
        if not user:
            return jsonify({'error': 'Business account not found in development mode'}), 404
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.reset_token_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15)
        db.commit()
        return jsonify({'token': token, 'message': 'Development simulation only. This token is not emailed.'}), 200
    finally:
        db.close()


@app.route('/api/dev/password-reset/confirm', methods=['POST'])
def dev_password_reset_confirm():
    if os.getenv('DEV_SIMULATED_RESET') != '1' or request.remote_addr not in ('127.0.0.1', '::1'):
        return jsonify({'error': 'Simulated password reset is unavailable'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key] for key in ('email', 'token', 'password')):
        return jsonify({'error': 'Email, token and password are required'}), 400
    if len(data['password']) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=data['email'], role='business', is_active=True).first()
        token_hash = hashlib.sha256(data['token'].encode()).hexdigest()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if (not user or not user.reset_token_hash or not user.reset_token_expires_at
                or user.reset_token_expires_at <= now or not hmac.compare_digest(user.reset_token_hash, token_hash)):
            return jsonify({'error': 'Invalid or expired reset token'}), 400
        user.password_hash = hash_password(data['password'])
        user.session_version += 1
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        db.commit()
        return jsonify({'message': 'Password changed'}), 200
    finally:
        db.close()


@app.route('/api/log-metrics', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
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

        profile = (
            db.query(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .filter(User.user_id == request.user_id)
            .first()
        )
        if not profile:
            return jsonify({'error': 'User not found'}), 404

        log_entry = DailyLog(
            pseudonym_token=profile.pseudonym_token,
            date=payload.get('date', datetime.now().strftime('%Y-%m-%d')),
            was_imputed=bool(result['imputed_features']),
            sleep=float(payload['sleep']) if payload.get('sleep') not in (None, '') else None,
            heart_rate=float(payload['heartRate']) if payload.get('heartRate') not in (None, '') else None,
            steps=float(payload['steps']) if payload.get('steps') not in (None, '') else None,
            fatigue=float(payload['fatigue']) if payload.get('fatigue') not in (None, '') else None
        )
        db.add(log_entry)
        db.flush()
        recommendation = Recommendation(
            log_id=log_entry.log_id, predicted_plan=SHORT_PLANS[result['plan_level']],
            confidence_score=None, shap_factors_json=result['shap_factors'],
            rationale_text=result['explanation'], what_if_text=result['what_if'],
            response_json=result, inference_latency_ms=round(result['latency_ms']),
        )
        db.add(recommendation)
        db.flush()
        recommendation_id = recommendation.rec_id
        db.commit()

        return jsonify({'project_id': 'CSIT-26-S4-03', **result, 'recommendation_id': recommendation_id,
                        'adherence': 'pending'}), 200
    except Exception:
        db.rollback()
        app.logger.exception('Could not save daily metrics')
        return jsonify({'error': 'Could not save daily metrics'}), 500
    finally:
        db.close()


@app.route('/api/recommendations/latest', methods=['GET'])
@require_auth
@require_roles(*MEMBER_ROLES)
def latest_recommendation():
    db = SessionLocal()
    try:
        row = db.query(Recommendation).join(DailyLog, Recommendation.log_id == DailyLog.log_id).join(
            UserProfile, DailyLog.pseudonym_token == UserProfile.pseudonym_token
        ).join(User, UserProfile.user_id == User.id).filter(
            User.user_id == request.user_id, Recommendation.response_json.isnot(None)
        ).order_by(Recommendation.rec_id.desc()).first()
        if not row:
            return jsonify({'recommendation': None}), 200
        result = row.response_json
        metrics = {factor['key']: factor['value'] for factor in result['shap_factors']}
        return jsonify({'recommendation': {**result, 'metrics': metrics, 'recommendation_id': row.rec_id,
                                           'adherence': row.adherence_status}}), 200
    finally:
        db.close()


@app.route('/api/trends', methods=['GET'])
@require_auth
@require_roles(*MEMBER_ROLES)
def get_trends():
    db = SessionLocal()
    try:
        cutoff = (datetime.now().date() - timedelta(days=29)).strftime('%Y-%m-%d')
        logs = (
            db.query(DailyLog)
            .join(UserProfile, DailyLog.pseudonym_token == UserProfile.pseudonym_token)
            .join(User, UserProfile.user_id == User.id)
            .filter(User.user_id == request.user_id, DailyLog.date >= cutoff)
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
                    'fatigue': log.fatigue,
                    'source': log.source,
                    'is_simulated': log.is_simulated,
                } for log in logs
            ]
        }), 200
    finally:
        db.close()


@app.route('/api/whatif', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
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