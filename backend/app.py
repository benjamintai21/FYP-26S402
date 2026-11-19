import csv
import io
import json
import logging
import hashlib
import hmac
import os
import secrets
import uuid
from functools import wraps
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

try:
    from fairlearn.metrics import demographic_parity_difference, disparate_impact_ratio
    from sklearn.metrics import accuracy_score
    FAIRLEARN_AVAILABLE = True
except ImportError:
    FAIRLEARN_AVAILABLE = False

from ml.service import InvalidMetricError, RecommendationService
from database import init_db, SessionLocal
from models import User, UserProfile, DailyLog, Recommendation, UserPreference, FitnessGoal, RevokedToken, BusinessService, BusinessEvent, BusinessPost, EventRegistration, ServiceReservation, EventNotification, Feedback, SubscriptionPlan, UserSubscription, GeneratedPlan, EducationalArticle, Challenge, ChallengeEntry, Cohort, CohortMember, Consent, ActivityLog, Product, Purchase, SystemAuditLog, FairnessAudit
from ml.config import SHORT_PLANS
from auth import hash_password, verify_password, create_access_token, verify_token

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, allow_headers=["Content-Type", "Authorization"], methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
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
        'onboarded': user.onboarded, 'role': user.role, 'is_active': user.is_active,
    }


def profile_payload(profile):
    return {
        'ageBracket': profile.age_bracket,
        'activityLevel': profile.activity_tier,
        'displayName': profile.display_name,
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


DEFAULT_SUBSCRIPTION_PLANS = [
    {
        'tier_code': 'free',
        'plan_name': 'Healthy360 Core',
        'price_monthly': Decimal('0.00'),
        'currency': 'SGD',
        'benefits_json': [
            'Daily XGBoost Activity & Recovery Recommendations',
            'Basic SHAP Feature Attribution & Plain-English Rationale',
            'Daily Biometric Check-In & Wearable Sync',
            'Fitness Goal Tracking',
        ],
        'is_active': True,
    },
    {
        'tier_code': 'premium',
        'plan_name': 'Healthy360 Plus',
        'price_monthly': Decimal('9.90'),
        'currency': 'SGD',
        'benefits_json': [
            'Everything in Healthy360 Core',
            'Personalized Structured Workout & Meal Plan Generators',
            'Multi-Scenario What-If Recourse Comparisons',
            'AI-Driven Goal Adjustment Suggestions',
            'Expert-Reviewed Wellness & Recovery Library',
        ],
        'is_active': True,
    },
]

DEFAULT_PRODUCTS = [
    {
        'product_code': 'meal_vegetarian_starter',
        'product_type': 'meal_plan',
        'title': 'Vegetarian Starter Meal Plan',
        'description': '7-day vegetarian meal plan with simple recipes and grocery lists.',
        'content_json': {
            'duration_days': 7,
            'diet': 'vegetarian',
            'meals_per_day': 3,
            'includes_recipes': True,
            'includes_grocery_list': True,
            'days': [
                {'day': 1, 'breakfast': 'Rolled oats with chia seeds, banana, and almond milk', 'lunch': 'Mediterranean quinoa bowl with cucumbers, olives, and feta', 'dinner': 'Lentil stew with spinach and brown rice'},
                {'day': 2, 'breakfast': 'Greek yogurt with berries and crushed walnuts', 'lunch': 'Whole grain avocado and chickpea wrap', 'dinner': 'Tofu vegetable stir-fry with tamari and jasmine rice'},
                {'day': 3, 'breakfast': 'Spelt toast with nut butter and sliced apple', 'lunch': 'Roasted butternut squash and black bean salad', 'dinner': 'Vegetarian chili with sweet potato and kidney beans'},
                {'day': 4, 'breakfast': 'Green smoothie bowl with flaxseeds and hemp hearts', 'lunch': 'Hummus, falafel, and tabouli plate', 'dinner': 'Baked eggplant parmigiana with side salad'},
                {'day': 5, 'breakfast': 'Overnight oats with shredded coconut and mango', 'lunch': 'Warm edamame and brown rice bowl with sesame dressing', 'dinner': 'Creamy coconut chickpea curry with turmeric'},
                {'day': 6, 'breakfast': 'Warm berry porridge with pumpkin seeds', 'lunch': 'Caprese whole grain sandwich with basil pesto', 'dinner': 'Zucchini noodles with marinara and grilled tempeh'},
                {'day': 7, 'breakfast': 'Fluffy banana oat pancakes with cinnamon', 'lunch': 'Hearty minestrone soup with crusty sourdough', 'dinner': 'Stuffed bell peppers with spiced quinoa and corn'},
            ],
            'notes': 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.',
        },
        'price_cents': 490,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': False,
    },
    {
        'product_code': 'meal_vegan_starter',
        'product_type': 'meal_plan',
        'title': 'Vegan Starter Meal Plan',
        'description': '7-day vegan meal plan with plant-based recipes and grocery lists.',
        'content_json': {
            'duration_days': 7,
            'diet': 'vegan',
            'meals_per_day': 3,
            'includes_recipes': True,
            'includes_grocery_list': True,
            'days': [
                {'day': 1, 'breakfast': 'Tofu scramble with turmeric, spinach, and sourdough', 'lunch': 'Rainbow chopped salad with tahini goddess dressing', 'dinner': 'Black bean sweet potato enchiladas'},
                {'day': 2, 'breakfast': 'Steel cut oats with maple, pecans, and blueberries', 'lunch': 'Peanut soba noodle salad with crisp red cabbage', 'dinner': 'Red lentil dahl with brown basmati rice'},
                {'day': 3, 'breakfast': 'Chia seed pudding with fresh raspberries and cocoa nibs', 'lunch': 'Smashed chickpea "tuna" salad sandwich', 'dinner': 'Crispy baked tempeh bowl with steamed bok choy'},
                {'day': 4, 'breakfast': 'Spinach, spirulina, and frozen pineapple smoothie', 'lunch': 'Lentil shepherd’s pie slice with steamed peas', 'dinner': 'Mushroom risotto with nutritional yeast and thyme'},
                {'day': 5, 'breakfast': 'Avocado toast with hemp seeds and cherry tomatoes', 'lunch': 'Moroccan spiced chickpea stew with couscous', 'dinner': 'Cauliflower walnut bolognese over whole grain pasta'},
                {'day': 6, 'breakfast': 'Buckwheat waffles with almond butter and strawberries', 'lunch': 'Tempeh BLT wrap with chipotle tahini sauce', 'dinner': 'Thai green curry with tofu and bamboo shoots'},
                {'day': 7, 'breakfast': 'Warm spiced oatmeal with baked cinnamon pears', 'lunch': 'Quinoa black bean burrito bowl with guacamole', 'dinner': 'Golden turmeric lentil soup with warm pita'},
            ],
            'notes': 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.',
        },
        'price_cents': 490,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': False,
    },
    {
        'product_code': 'workout_walking_beginner',
        'product_type': 'workout_plan',
        'title': 'Walking for Wellness (Beginner)',
        'description': '4-week progressive walking program with pacing guidance.',
        'content_json': {
            'duration_weeks': 4,
            'activity': 'walking',
            'sessions_per_week': 3,
            'includes_pacing_guide': True,
            'weeks': [
                {'week': 1, 'sessions': ['Session 1: 15 min gentle brisk walk at conversational pace', 'Session 2: 20 min easy scenic walk, posture focus', 'Session 3: 20 min brisk interval (2 min fast / 2 min easy)']},
                {'week': 2, 'sessions': ['Session 1: 25 min steady brisk walk', 'Session 2: 20 min gentle recovery walk on flat terrain', 'Session 3: 25 min varied pace walk']},
                {'week': 3, 'sessions': ['Session 1: 30 min continuous brisk walk', 'Session 2: 25 min interval walk (3 min brisk / 2 min recovery)', 'Session 3: 30 min steady trail or park walk']},
                {'week': 4, 'sessions': ['Session 1: 35 min endurance walk', 'Session 2: 30 min brisk walk with incline / stairs', 'Session 3: 40 min celebratory wellness walk']},
            ],
            'notes': 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.',
        },
        'price_cents': 390,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': False,
    },
    {
        'product_code': 'workout_yoga_recovery',
        'product_type': 'workout_plan',
        'title': 'Yoga for Recovery & Mobility',
        'description': '4-week gentle yoga program focused on recovery and mobility.',
        'content_json': {
            'duration_weeks': 4,
            'activity': 'yoga',
            'sessions_per_week': 3,
            'includes_breathing_guide': True,
            'weeks': [
                {'week': 1, 'sessions': ['Session 1: 20 min Spine & Neck Decompression (Cat/Cow, Child’s Pose)', 'Session 2: 25 min Hip Opening Gentle Flow (Pigeon, Low Lunge)', 'Session 3: 15 min Evening Restorative Supine Stretch']},
                {'week': 2, 'sessions': ['Session 1: 25 min Hamstring & Calf Release (Forward Folds, Down Dog)', 'Session 2: 30 min Thoracic Spine & Shoulder Mobility', 'Session 3: 20 min Deep Breathwork & Supported Savasana']},
                {'week': 3, 'sessions': ['Session 1: 30 min Full Body Circulation Flow (Gentle Sun Salutations)', 'Session 2: 25 min Lower Back Care & Core Stability', 'Session 3: 25 min Restorative Leg-Up-The-Wall Flow']},
                {'week': 4, 'sessions': ['Session 1: 35 min Total Body Mobility & Balance', 'Session 2: 30 min Deep Fascial Stretch & Joint Lubrication', 'Session 3: 25 min Mindful Relaxation & Breath Integration']},
            ],
            'notes': 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.',
        },
        'price_cents': 390,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': False,
    },
    {
        'product_code': 'article_sleep_science',
        'product_type': 'article',
        'title': 'The Science of Sleep Hygiene',
        'description': 'Expert-reviewed article on circadian rhythms, sleep pressure, and practical habits for better sleep.',
        'content_json': {
            'category': 'sleep_science',
            'reading_time_minutes': 8,
            'is_premium_only': True,
            'summary': 'Keeping a regular bedtime trains your body clock and improves how refreshed you feel.',
            'sections': [
                {'heading': '1. The Two-Process Model of Sleep', 'body': 'Sleep is governed by Process C (your circadian clock set by light exposure) and Process S (sleep pressure driven by adenosine accumulation). Syncing both produces deep, restorative rest.'},
                {'heading': '2. Light Timing as an Anchor', 'body': 'Viewing 10-15 minutes of natural sunlight within an hour of waking resets the suprachiasmatic nucleus, advancing melatonin release by 14-16 hours.'},
                {'heading': '3. Temperature & Melatonin', 'body': 'Core body temperature must drop by ~1°C (2°F) to initiate sleep. A cool bedroom (18-20°C / 65-68°F) and a warm shower 90 minutes before bed facilitate this vasodilation.'},
                {'heading': '4. Actionable Evening Routine', 'body': 'Avoid caffeine within 8 hours of sleep, dim ambient lights 2 hours prior, and replace high-arousal screens with light reading or gentle breathwork.'},
            ],
        },
        'price_cents': 99,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': True,
    },
    {
        'product_code': 'article_recovery_pacing',
        'product_type': 'article',
        'title': 'Active Recovery: Why Light Movement Matters',
        'description': 'Expert-reviewed article on active recovery principles and gentle movement for rest days.',
        'content_json': {
            'category': 'recovery_pacing',
            'reading_time_minutes': 6,
            'is_premium_only': True,
            'summary': 'Gentle activity on rest days supports circulation and can ease muscle soreness.',
            'sections': [
                {'heading': '1. Active vs. Passive Rest', 'body': 'Passive rest means lying still; active recovery involves low-intensity movement (below 50% max HR). Active recovery accelerates metabolic waste clearance through gentle muscular contractions.'},
                {'heading': '2. Lymphatic Circulation', 'body': 'Unlike the circulatory system, the lymphatic system has no central pump. Muscular contractions from walking or gentle mobility are necessary to clear fluid accumulation.'},
                {'heading': '3. Autonomic Down-Regulation', 'body': 'Engaging in gentle, non-competitive movement stimulates parasympathetic vagal tone, lowering resting heart rate and elevating Heart Rate Variability (HRV).'},
            ],
        },
        'price_cents': 99,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': True,
    },
    {
        'product_code': 'article_nutrition_habits',
        'product_type': 'article',
        'title': 'Hydration & Steady Energy',
        'description': 'Expert-reviewed article on hydration timing and consistent energy through the day.',
        'content_json': {
            'category': 'nutrition_habits',
            'reading_time_minutes': 5,
            'is_premium_only': True,
            'summary': 'Small, consistent sips through the day beat one large intake before bed.',
            'sections': [
                {'heading': '1. Cellular Dehydration & Fatigue', 'body': 'Even a 1.5% drop in body water volume impairs concentration, elevates perceived effort, and triggers false hunger signals.'},
                {'heading': '2. Electrolyte Balance', 'body': 'Water alone without sodium, potassium, and magnesium can dilute extracellular osmolarity. Include whole foods rich in minerals to optimize hydration.'},
                {'heading': '3. Practical Hydration Rule', 'body': 'Aim for 500ml upon waking, followed by 250ml every 2 hours until dinner. Taper fluids 90 minutes before bed to protect uninterrupted sleep.'},
            ],
        },
        'price_cents': 99,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': True,
    },
    {
        'product_code': 'subscription_premium_monthly',
        'product_type': 'subscription',
        'title': 'Healthy360 Plus (Monthly)',
        'description': 'Monthly premium subscription unlocking personalized plan generators, multi-scenario What-If comparisons, AI goal adjustments, and the expert-reviewed library.',
        'content_json': {
            'billing_period': 'monthly',
            'days': 30,
            'renews_automatically': True,
            'notes': 'Non-clinical lifestyle content only. Not medical advice.',
        },
        'price_cents': 990,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': True,
    },
    {
        'product_code': 'subscription_premium_annual',
        'product_type': 'subscription',
        'title': 'Healthy360 Plus (Annual - Save 20%)',
        'description': 'Annual premium subscription unlocking all premium tools, recovery generators, and expert libraries with 20% savings.',
        'content_json': {
            'billing_period': 'annual',
            'days': 365,
            'renews_automatically': True,
            'notes': 'Non-clinical lifestyle content only. Not medical advice.',
        },
        'price_cents': 9500,
        'currency': 'SGD',
        'is_active': True,
        'premium_only': True,
    },
]


def ensure_default_seed_data(db):
    """Ensure baseline plans and products are available in any database environment."""
    try:
        for plan_spec in DEFAULT_SUBSCRIPTION_PLANS:
            existing_plan = db.query(SubscriptionPlan).filter_by(tier_code=plan_spec['tier_code']).first()
            if not existing_plan:
                db.add(SubscriptionPlan(**plan_spec))
        db.flush()

        for prod_spec in DEFAULT_PRODUCTS:
            existing_prod = db.query(Product).filter_by(product_code=prod_spec['product_code']).first()
            if not existing_prod:
                db.add(Product(**prod_spec))
            elif not existing_prod.is_active:
                existing_prod.is_active = True
        db.commit()
    except Exception:
        db.rollback()
        app.logger.exception('Could not ensure default seed data')


@app.before_request
def startup():
    if not hasattr(app, 'db_initialized'):
        init_db()
        db = SessionLocal()
        try:
            ensure_default_seed_data(db)
        finally:
            db.close()
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


@app.route('/api/onboarding/assess', methods=['POST'])
def onboarding_assess():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Assessment data must be a JSON object'}), 400

    objective = data.get('objective', 'Build sustainable daily energy & beat mid-day crashes')
    motivation = data.get('motivation', 'Feel more energetic and build healthy routines')
    goals = data.get('goals') if isinstance(data.get('goals'), dict) else {}
    ratings = data.get('ratings') if isinstance(data.get('ratings'), dict) else {}
    age_bracket = data.get('ageBracket', '30-44')
    activity_level = data.get('activityLevel', 'moderate')
    baseline = data.get('baseline') if isinstance(data.get('baseline'), dict) else {}

    # Extract or infer baseline metrics for the ML model
    sleep = baseline.get('sleep')
    if sleep is None:
        sleep = goals.get('sleepHours', 7.0)
    try:
        sleep = float(sleep)
    except (TypeError, ValueError):
        sleep = 7.0
    sleep = round(min(max(sleep, 3.0), 12.0), 1)

    heart_rate = baseline.get('heartRate')
    try:
        heart_rate = float(heart_rate) if heart_rate is not None else 72.0
    except (TypeError, ValueError):
        heart_rate = 72.0
    heart_rate = int(min(max(heart_rate, 45.0), 110.0))

    steps = baseline.get('steps')
    if steps is None:
        steps = goals.get('dailySteps', 7500)
    try:
        steps = float(steps)
    except (TypeError, ValueError):
        steps = 7500.0
    steps = int(min(max(steps, 1000.0), 20000.0))

    fatigue = baseline.get('fatigue')
    if fatigue is None:
        energy = float(ratings.get('energyLevel', 3))
        stress = float(ratings.get('stressLevel', 3))
        recovery = float(ratings.get('recoveryQuality', 3))
        fatigue = (6.0 - energy) * 0.9 + stress * 0.9 + (6.0 - recovery) * 0.4
    try:
        fatigue = float(fatigue)
    except (TypeError, ValueError):
        fatigue = 5.0
    fatigue = round(min(max(fatigue, 1.0), 10.0), 1)

    clean_metrics = {
        'sleep': sleep,
        'heartRate': heart_rate,
        'steps': steps,
        'fatigue': fatigue
    }

    try:
        ml_result = service.recommend(clean_metrics)
    except InvalidMetricError as err:
        return jsonify({'error': str(err)}), 400

    plan_class = ml_result['plan_level']

    roadmaps = {
        0: [
            {"day": "Days 1-2", "focus": "Restorative Pacing", "action": f"Prioritize your {sleep}h sleep target and gentle mobility walking."},
            {"day": "Days 3-4", "focus": "Parasympathetic Reset", "action": "Light stretching, breathwork, and reducing physical strain."},
            {"day": "Days 5-7", "focus": "Readiness Re-check", "action": "Daily 20-30 min walk; monitor resting HR stabilization below 72 bpm."}
        ],
        1: [
            {"day": "Days 1-2", "focus": "Aerobic Foundation", "action": f"Maintain {steps:,} daily steps with moderate-effort walking or cycling."},
            {"day": "Days 3-4", "focus": "Steady-State Tempo", "action": "30-45 min Zone 2 aerobic pacing + posture mobility drills."},
            {"day": "Days 5-7", "focus": "Consistency Pacing", "action": "Active recovery day followed by endurance progression."}
        ],
        2: [
            {"day": "Days 1-2", "focus": "Progressive Conditioning", "action": "High-intensity intervals or strength circuit calibrated to low fatigue score."},
            {"day": "Days 3-4", "focus": "Recovery Balancing", "action": f"Enforce {sleep}h restorative sleep to sustain training adaptations."},
            {"day": "Days 5-7", "focus": "Peak Output", "action": f"Full-body conditioning target with {steps:,} step baseline."}
        ]
    }

    response_payload = {
        'project_id': 'CSIT-26-S4-03',
        **ml_result,
        'calibrated_baseline': {
            'sleep': sleep,
            'heartRate': heart_rate,
            'steps': steps,
            'fatigue': fatigue,
            'ageBracket': age_bracket,
            'activityLevel': activity_level
        },
        'personalized_profile': {
            'objective': objective,
            'motivation': motivation,
            'goals': goals,
            'ratings': ratings,
            'roadmap': roadmaps.get(plan_class, roadmaps[1])
        }
    }
    return jsonify(response_payload), 200


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

        # Optional: persist preferences and goals if passed from the interactive questionnaire
        goals_data = data.get('goals')
        if isinstance(goals_data, dict):
            prefs = db.query(UserPreference).filter_by(user_id=user.id).first()
            if not prefs:
                prefs = UserPreference(user_id=user.id)
                db.add(prefs)
            if 'workoutType' in goals_data and isinstance(goals_data['workoutType'], str):
                prefs.workout_preferences_json = [goals_data['workoutType']]
            if 'availableMinutes' in goals_data and isinstance(goals_data['availableMinutes'], (int, float)):
                prefs.available_minutes_per_day = int(goals_data['availableMinutes'])

            existing_goals = db.query(FitnessGoal).filter_by(user_id=user.id).count()
            if existing_goals == 0:
                if 'dailySteps' in goals_data and isinstance(goals_data['dailySteps'], (int, float)):
                    db.add(FitnessGoal(
                        user_id=user.id,
                        title='Daily Step Target',
                        category='steps',
                        target_value=float(goals_data['dailySteps']),
                        current_value=0,
                        unit='steps',
                        status='active'
                    ))
                if 'sleepHours' in goals_data and isinstance(goals_data['sleepHours'], (int, float)):
                    db.add(FitnessGoal(
                        user_id=user.id,
                        title='Nightly Sleep Target',
                        category='sleep',
                        target_value=float(goals_data['sleepHours']),
                        current_value=0,
                        unit='hours',
                        status='active'
                    ))

        db.commit()
        return jsonify({'user': {**user_payload(user), **profile_payload(profile)}}), 200
    finally:
        db.close()


@app.route('/api/profile', methods=['GET', 'PUT'])
@require_auth
@require_roles(*MEMBER_ROLES, 'business')
def profile():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile_obj = db.query(UserProfile).filter_by(user_id=user.id).first()

        if request.method == 'PUT':
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                return jsonify({'error': 'Profile data must be an object'}), 400

            # Update display name
            if profile_obj and 'displayName' in data and isinstance(data['displayName'], str) and data['displayName'].strip():
                profile_obj.display_name = data['displayName'].strip()[:100]

            # Update full name
            if 'name' in data and isinstance(data['name'], str) and data['name'].strip():
                user.name = data['name'].strip()[:255]

            # Business-specific: update the user name (acts as business profile name)
            if user.role == 'business' and 'businessName' in data and isinstance(data['businessName'], str) and data['businessName'].strip():
                user.name = data['businessName'].strip()[:255]

            # Member-specific baseline and demographic updates
            if user.role in MEMBER_ROLES and profile_obj:
                if 'ageBracket' in data:
                    age = data['ageBracket']
                    if age not in ('18-29', '30-44', '45-59', '60+'):
                        return jsonify({'error': 'Invalid age bracket'}), 400
                    profile_obj.age_bracket = age

                if 'activityLevel' in data:
                    activity = data['activityLevel']
                    if activity not in ('sedentary', 'light', 'moderate', 'very_active'):
                        return jsonify({'error': 'Invalid activity level'}), 400
                    profile_obj.activity_tier = activity

                if 'baseline' in data and isinstance(data['baseline'], dict):
                    baseline = data['baseline']
                    if 'sleep' in baseline and baseline['sleep'] is not None:
                        try:
                            val = float(baseline['sleep'])
                            if not 3.0 <= val <= 12.0:
                                return jsonify({'error': 'Sleep must be between 3.0 and 12.0 hours'}), 400
                            profile_obj.target_sleep_hours = round(val, 1)
                        except (TypeError, ValueError):
                            return jsonify({'error': 'Sleep must be a valid number'}), 400

                    if 'heartRate' in baseline and baseline['heartRate'] is not None:
                        try:
                            val = int(baseline['heartRate'])
                            if not 45 <= val <= 110:
                                return jsonify({'error': 'Resting heart rate must be between 45 and 110 bpm'}), 400
                            profile_obj.baseline_resting_hr = val
                        except (TypeError, ValueError):
                            return jsonify({'error': 'Heart rate must be a whole number'}), 400

                    if 'steps' in baseline and baseline['steps'] is not None:
                        try:
                            val = int(baseline['steps'])
                            if not 1000 <= val <= 20000:
                                return jsonify({'error': 'Steps must be between 1,000 and 20,000'}), 400
                            profile_obj.baseline_steps = val
                        except (TypeError, ValueError):
                            return jsonify({'error': 'Steps must be a whole number'}), 400

                    if 'fatigue' in baseline and baseline['fatigue'] is not None:
                        try:
                            val = float(baseline['fatigue'])
                            if not 1.0 <= val <= 10.0:
                                return jsonify({'error': 'Fatigue must be between 1.0 and 10.0'}), 400
                            profile_obj.baseline_fatigue = round(val, 1)
                        except (TypeError, ValueError):
                            return jsonify({'error': 'Fatigue must be a valid number'}), 400

            db.commit()

        result = user_payload(user)
        if profile_obj and user.role in MEMBER_ROLES:
            result.update(profile_payload(profile_obj))
        if user.role == 'business':
            result['businessName'] = user.name
        return jsonify({'user': result}), 200
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
    stored_notes = None
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

        workout_type = data.get('workout_type')
        calories = data.get('calories')
        intensity = data.get('intensity')
        distance_km = data.get('distance_km')
        image_data = data.get('image_data') or data.get('image_url')
        rpe_score = data.get('rpe_score')
        adherence_status = data.get('adherence_status')
        recommendation_id = data.get('recommendation_id')
        training_load = data.get('training_load')

        if workout_type is not None and (not isinstance(workout_type, str) or len(workout_type) > 50):
            workout_type = None
        if calories is not None:
            try:
                calories = int(calories)
                if calories < 0 or calories > 20000:
                    calories = None
            except (ValueError, TypeError):
                calories = None
        if distance_km is not None:
            try:
                distance_km = round(float(distance_km), 2)
                if distance_km < 0 or distance_km > 1000:
                    distance_km = None
            except (ValueError, TypeError):
                distance_km = None
        if intensity is not None and (not isinstance(intensity, str) or len(intensity) > 30):
            intensity = None
        if image_data is not None and (not isinstance(image_data, str) or len(image_data) > 3_000_000):
            image_data = None
        if rpe_score is not None:
            try:
                rpe_score = int(rpe_score)
                if not 1 <= rpe_score <= 10:
                    rpe_score = None
            except (ValueError, TypeError):
                rpe_score = None
        if training_load is not None:
            try:
                training_load = int(training_load)
            except (ValueError, TypeError):
                training_load = None
        elif rpe_score is not None and duration:
            training_load = duration * rpe_score
        if adherence_status is not None and (not isinstance(adherence_status, str) or len(adherence_status) > 30):
            adherence_status = None
        if recommendation_id is not None:
            try:
                recommendation_id = int(recommendation_id)
            except (ValueError, TypeError):
                recommendation_id = None

        has_extra = any(v is not None for v in [workout_type, calories, distance_km, intensity, image_data, rpe_score, training_load, adherence_status, recommendation_id])
        if has_extra:
            stored_notes = json.dumps({
                'notes': notes.strip(),
                'workout_type': workout_type,
                'calories': calories,
                'distance_km': distance_km,
                'intensity': intensity,
                'image_data': image_data,
                'rpe_score': rpe_score,
                'training_load': training_load,
                'adherence_status': adherence_status,
                'recommendation_id': recommendation_id,
            })
        else:
            stored_notes = notes.strip() or None
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        if request.method == 'POST':
            db.add(ActivityLog(pseudonym_token=profile.pseudonym_token, activity_date=activity_date,
                               title=title.strip(), duration_minutes=duration, notes=stored_notes))
            if recommendation_id and adherence_status:
                rec_row = db.query(Recommendation).filter_by(rec_id=recommendation_id).first()
                if rec_row:
                    rec_row.adherence_status = adherence_status
            db.commit()
        rows = db.query(ActivityLog).filter_by(pseudonym_token=profile.pseudonym_token).order_by(
            ActivityLog.activity_date.desc(), ActivityLog.activity_id.desc()).limit(100).all()
        result = []
        for row in rows:
            raw_notes = row.notes or ''
            clean_notes = raw_notes
            w_type, cal, dist, intens, img = None, None, None, None, None
            rpe, load, adh, rec_id = None, None, None, None
            if raw_notes.startswith('{') and raw_notes.endswith('}'):
                try:
                    parsed = json.loads(raw_notes)
                    if isinstance(parsed, dict):
                        clean_notes = parsed.get('notes', '')
                        w_type = parsed.get('workout_type')
                        cal = parsed.get('calories')
                        dist = parsed.get('distance_km')
                        intens = parsed.get('intensity')
                        img = parsed.get('image_data') or parsed.get('image_url')
                        rpe = parsed.get('rpe_score')
                        load = parsed.get('training_load')
                        adh = parsed.get('adherence_status')
                        rec_id = parsed.get('recommendation_id')
                except (ValueError, TypeError):
                    pass
            result.append({
                'id': row.activity_id,
                'date': row.activity_date.isoformat(),
                'title': row.title,
                'duration': row.duration_minutes,
                'notes': clean_notes,
                'workout_type': w_type,
                'calories': cal,
                'distance_km': dist,
                'intensity': intens,
                'image_data': img,
                'rpe_score': rpe,
                'training_load': load,
                'adherence_status': adh,
                'recommendation_id': rec_id,
            })
        return jsonify({'activities': result}), 201 if request.method == 'POST' else 200
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
            ensure_default_seed_data(db)
            plan = db.query(SubscriptionPlan).filter_by(tier_code='premium', is_active=True).first()
        if not plan:
            return jsonify({'error': 'Premium plan is not configured'}), 503

        current = db.query(UserSubscription).filter_by(user_id=user.id).order_by(UserSubscription.subscription_id.desc()).first()
        today = date.today()
        if request.method == 'POST':
            action = data['action']
            cycle = data.get('billing_cycle', 'monthly') if isinstance(data, dict) else 'monthly'
            duration_days = 365 if cycle == 'annual' else 30
            charge = False

            if action == 'start':
                if current and current.renewal_date >= today and current.status in ('active', 'cancelled'):
                    return jsonify({'error': 'You already have an active subscription'}), 409
                current = UserSubscription(user_id=user.id, plan_id=plan.plan_id, status='active',
                                           start_date=today, renewal_date=today + timedelta(days=duration_days))
                db.add(current)
                charge = True
            elif action == 'cancel':
                if not current or current.status != 'active' or current.renewal_date < today:
                    return jsonify({'error': 'No active subscription to cancel'}), 409
                current.status = 'cancelled'
                current.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                if not current:
                    return jsonify({'error': 'Purchase a subscription first'}), 409
                current.renewal_date = max(today, current.renewal_date) + timedelta(days=duration_days)
                current.status = 'active'
                current.cancelled_at = None
                charge = True

            if charge:
                prod_code = 'subscription_premium_annual' if cycle == 'annual' else 'subscription_premium_monthly'
                sub_product = db.query(Product).filter_by(product_code=prod_code, is_active=True).first()
                if not sub_product:
                    ensure_default_seed_data(db)
                    sub_product = db.query(Product).filter_by(product_code=prod_code, is_active=True).first()
                if not sub_product:
                    # Self-heal product row if completely missing in DB
                    sub_product = Product(
                        product_code=prod_code,
                        product_type='subscription',
                        title='Healthy360 Plus (Annual)' if cycle == 'annual' else 'Healthy360 Plus (Monthly)',
                        description='Monthly or annual premium subscription unlocking personalized plan generators and AI insights.',
                        content_json={'billing_period': cycle},
                        price_cents=9500 if cycle == 'annual' else 990,
                        currency='SGD',
                        is_active=True,
                        premium_only=True,
                    )
                    db.add(sub_product)
                    db.flush()

                payment = Purchase(user_id=user.id, product_id=sub_product.product_id,
                                   amount_cents=sub_product.price_cents, currency=sub_product.currency,
                                   status='completed')
                db.add(payment)
                db.flush()
                user.role = 'premium'
            db.commit()

        # Fetch recent subscription receipts
        sub_product_ids = [p.product_id for p in db.query(Product.product_id).filter_by(product_type='subscription').all()]
        past_purchases = []
        if sub_product_ids:
            records = db.query(Purchase).filter(
                Purchase.user_id == user.id,
                Purchase.product_id.in_(sub_product_ids),
                Purchase.status == 'completed'
            ).order_by(Purchase.purchased_at.desc()).limit(10).all()
            past_purchases = [{
                'id': rec.purchase_id,
                'amount_cents': rec.amount_cents,
                'currency': rec.currency,
                'purchased_at': rec.purchased_at.isoformat() if rec.purchased_at else None,
                'receipt_no': f'REC-{rec.purchase_id:06d}',
            } for rec in records]

        return jsonify({
            'mode': 'subscription_purchase',
            'plan': plan.plan_name,
            'referencePrice': float(plan.price_monthly),
            'annualPrice': 95.0,
            'annualSavings': 'Save 20%',
            'currency': plan.currency,
            'benefits': plan.benefits_json,
            'paymentMethod': 'simulated',
            'subscription': None if not current else {
                'status': current.status,
                'startDate': current.start_date.isoformat(),
                'accessUntil': current.renewal_date.isoformat(),
            },
            'role': user.role,
            'receipts': past_purchases,
        }), 200
    finally:
        db.close()


WORKOUT_TEMPLATES = {
    'walking': {
        0: [
            {
                'title': 'Mindful Nasal Recovery Walk',
                'summary': 'Nasal-breathing recovery walk to stimulate parasympathetic restoration.',
                'warmup': '3 min gentle ankle rolls, knee hugs, and slow arm swings.',
                'main': 'Leisurely pace in Zone 1 (90-110 bpm). Inhale 4s through nose, exhale 6s through nose.',
                'cooldown': '3 min standing calf stretch and gentle hamstring stretch.',
                'hr_zone': 'Zone 1 (< 110 bpm)',
                'intensity': 'Light / Restorative',
                'focus': 'Recovery & Circulation'
            },
            {
                'title': 'Post-Meal Glycemic Clearing Stroll',
                'summary': 'Gentle rhythmic walk to clear glucose and enhance digestion without elevating cortisol.',
                'warmup': '2 min marching in place with relaxed shoulders.',
                'main': 'Continuous easy stroll with loose posture and relaxed arm rhythm.',
                'cooldown': '3 min quadriceps stretch and thoracic spine openers.',
                'hr_zone': 'Zone 1 (< 110 bpm)',
                'intensity': 'Light / Restorative',
                'focus': 'Metabolic Recovery'
            },
            {
                'title': 'Sunshine & Circadian Recovery Stroll',
                'summary': 'Low-cadence outdoor stroll to reset natural circadian rhythms and loosen stiff joints.',
                'warmup': '3 min neck rolls, hip circles, and deep diaphragmatic breaths.',
                'main': 'Gentle 95-100 steps/min cadence on flat grass or paved path.',
                'cooldown': '3 min chest opener and gentle forward fold.',
                'hr_zone': 'Zone 1 (< 110 bpm)',
                'intensity': 'Light / Restorative',
                'focus': 'Circadian Rhythm & Mobility'
            }
        ],
        1: [
            {
                'title': 'Aerobic Zone 2 Power Walk',
                'summary': 'Steady-state brisk walk building aerobic base and cardiovascular endurance.',
                'warmup': '4 min dynamic warm-up: high knees, butt kicks, and torso twists.',
                'main': 'Brisk conversational pace (115-125 steps/min) in Heart Rate Zone 2.',
                'cooldown': '3 min decelerating pace and calf wall stretch.',
                'hr_zone': 'Zone 2 (115-135 bpm)',
                'intensity': 'Moderate / Aerobic Base',
                'focus': 'Cardiovascular Endurance'
            },
            {
                'title': 'Incline & Terrain Pacing Walk',
                'summary': 'Varied terrain walking workout to engage posterior chain and glutes.',
                'warmup': '3 min flat walking warm-up with calf raises.',
                'main': 'Rolling hill or 4% treadmill incline intervals (3 min incline, 2 min flat recovery x 4 sets).',
                'cooldown': '4 min flat recovery and hip flexor kneeling stretch.',
                'hr_zone': 'Zone 2 (120-138 bpm)',
                'intensity': 'Moderate / Aerobic Base',
                'focus': 'Posterior Chain & Stamina'
            },
            {
                'title': 'Postural Alignment Cadence Walk',
                'summary': 'Core-activated brisk walk emphasizing scapular retraction and arm drive.',
                'warmup': '3 min shoulder dislocates, chest expands, and lateral leg swings.',
                'main': 'Continuous brisk stride focusing on tall spinal posture and rhythmic breathing.',
                'cooldown': '3 min doorway pec stretch and seated hamstring stretch.',
                'hr_zone': 'Zone 2 (115-135 bpm)',
                'intensity': 'Moderate / Aerobic Base',
                'focus': 'Postural Core & Aerobic'
            }
        ],
        2: [
            {
                'title': 'High-Energy Power Interval Surges',
                'summary': 'High-tempo walking intervals alternating brisk surges with active recovery.',
                'warmup': '5 min dynamic walking drills: high knee marches and walking lunges.',
                'main': 'Surge intervals: 2 min fast power walk (135+ SPM, Zone 3) followed by 1 min recovery walk x 6 rounds.',
                'cooldown': '4 min easy stroll and full lower body stretches.',
                'hr_zone': 'Zone 3/4 (135-155 bpm)',
                'intensity': 'High Energy / Peak Output',
                'focus': 'Anaerobic Threshold & Caloric Burn'
            },
            {
                'title': 'Fast-Cadence Outdoor Tempo Walk',
                'summary': 'Sustained rapid cadence walk testing cardiovascular speed and leg turnover.',
                'warmup': '4 min walking heel-to-toe rolls and dynamic quad stretches.',
                'main': 'Sustained fast pace targeting 130-140 steps/min with active 90-degree arm swing.',
                'cooldown': '5 min gradual slow stroll and standing hamstring/calf stretches.',
                'hr_zone': 'Zone 3 (130-148 bpm)',
                'intensity': 'High Energy / Peak Output',
                'focus': 'Cadence Speed & Aerobic Power'
            }
        ]
    },
    'cycling': {
        0: [
            {
                'title': 'Low-Cadence Recovery Flush',
                'summary': 'Low-resistance gentle spin to circulate blood and clear metabolic byproducts.',
                'warmup': '5 min zero-resistance gentle pedaling at 75 RPM.',
                'main': 'Smooth effortless spinning in Zone 1 (< 110 bpm) with rhythmic breathing.',
                'cooldown': '3 min ultra-slow pedal down and standing quad stretch.',
                'hr_zone': 'Zone 1 (< 110 bpm)',
                'intensity': 'Light / Restorative',
                'focus': 'Lactic Flush & Joint Decompression'
            },
            {
                'title': 'Smooth Ergonomic Fluidity Spin',
                'summary': 'Easy seated cruise alternating upright and light drop handlebar positions.',
                'warmup': '4 min easy pedaling focusing on smooth circular pedal strokes.',
                'main': 'Continuous gentle cadence (75-80 RPM) with minimal knee stress.',
                'cooldown': '3 min slow spin and off-bike hamstring stretch.',
                'hr_zone': 'Zone 1 (< 110 bpm)',
                'intensity': 'Light / Restorative',
                'focus': 'Low-Impact Circulation'
            }
        ],
        1: [
            {
                'title': 'Aerobic Base Cadence Spin',
                'summary': 'Consistent steady-state aerobic spin to build mitochondrial density.',
                'warmup': '5 min gradual gear build-up to 85 RPM.',
                'main': 'Steady Zone 2 pedaling at 85-90 RPM with light to moderate resistance.',
                'cooldown': '4 min low-gear spin down and calf stretch.',
                'hr_zone': 'Zone 2 (120-140 bpm)',
                'intensity': 'Moderate / Aerobic Base',
                'focus': 'Aerobic Efficiency'
            },
            {
                'title': 'Cadence Shift Intervals',
                'summary': 'Pedaling efficiency intervals alternating moderate and fast spin rates.',
                'warmup': '5 min progressive cadence warm-up.',
                'main': 'Intervals: 3 min steady at 80 RPM, 2 min fast spin at 95 RPM x 4 cycles.',
                'cooldown': '4 min easy recovery spin.',
                'hr_zone': 'Zone 2/3 (125-142 bpm)',
                'intensity': 'Moderate / Aerobic Base',
                'focus': 'Neuromuscular Pedaling Speed'
            }
        ],
        2: [
            {
                'title': 'High-Cadence Surge Pyramid',
                'summary': 'Short high-intensity power surges alternating with aerobic recovery.',
                'warmup': '5 min cadence build to 90 RPM.',
                'main': 'Pyramid surges: 45 sec surge at 105+ RPM, 75 sec active recovery spin x 8 sets.',
                'cooldown': '5 min gentle flush spin and glute stretch.',
                'hr_zone': 'Zone 3/4 (140-160 bpm)',
                'intensity': 'High Energy / Peak Output',
                'focus': 'Peak Power & Anaerobic Capacity'
            },
            {
                'title': 'Simulated Hill Climb Power Intervals',
                'summary': 'High-resistance seated and standing climbs to build muscular endurance.',
                'warmup': '5 min flat spinning warm-up.',
                'main': 'Resistance climb: 3 min heavy climb at 65-70 RPM, 2 min fast flat spin x 4 rounds.',
                'cooldown': '5 min easy spin and full lower body stretches.',
                'hr_zone': 'Zone 3/4 (138-158 bpm)',
                'intensity': 'High Energy / Peak Output',
                'focus': 'Muscular Endurance & Power'
            }
        ]
    },
    'yoga': {
        0: [
            {
                'title': 'Restorative Yin & Decompression Flow',
                'summary': 'Deep passive stretches held with slow diaphragmatic breaths to relieve fatigue.',
                'warmup': '3 min Cat-Cow spinal flexion and Child’s Pose breathing.',
                'main': 'Restorative holds (2 min each): Reclined Pigeon, Seated Forward Fold, Supported Bridge, Supine Twist.',
                'cooldown': '4 min Savasana with 4-7-8 relaxation breathing.',
                'hr_zone': 'Restorative (< 95 bpm)',
                'intensity': 'Gentle / Restorative',
                'focus': 'Parasympathetic Nervous System Reset'
            },
            {
                'title': 'Lower Back & Hip Opening Decompression',
                'summary': 'Low-impact mat routine to release tight hip flexors and lower lumbar tension.',
                'warmup': '3 min gentle pelvic tilts and knee-to-chest hugs.',
                'main': 'Floor sequence: Low Lunge with knee on mat, Downward Dog pedal, Figure-4 hip stretch.',
                'cooldown': '4 min Legs-Up-The-Wall pose to drain metabolic fluid.',
                'hr_zone': 'Restorative (< 95 bpm)',
                'intensity': 'Gentle / Restorative',
                'focus': 'Lumbar & Hip Mobility'
            }
        ],
        1: [
            {
                'title': 'Vinyasa Balance & Core Flow',
                'summary': 'Flowing standing sequence connecting breath with functional joint stability.',
                'warmup': '4 min Sun Salutation A (Surya Namaskar) warm-up cycles.',
                'main': 'Standing sequence: Warrior II, Extended Side Angle, Chair Pose, Tree Pose balance.',
                'cooldown': '4 min Seated Forward Fold and Savasana.',
                'hr_zone': 'Zone 1/2 (100-120 bpm)',
                'intensity': 'Moderate / Functional Flow',
                'focus': 'Balance & Core Stability'
            },
            {
                'title': 'Athletic Mobility & Hip Opening',
                'summary': 'Targeted yoga flow for runners, walkers, and cyclists to open chest and hips.',
                'warmup': '3 min dynamic shoulder rolls and wrist rotations.',
                'main': 'Athletic sequence: Crescent Lunge with twist, Cobra hold, Lizard pose, Plank hold.',
                'cooldown': '4 min Reclined Butterfly and deep belly breathing.',
                'hr_zone': 'Zone 1/2 (100-120 bpm)',
                'intensity': 'Moderate / Functional Flow',
                'focus': 'Athletic Mobility & Flexibility'
            }
        ],
        2: [
            {
                'title': 'Power Vinyasa Strength & Stamina',
                'summary': 'Athletic high-energy yoga flow building muscular endurance and mental stamina.',
                'warmup': '5 min Sun Salutation B with Chaturanga flows.',
                'main': 'Strength sequence: Warrior III balance, Crow Pose progression, Extended Triangle, Chair pose pulses.',
                'cooldown': '4 min restorative spinal twists and Savasana.',
                'hr_zone': 'Zone 2/3 (120-140 bpm)',
                'intensity': 'High Energy / Strength Flow',
                'focus': 'Total Body Strength & Dynamic Balance'
            },
            {
                'title': 'Dynamic Core & Inversion Flow',
                'summary': 'Core-centric athletic practice to develop deep abdominal stabilizers.',
                'warmup': '4 min Cat-Cow and Dolphin pose shoulder openers.',
                'main': 'Core sequence: Boat Pose crunches, Side Plank lifts, High Lunge twists, Forearm Plank holds.',
                'cooldown': '4 min Child’s Pose and deep diaphragmatic recovery.',
                'hr_zone': 'Zone 2/3 (120-138 bpm)',
                'intensity': 'High Energy / Strength Flow',
                'focus': 'Core Strength & Shoulder Stability'
            }
        ]
    }
}

MEAL_TEMPLATES = {
    0: [
        {
            'title': 'Anti-Inflammatory & Recovery Fuel',
            'macros': '48g Protein · 185g Carbs · 42g Healthy Fats (~1,850 kcal)',
            'breakfast': 'Golden Turmeric Oatmeal with chia seeds, wild blueberries, and crushed walnuts.',
            'lunch': 'Warm Moroccan Lentil & Sweet Potato Stew with baby spinach and lemon squeeze.',
            'snack': 'Crisp apple slices with cinnamon and roasted almond butter.',
            'dinner': 'Pan-seared herbed organic tofu with warm quinoa, roasted broccoli, and creamy tahini drizzle.'
        },
        {
            'title': 'Gut-Health & Micronutrient Booster',
            'macros': '45g Protein · 190g Carbs · 38g Healthy Fats (~1,800 kcal)',
            'breakfast': 'Blueberry Chia Pudding with ground flaxseed and sliced almonds.',
            'lunch': 'Ginger Carrot Soup paired with a warm Edamame & Brown Rice bowl.',
            'snack': 'Steamed edamame pods sprinkled with sea salt and sesame seeds.',
            'dinner': 'Spiced Red Lentil Dal with steamed basmati rice and roasted turmeric cauliflower.'
        },
        {
            'title': 'Gentle Digestion Whole-Foods Blueprint',
            'macros': '46g Protein · 180g Carbs · 40g Healthy Fats (~1,820 kcal)',
            'breakfast': 'Creamy Rolled Oats with banana slices and toasted pumpkin seeds.',
            'lunch': 'Miso-Glazed Tofu with steamed bok choy, carrots, and brown rice.',
            'snack': 'Warm chamomile tea with a handful of raw walnuts.',
            'dinner': 'Hearty Vegetable & White Bean Minestrone with seeded whole-grain sourdough.'
        }
    ],
    1: [
        {
            'title': 'Sustained Glycogen & Plant Power',
            'macros': '62g Protein · 220g Carbs · 48g Healthy Fats (~2,100 kcal)',
            'breakfast': 'Spiced Tofu Scramble with bell peppers, baby spinach, nutritional yeast, and seeded toast.',
            'lunch': 'Mediterranean Chickpea & Quinoa Bowl with diced cucumbers, cherry tomatoes, and kalamata olives.',
            'snack': 'Raw energy trail mix with pumpkin seeds, dried cranberries, and almonds.',
            'dinner': 'Hearty Black Bean & Lentil Chili with avocado slices and steamed brown rice.'
        },
        {
            'title': 'Clean Energy & Metabolic Rhythm',
            'macros': '58g Protein · 215g Carbs · 45g Healthy Fats (~2,050 kcal)',
            'breakfast': 'Overnight Rolled Oats with hemp seeds, sliced banana, and pure maple drizzle.',
            'lunch': 'Sesame Ginger Tempeh Stir-fry with snap peas, bell peppers, and jasmine brown rice.',
            'snack': 'Berry Antioxidant Smoothie with plant protein powder and chia seeds.',
            'dinner': 'Slow-simmered Chickpea Curry with baby spinach, basmati rice, and warm roti.'
        },
        {
            'title': 'Mediterranean Whole-Grain Balance',
            'macros': '60g Protein · 225g Carbs · 46g Healthy Fats (~2,080 kcal)',
            'breakfast': 'Avocado and sprouted sourdough toast topped with hemp hearts and microgreens.',
            'lunch': 'Green Goddess Quinoa Salad with edamame, shredded kale, and avocado-lime dressing.',
            'snack': 'Carrot sticks and whole-wheat pita with traditional garlic hummus.',
            'dinner': 'Baked Stuffed Sweet Potato with seasoned black beans, corn salsa, and cashew cream.'
        }
    ],
    2: [
        {
            'title': 'High-Protein Muscle Recovery & Peak Output',
            'macros': '78g Protein · 245g Carbs · 52g Healthy Fats (~2,350 kcal)',
            'breakfast': 'High-Protein Oatmeal with peanut butter, plant protein isolate, chia seeds, and banana.',
            'lunch': 'Giant Tempeh & Avocado Macro Bowl with warm quinoa, roasted sweet potatoes, and tahini.',
            'snack': 'Roasted salted edamame and a dark chocolate square.',
            'dinner': 'Rich Lentil & Bean Bolognese over whole-wheat pasta with side garlic roasted asparagus.'
        },
        {
            'title': 'Athletic Stamina & Amino Acid Fuel',
            'macros': '75g Protein · 240g Carbs · 50g Healthy Fats (~2,300 kcal)',
            'breakfast': 'Chickpea Flour Herb Frittata with baby spinach, tomatoes, and avocado toast.',
            'lunch': 'Smoky Barbecue Tofu Wrap with shredded purple cabbage, avocado, and brown rice.',
            'snack': 'Protein smoothie with frozen wild berries, peanut butter, and soy milk.',
            'dinner': 'Spiced Black Bean and Red Quinoa Power Skillet with homemade guacamole and cilantro.'
        },
        {
            'title': 'Peak Energy & Cellular Replenishment',
            'macros': '74g Protein · 250g Carbs · 48g Healthy Fats (~2,280 kcal)',
            'breakfast': 'Warm Quinoa Porridge with almond butter, hemp hearts, and fresh strawberries.',
            'lunch': 'Edamame Soba Noodle Salad with sesame ginger dressing, shredded carrots, and crushed peanuts.',
            'snack': 'Homemade protein power bites with oats, dates, and flaxseed.',
            'dinner': 'Lentil Shepherds Pie with mashed cauliflower-potato crust and steamed green beans.'
        }
    ]
}


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
            recommendation = db.query(Recommendation).join(
                DailyLog, Recommendation.log_id == DailyLog.log_id
            ).join(
                UserProfile, DailyLog.pseudonym_token == UserProfile.pseudonym_token
            ).filter(
                UserProfile.user_id == user.id, Recommendation.response_json.isnot(None)
            ).order_by(Recommendation.rec_id.desc()).first()
            if not recommendation:
                return jsonify({'error': 'Complete a daily check-in before generating ideas'}), 409
            response = recommendation.response_json
            level = response.get('plan_level') if isinstance(response, dict) else None
            label = response.get('recommendation') if isinstance(response, dict) else None
            if type(level) is not int or level not in SHORT_PLANS or not isinstance(label, str) or not label:
                app.logger.error('Saved recommendation has an invalid recovery level')
                return jsonify({'error': 'Saved recommendation is unavailable; complete a new check-in'}), 409
            prefs = db.query(UserPreference).filter_by(user_id=user.id).first()
            goals = db.query(FitnessGoal).filter_by(user_id=user.id, status='active').all()
            goal_titles = [goal.title for goal in goals]
            existing_count = db.query(GeneratedPlan).filter_by(user_id=user.id, plan_type=data['type']).count()

            if data['type'] == 'workout':
                minutes = prefs.available_minutes_per_day if prefs else 45
                if minutes < 1:
                    return jsonify({'error': 'Set a positive amount of available time first'}), 400
                requested = [item.lower() for item in (prefs.workout_preferences_json or [])] if prefs else []
                supported = {'walking', 'cycling', 'yoga'}
                if any(item not in supported for item in requested):
                    return jsonify({'error': 'Workout suggestions currently support walking, cycling, and yoga only'}), 400
                categories = {goal.category for goal in goals}

                modality_input = (data.get('modality') or '').lower() if isinstance(data, dict) else ''
                if modality_input in supported:
                    activity = modality_input
                elif 'steps' in categories and (not requested or 'walking' in requested):
                    activity = 'walking'
                elif requested:
                    activity = requested[0]
                else:
                    activity = 'walking'

                duration = min(minutes, 30)
                pace = {
                    0: 'at an easy, gentle pace',
                    1: 'at a comfortable, steady pace',
                    2: 'at a comfortable pace, varying the pace if you wish',
                }[level]

                # Select diverse routine rotating through templates
                routines = WORKOUT_TEMPLATES.get(activity, {}).get(level, WORKOUT_TEMPLATES['walking'][0])
                routine = routines[existing_count % len(routines)]

                third_session = ('Session 3: choose rest or gentle movement for your recovery goal.'
                                 if 'recovery_days' in categories else
                                 f'Session 3: repeat {activity} for up to {duration} minutes {pace} if comfortable.')
                
                payload = {
                    'notes': 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.',
                    'goals': goal_titles,
                    'preferences': requested,
                    'minutes': duration,
                    'items': [
                        f'Session 1 ({activity.capitalize()} · {duration} min): {routine["summary"]}',
                        f'Warm-up (3-5 min): {routine["warmup"]}',
                        f'Main Workout ({duration} min): {routine["main"]}',
                        f'Cool-down & Flexibility: {routine["cooldown"]}'
                    ],
                    'routineTitle': routine['title'],
                    'modality': activity,
                    'intensityZone': routine['hr_zone'],
                    'intensity': routine['intensity'],
                    'focus': routine['focus'],
                    'warmup': routine['warmup'],
                    'mainBlock': routine['main'],
                    'cooldown': routine['cooldown'],
                }
                title = f"{routine['title']} ({activity.capitalize()} · {duration}m)"
            else:
                dietary = [item.lower() for item in (prefs.dietary_preferences_json or [])] if prefs else []
                if any(item not in ('vegetarian', 'vegan') for item in dietary):
                    return jsonify({'error': 'Meal ideas currently support vegetarian and vegan preferences only; other restrictions cannot be checked safely'}), 400
                
                # Select diverse meal plan rotating through templates
                meal_sets = MEAL_TEMPLATES.get(level, MEAL_TEMPLATES[1])
                meal_set = meal_sets[existing_count % len(meal_sets)]

                payload = {
                    'notes': 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.',
                    'goals': goal_titles,
                    'preferences': dietary,
                    'items': [
                        f'Breakfast: {meal_set["breakfast"]}',
                        f'Lunch: {meal_set["lunch"]}',
                        f'Recovery Snack: {meal_set["snack"]}',
                        f'Dinner: {meal_set["dinner"]}'
                    ],
                    'menuTitle': meal_set['title'],
                    'macroHighlight': meal_set['macros'],
                    'dietType': 'vegan' if 'vegan' in dietary else 'vegetarian',
                    'breakfast': meal_set['breakfast'],
                    'lunch': meal_set['lunch'],
                    'snack': meal_set['snack'],
                    'dinner': meal_set['dinner'],
                }
                title = f"{meal_set['title']} ({payload['dietType'].capitalize()})"

            payload.update({'recoveryLevel': level, 'recommendationId': recommendation.rec_id,
                            'recoveryRecommendation': label})
            plan = GeneratedPlan(user_id=user.id, plan_type=data['type'], title=title, plan_payload_json=payload)
            db.add(plan)
            db.commit()
        plans = db.query(GeneratedPlan).filter_by(user_id=user.id).order_by(GeneratedPlan.plan_id.desc()).limit(50).all()
        return jsonify({'plans': [{'id': plan.plan_id, 'type': plan.plan_type, 'title': plan.title,
                                   'details': plan.plan_payload_json} for plan in plans]}), 201 if request.method == 'POST' else 200
    finally:
        db.close()


@app.route('/api/premium/plans/<int:plan_id>', methods=['DELETE'])
@require_auth
@require_roles('premium')
def delete_premium_plan(plan_id):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        plan = db.query(GeneratedPlan).filter_by(plan_id=plan_id, user_id=user.id).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404
        db.delete(plan)
        db.commit()
        return jsonify({'message': 'Plan deleted successfully', 'plan_id': plan_id}), 200
    finally:
        db.close()


@app.route('/api/articles', methods=['GET'])
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


@app.route('/api/products', methods=['GET'])
@require_auth
@require_roles(*MEMBER_ROLES)
def get_products():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        is_premium = user.role == 'premium'
        products = db.query(Product).filter(Product.is_active.is_(True), Product.product_type != 'subscription').all()
        if not products:
            ensure_default_seed_data(db)
            products = db.query(Product).filter(Product.is_active.is_(True), Product.product_type != 'subscription').all()
        result = []
        for p in products:
            if p.premium_only and not is_premium:
                continue
            result.append({
                'id': p.product_id,
                'code': p.product_code,
                'type': p.product_type,
                'title': p.title,
                'description': p.description,
                'content': p.content_json,
                'price_cents': p.price_cents,
                'currency': p.currency,
                'premium_only': p.premium_only,
            })
        return jsonify({'products': result}), 200
    finally:
        db.close()


@app.route('/api/products/<int:product_id>/purchase', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def purchase_product(product_id):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        product = db.query(Product).filter_by(product_id=product_id, is_active=True).first()
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        if product.premium_only and user.role != 'premium':
            return jsonify({'error': 'Premium subscription required for this product'}), 403
        # Check if already purchased
        existing = db.query(Purchase).filter_by(user_id=user.id, product_id=product_id, status='completed').first()
        if existing:
            return jsonify({'error': 'Already purchased', 'purchase_id': existing.purchase_id}), 409
        purchase = Purchase(
            user_id=user.id,
            product_id=product_id,
            amount_cents=product.price_cents,
            currency=product.currency,
            status='completed',
        )
        db.add(purchase)
        db.commit()
        return jsonify({
            'purchase': {
                'id': purchase.purchase_id,
                'product_id': product_id,
                'amount_cents': purchase.amount_cents,
                'currency': purchase.currency,
                'purchased_at': purchase.purchased_at.isoformat(),
            }
        }), 201
    finally:
        db.close()


@app.route('/api/purchases', methods=['GET'])
@require_auth
@require_roles(*MEMBER_ROLES)
def get_purchases():
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        purchases = db.query(Purchase).filter_by(user_id=user.id, status='completed').join(Product).order_by(Purchase.purchased_at.desc()).all()
        return jsonify({
            'purchases': [{
                'id': p.purchase_id,
                'product': {
                    'id': p.product.product_id,
                    'code': p.product.product_code,
                    'type': p.product.product_type,
                    'title': p.product.title,
                    'description': p.product.description,
                    'content': p.product.content_json,
                },
                'amount_cents': p.amount_cents,
                'currency': p.currency,
                'purchased_at': p.purchased_at.isoformat(),
            } for p in purchases]
        }), 200
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
        auth_header = request.headers.get('Authorization', '')
        user_obj = None
        if auth_header.startswith('Bearer '):
            token_data = verify_token(auth_header.replace('Bearer ', ''))
            if token_data:
                user_obj = db.query(User).filter(User.user_id == token_data.get('sub')).first()

        my_service_ids = set()
        my_event_ids = set()
        if user_obj:
            my_service_ids = {r.service_id for r in db.query(ServiceReservation.service_id).filter_by(user_id=user_obj.id).all()}
            my_event_ids = {r.event_id for r in db.query(EventRegistration.event_id).filter_by(user_id=user_obj.id).all()}

        result = {}
        for resource, model in BUSINESS_MODELS.items():
            query = db.query(model, User.name).join(User, model.business_user_id == User.id).filter(User.is_active.is_(True))
            if resource == 'services':
                query = query.filter(BusinessService.is_active.is_(True))
                items = []
                for item, name in query.all():
                    payload = {**business_payload(resource, item), 'business': name}
                    payload['is_reserved'] = item.service_id in my_service_ids
                    items.append(payload)
                result[resource] = items
            elif resource == 'events':
                query = query.filter(BusinessEvent.status == 'scheduled', BusinessEvent.event_datetime >= datetime.now())
                items = []
                for item, name in query.all():
                    payload = {**business_payload(resource, item), 'business': name}
                    payload['is_reserved'] = item.event_id in my_event_ids
                    reg_count = db.query(EventRegistration).filter_by(event_id=item.event_id).count()
                    payload['registered_count'] = reg_count
                    payload['spots_left'] = max(0, item.capacity - reg_count)
                    payload['is_full'] = reg_count >= item.capacity
                    items.append(payload)
                result[resource] = items
            else:
                query = query.filter((BusinessPost.expires_at.is_(None)) | (BusinessPost.expires_at >= datetime.now()))
                result[resource] = [{**business_payload(resource, item), 'business': name} for item, name in query.all()]
        return jsonify(result), 200
    finally:
        db.close()


@app.route('/api/plans/public', methods=['GET'])
def public_plans():
    """Return subscription plan details for the landing page (no auth required)."""
    db = SessionLocal()
    try:
        plans = db.query(SubscriptionPlan).filter_by(is_active=True).order_by(SubscriptionPlan.plan_id).all()
        if not plans:
            ensure_default_seed_data(db)
            plans = db.query(SubscriptionPlan).filter_by(is_active=True).order_by(SubscriptionPlan.plan_id).all()
        return jsonify({
            'plans': [{
                'tierCode': plan.tier_code,
                'planName': plan.plan_name,
                'priceMonthly': float(plan.price_monthly),
                'annualPrice': 95.0,
                'annualSavings': 'Save 20%',
                'currency': plan.currency,
                'benefits': plan.benefits_json,
            } for plan in plans]
        }), 200
    finally:
        db.close()


def challenge_payload(challenge):
    return {'id': challenge.challenge_id, 'title': challenge.title, 'metric': challenge.metric_type,
            'target': challenge.target_value, 'startDate': challenge.start_date.isoformat(),
            'endDate': challenge.end_date.isoformat()}


@app.route('/api/business/events/<int:event_id>/registrations', methods=['GET'])
@require_auth
@require_roles('business')
def business_event_registrations(event_id):
    """Return the list of registered participants for a business user's event."""
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        event = db.query(BusinessEvent).filter_by(event_id=event_id, business_user_id=user.id).first()
        if not event:
            return jsonify({'error': 'Event not found'}), 404
        registrations = db.query(EventRegistration, User).join(
            User, EventRegistration.user_id == User.id
        ).filter(EventRegistration.event_id == event_id).all()
        return jsonify({
            'event': business_payload('events', event),
            'registrations': [{
                'id': reg.reg_id,
                'user': {'name': u.name, 'email': u.email},
                'registeredAt': reg.registered_at.isoformat() if hasattr(reg, 'registered_at') and reg.registered_at else None,
            } for reg, u in registrations],
            'count': len(registrations),
        }), 200
    finally:
        db.close()


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


@app.route('/api/business/analytics/export/csv', methods=['GET'])
@require_auth
@require_roles('business')
def business_analytics_export_csv():
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

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Cohort Analytics Export', f'Generated: {datetime.now().isoformat()}', 'Non-clinical lifestyle guidance only - Not medical advice'])
        writer.writerow([])
        writer.writerow(['Metric', 'Contributors', 'Average', 'Status'])
        for field in ('steps', 'sleep'):
            by_member = {}
            for (token, _), values in daily.items():
                if field in values:
                    by_member.setdefault(token, []).append(values[field])
            if len(by_member) >= 5:
                averages = [sum(values) / len(values) for values in by_member.values()]
                avg = round(sum(averages) / len(averages), 1)
                writer.writerow([field.title(), len(by_member), avg, 'Sufficient contributors'])
            else:
                writer.writerow([field.title(), len(by_member), '', 'Suppressed (< 5 contributors)'])
        writer.writerow([])
        writer.writerow(['Date', 'Contributors', 'Average Steps', 'Status'])
        dates = sorted({log_date for _, log_date in daily})
        for log_date in dates:
            values = [values['steps'] for (_, day), values in daily.items() if day == log_date and 'steps' in values]
            if len(values) >= 5:
                writer.writerow([log_date, len(values), round(sum(values) / len(values), 1), 'Sufficient contributors'])
            else:
                writer.writerow([log_date, len(values), '', 'Suppressed (< 5 contributors)'])

        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'cohort_analytics_{today.isoformat()}.csv'
        )
    finally:
        db.close()


@app.route('/api/business/analytics/export/pdf', methods=['GET'])
@require_auth
@require_roles('business')
def business_analytics_export_pdf():
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

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph('Healthy360 Cohort Analytics Report', styles['Title']))
        elements.append(Paragraph(f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', styles['Normal']))
        elements.append(Paragraph('Non-clinical lifestyle guidance only - Not medical advice', styles['Italic']))
        elements.append(Spacer(1, 12))

        metrics_data = [['Metric', 'Contributors', 'Average', 'Status']]
        for field in ('steps', 'sleep'):
            by_member = {}
            for (token, _), values in daily.items():
                if field in values:
                    by_member.setdefault(token, []).append(values[field])
            if len(by_member) >= 5:
                averages = [sum(values) / len(values) for values in by_member.values()]
                avg = round(sum(averages) / len(averages), 1)
                metrics_data.append([field.title(), str(len(by_member)), str(avg), 'Sufficient contributors'])
            else:
                metrics_data.append([field.title(), str(len(by_member)), '', 'Suppressed (< 5 contributors)'])

        metrics_table = Table(metrics_data, colWidths=[120, 100, 100, 180])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(Paragraph('Aggregate Metrics (30-day window)', styles['Heading2']))
        elements.append(metrics_table)
        elements.append(Spacer(1, 12))

        trend_data = [['Date', 'Contributors', 'Average Steps', 'Status']]
        dates = sorted({log_date for _, log_date in daily})
        for log_date in dates:
            values = [values['steps'] for (_, day), values in daily.items() if day == log_date and 'steps' in values]
            if len(values) >= 5:
                trend_data.append([log_date, str(len(values)), str(round(sum(values) / len(values), 1)), 'Sufficient contributors'])
            else:
                trend_data.append([log_date, str(len(values)), '', 'Suppressed (< 5 contributors)'])

        trend_table = Table(trend_data, colWidths=[100, 100, 100, 200])
        trend_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(Paragraph('Daily Step Trend (30-day window)', styles['Heading2']))
        elements.append(trend_table)
        elements.append(Spacer(1, 12))
        elements.append(Paragraph('Note: Opt-in aggregates only; each displayed value has at least five contributors. Simulated data is excluded. Thresholding alone does not guarantee anonymity.', styles['Italic']))

        doc.build(elements)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'cohort_analytics_{today.isoformat()}.pdf'
        )
    finally:
        db.close()


@app.route('/api/feedback/public', methods=['GET'])
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


@app.route('/api/marketplace/<resource>/<int:item_id>/cancel', methods=['POST'])
@app.route('/api/marketplace/<resource>/<int:item_id>/reserve', methods=['DELETE'])
@require_auth
@require_roles(*MEMBER_ROLES)
def cancel_marketplace_item(resource, item_id):
    if resource not in ('services', 'events'):
        return jsonify({'error': 'Unknown resource'}), 404
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        if resource == 'services':
            item = db.query(ServiceReservation).filter_by(service_id=item_id, user_id=user.id).first()
            if not item:
                return jsonify({'error': 'No active reservation found for this service'}), 404
            db.delete(item)
        else:
            item = db.query(EventRegistration).filter_by(event_id=item_id, user_id=user.id).first()
            if not item:
                return jsonify({'error': 'No active registration found for this event'}), 404
            db.delete(item)
        db.commit()
        return jsonify({'message': 'Reservation cancelled successfully'}), 200
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


@app.route('/api/wearable/sync', methods=['POST'])
@app.route('/api/simulated-wearable-sync', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def simulated_wearable_sync():
    """Dev/test-only simulated device sync.

    Retained to exercise the PDPA exclusion guardrail (simulated logs must never
    count toward cohort analytics or challenge leaderboards). It now runs a
    realistic sample through the real XGBoost + SHAP pipeline and tags the row
    ``is_simulated=True``, rather than inserting fixed placeholder metrics.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        sample = {
            'sleep': profile.target_sleep_hours or 7.0,
            'heartRate': profile.baseline_resting_hr or 70,
            'steps': profile.baseline_steps or 7500,
            'fatigue': profile.baseline_fatigue or 4,
        }
        result = service.recommend(sample)
        log_entry = DailyLog(
            pseudonym_token=profile.pseudonym_token,
            date=datetime.now().date().isoformat(),
            source='wearable_sync', is_simulated=True,
            sleep=sample['sleep'], heart_rate=sample['heartRate'],
            steps=sample['steps'], fatigue=sample['fatigue'],
            was_imputed=bool(result['imputed_features']),
        )
        db.add(log_entry)
        db.flush()
        db.add(Recommendation(
            log_id=log_entry.log_id, predicted_plan=SHORT_PLANS[result['plan_level']],
            confidence_score=None, shap_factors_json=result['shap_factors'],
            rationale_text=result['explanation'], what_if_text=result['what_if'],
            response_json=result, adherence_status='pending',
            inference_latency_ms=round(result['latency_ms']),
        ))
        db.commit()
        return jsonify({'message': 'Simulated wearable data imported; no device was connected.'}), 201
    finally:
        db.close()


def _parse_import_rows(req, raw):
    """Parse an import request body into a list of metric dicts.

    Accepts either a JSON array (or {"logs": [...]}) of dated metric objects,
    or a CSV body with a header row of date,sleep,heartRate,steps,fatigue.
    Returns None when the body cannot be interpreted as either format.
    """
    is_csv = req.mimetype == 'text/csv' or raw.lstrip()[:4].lower() == 'date'
    if is_csv:
        reader = csv.DictReader(io.StringIO(raw))
        rows = []
        for row in reader:
            normalized = {}
            for key, value in row.items():
                if key is None:
                    continue
                k = key.strip().lower()
                if k == 'heart_rate':
                    k = 'heartrate'
                normalized[k] = (value or '').strip()
            rows.append({
                'date': normalized.get('date', ''),
                'sleep': normalized.get('sleep', ''),
                'heartRate': normalized.get('heartrate', ''),
                'steps': normalized.get('steps', ''),
                'fatigue': normalized.get('fatigue', ''),
            })
        return rows

    payload = req.get_json(silent=True)
    if isinstance(payload, dict) and isinstance(payload.get('logs'), list):
        return payload['logs']
    if isinstance(payload, list):
        return payload
    return None


@app.route('/api/import-logs', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def import_logs():
    """Import dated lifestyle logs (JSON array or CSV) through the real pipeline.

    Each row is scored by the actual XGBoost + SHAP recommendation service and
    persisted as a DailyLog + Recommendation, mirroring /api/log-metrics. Rows
    are idempotent: an existing log for the same date is updated in place.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=request.user_id).one()
        profile = (
            db.query(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .filter(User.user_id == request.user_id)
            .first()
        )
        if not profile:
            return jsonify({'error': 'User not found'}), 404

        raw = request.get_data(as_text=True)
        rows = _parse_import_rows(request, raw)
        if rows is None:
            return jsonify({'error': 'Provide a JSON array of logs or a CSV body with header date,sleep,heartRate,steps,fatigue'}), 400
        if not rows:
            return jsonify({'error': 'No log rows to import'}), 400
        if len(rows) > 500:
            return jsonify({'error': 'Import is limited to 500 rows per request'}), 400

        imported = updated = skipped = 0
        errors = []
        today = datetime.now().strftime('%Y-%m-%d')

        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                skipped += 1
                errors.append({'row': index + 1, 'error': 'row is not an object'})
                continue

            metrics = {}
            for key in ('sleep', 'heartRate', 'steps', 'fatigue'):
                val = row.get(key)
                if val not in (None, ''):
                    metrics[key] = val
            if not metrics:
                skipped += 1
                errors.append({'row': index + 1, 'error': 'no metrics provided'})
                continue

            log_date = row.get('date') or today
            if not isinstance(log_date, str) or len(log_date) < 10:
                skipped += 1
                errors.append({'row': index + 1, 'error': f'invalid date {log_date!r}'})
                continue

            try:
                result = service.recommend(metrics)
            except InvalidMetricError as err:
                skipped += 1
                errors.append({'row': index + 1, 'error': str(err)})
                continue

            existing = (
                db.query(DailyLog)
                .filter(DailyLog.pseudonym_token == profile.pseudonym_token,
                        DailyLog.date == log_date[:10])
                .first()
            )
            if existing:
                existing.sleep = metrics.get('sleep')
                existing.heart_rate = metrics.get('heartRate')
                existing.steps = metrics.get('steps')
                existing.fatigue = metrics.get('fatigue')
                existing.source = 'import'
                existing.is_simulated = False
                existing.was_imputed = bool(result['imputed_features'])
                rec = db.query(Recommendation).filter_by(log_id=existing.log_id).first()
                if rec:
                    rec.predicted_plan = SHORT_PLANS[result['plan_level']]
                    rec.shap_factors_json = result['shap_factors']
                    rec.rationale_text = result['explanation']
                    rec.what_if_text = result['what_if']
                    rec.response_json = result
                    rec.inference_latency_ms = round(result['latency_ms'])
                else:
                    db.add(Recommendation(
                        log_id=existing.log_id, predicted_plan=SHORT_PLANS[result['plan_level']],
                        confidence_score=None, shap_factors_json=result['shap_factors'],
                        rationale_text=result['explanation'], what_if_text=result['what_if'],
                        response_json=result, adherence_status='pending',
                        inference_latency_ms=round(result['latency_ms']),
                    ))
                updated += 1
            else:
                log_entry = DailyLog(
                    pseudonym_token=profile.pseudonym_token,
                    date=log_date[:10],
                    was_imputed=bool(result['imputed_features']),
                    sleep=float(metrics['sleep']) if metrics.get('sleep') not in (None, '') else None,
                    heart_rate=float(metrics['heartRate']) if metrics.get('heartRate') not in (None, '') else None,
                    steps=float(metrics['steps']) if metrics.get('steps') not in (None, '') else None,
                    fatigue=float(metrics['fatigue']) if metrics.get('fatigue') not in (None, '') else None,
                    source='import',
                    is_simulated=False,
                )
                db.add(log_entry)
                db.flush()
                db.add(Recommendation(
                    log_id=log_entry.log_id, predicted_plan=SHORT_PLANS[result['plan_level']],
                    confidence_score=None, shap_factors_json=result['shap_factors'],
                    rationale_text=result['explanation'], what_if_text=result['what_if'],
                    response_json=result, adherence_status='pending',
                    inference_latency_ms=round(result['latency_ms']),
                ))
                imported += 1

        db.commit()
        return jsonify({'project_id': 'CSIT-26-S4-03', 'imported': imported, 'updated': updated,
                        'skipped': skipped, 'errors': errors}), 200
    except Exception:
        db.rollback()
        app.logger.exception('Could not import logs')
        return jsonify({'error': 'Could not import logs'}), 500
    finally:
        db.close()


@app.route('/api/password-reset', methods=['POST'])
def password_reset():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('email'), str):
        return jsonify({'error': 'Email is required'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == data['email'],
                                     User.role.in_((*MEMBER_ROLES, 'business')),
                                     User.is_active.is_(True)).first()
        if not user:
            # Don't reveal if account exists
            return jsonify({'message': 'If the email is registered, a reset token has been generated.'}), 200
        token = secrets.token_urlsafe(32)
        user.reset_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.reset_token_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15)
        db.commit()
        # In production, email the token. For now, return it for testing.
        return jsonify({'token': token, 'message': 'Reset token generated. In production, this would be emailed.'}), 200
    finally:
        db.close()


@app.route('/api/password-reset/confirm', methods=['POST'])
def password_reset_confirm():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not all(isinstance(data.get(key), str) and data[key] for key in ('email', 'token', 'password')):
        return jsonify({'error': 'Email, token and password are required'}), 400
    if len(data['password']) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == data['email'],
                                     User.role.in_((*MEMBER_ROLES, 'business')),
                                     User.is_active.is_(True)).first()
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


@app.route('/api/dev/password-reset', methods=['POST'])
def dev_password_reset():
    if os.getenv('DEV_SIMULATED_RESET') != '1' or request.remote_addr not in ('127.0.0.1', '::1'):
        return jsonify({'error': 'Simulated password reset is unavailable'}), 404
    return password_reset()


@app.route('/api/dev/password-reset/confirm', methods=['POST'])
def dev_password_reset_confirm():
    if os.getenv('DEV_SIMULATED_RESET') != '1' or request.remote_addr not in ('127.0.0.1', '::1'):
        return jsonify({'error': 'Simulated password reset is unavailable'}), 404
    return password_reset_confirm()


@app.route('/api/log-metrics', methods=['POST'])
@require_auth
@require_roles(*MEMBER_ROLES)
def log_metrics():
    db = SessionLocal()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({'error': 'Request body must be a JSON object'}), 400

        profile = (
            db.query(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .filter(User.user_id == request.user_id)
            .first()
        )
        if not profile:
            return jsonify({'error': 'User not found'}), 404

        # Closed-loop: Look for user's logged workout from yesterday/past 48 hours to compute training load
        yesterday_workout = None
        last_activity = (
            db.query(ActivityLog)
            .filter_by(pseudonym_token=profile.pseudonym_token)
            .order_by(ActivityLog.activity_date.desc(), ActivityLog.activity_id.desc())
            .first()
        )
        if last_activity and last_activity.notes and last_activity.notes.startswith('{'):
            try:
                parsed_act = json.loads(last_activity.notes)
                if isinstance(parsed_act, dict) and ('rpe_score' in parsed_act or 'training_load' in parsed_act):
                    rpe_val = parsed_act.get('rpe_score', 6) or 6
                    dur_val = last_activity.duration_minutes or 30
                    yesterday_workout = {
                        'title': last_activity.title,
                        'duration_minutes': dur_val,
                        'rpe_score': rpe_val,
                        'training_load': parsed_act.get('training_load') or (dur_val * rpe_val),
                        'workout_type': parsed_act.get('workout_type', 'workout'),
                        'adherence_status': parsed_act.get('adherence_status', 'completed')
                    }
            except Exception:
                pass

        try:
            result = service.recommend(payload, yesterday_workout=yesterday_workout)
        except InvalidMetricError as err:
            return jsonify({'error': str(err)}), 400

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


@app.route('/api/admin/users', methods=['GET'])
@require_auth
@require_roles('admin')
def admin_users():
    db = SessionLocal()
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        role_filter = request.args.get('role')
        query = db.query(User)
        if role_filter and role_filter in ('registered', 'premium', 'business', 'admin'):
            query = query.filter(User.role == role_filter)
        total = query.count()
        users = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
        return jsonify({
            'users': [user_payload(u) for u in users],
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': (total + per_page - 1) // per_page
        }), 200
    finally:
        db.close()


@app.route('/api/admin/users/<user_id>', methods=['GET'])
@require_auth
@require_roles('admin')
def admin_user_detail(user_id):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        result = user_payload(user)
        result['is_active'] = user.is_active
        if user.role in MEMBER_ROLES:
            profile = db.query(UserProfile).filter_by(user_id=user.id).first()
            if profile:
                result.update(profile_payload(profile))
        subscriptions = db.query(UserSubscription).filter_by(user_id=user.id).order_by(UserSubscription.subscription_id.desc()).all()
        result['subscriptions'] = [{
            'plan': s.plan.tier_code if s.plan else None,
            'status': s.status,
            'startDate': s.start_date.isoformat(),
            'renewalDate': s.renewal_date.isoformat(),
            'cancelledAt': s.cancelled_at.isoformat() if s.cancelled_at else None,
        } for s in subscriptions]
        feedback = db.query(Feedback).filter_by(user_id=user.id).order_by(Feedback.feedback_id.desc()).limit(20).all()
        result['recentFeedback'] = [{
            'id': f.feedback_id,
            'clarity': f.clarity_score,
            'trust': f.trust_score,
            'comment': f.comment_text,
            'isPublic': f.is_public_featured,
            'createdAt': f.created_at.isoformat(),
        } for f in feedback]
        return jsonify({'user': result}), 200
    finally:
        db.close()


@app.route('/api/admin/users/<user_id>/status', methods=['PATCH'])
@require_auth
@require_roles('admin')
def admin_user_status(user_id):
    """Activate, suspend, or deactivate a user account."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('is_active') not in (True, False):
        return jsonify({'error': 'is_active (true or false) is required'}), 400
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.role == 'admin':
            return jsonify({'error': 'Cannot change admin account status'}), 403
        user.is_active = data['is_active']
        if not user.is_active:
            # Invalidate all sessions for suspended user
            user.session_version += 1
        db.commit()
        return jsonify({
            'user': {**user_payload(user), 'is_active': user.is_active},
            'message': f'Account {"activated" if user.is_active else "suspended"}.',
        }), 200
    finally:
        db.close()


@app.route('/api/admin/feedback', methods=['GET'])
@require_auth
@require_roles('admin')
def admin_feedback():
    db = SessionLocal()
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        query = db.query(Feedback, User).join(User, Feedback.user_id == User.id).order_by(Feedback.created_at.desc())
        total = query.count()
        rows = query.offset((page - 1) * per_page).limit(per_page).all()
        return jsonify({
            'feedback': [{
                'id': f.feedback_id,
                'user': {'id': u.user_id, 'email': u.email, 'name': u.name, 'role': u.role},
                'clarity': f.clarity_score,
                'trust': f.trust_score,
                'comment': f.comment_text,
                'isPublic': f.is_public_featured,
                'recommendationId': f.rec_id,
                'createdAt': f.created_at.isoformat(),
            } for f, u in rows],
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': (total + per_page - 1) // per_page
        }), 200
    finally:
        db.close()


@app.route('/api/admin/feedback/<int:feedback_id>/visibility', methods=['PATCH'])
@require_auth
@require_roles('admin')
def admin_feedback_visibility(feedback_id):
    """Toggle whether a feedback item is publicly visible on the landing page."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('isPublic'), bool):
        return jsonify({'error': 'isPublic (true or false) is required'}), 400
    db = SessionLocal()
    try:
        fb = db.query(Feedback).filter_by(feedback_id=feedback_id).first()
        if not fb:
            return jsonify({'error': 'Feedback not found'}), 404
        fb.is_public_featured = data['isPublic']
        db.commit()
        return jsonify({
            'feedback': {
                'id': fb.feedback_id,
                'isPublic': fb.is_public_featured,
            },
            'message': f'Feedback {"shown on" if fb.is_public_featured else "hidden from"} public page.',
        }), 200
    finally:
        db.close()


@app.route('/api/admin/articles/<int:article_id>/status', methods=['PATCH'])
@require_auth
@require_roles('admin')
def admin_article_status(article_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get('status') not in ('approved', 'rejected'):
        return jsonify({'error': 'Status must be approved or rejected'}), 400
    db = SessionLocal()
    try:
        article = db.query(EducationalArticle).filter_by(article_id=article_id).first()
        if not article:
            return jsonify({'error': 'Article not found'}), 404
        article.approval_status = data['status']
        article.reviewed_by = request.user_id
        if data['status'] == 'approved':
            article.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return jsonify({'article': {
            'id': article.article_id,
            'title': article.title,
            'status': article.approval_status,
            'reviewedBy': article.reviewed_by,
            'publishedAt': article.published_at.isoformat() if article.published_at else None,
        }}), 200
    finally:
        db.close()


@app.route('/api/admin/plans', methods=['PUT'])
@require_auth
@require_roles('admin')
def admin_plans():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get('tier_code') or data['tier_code'] not in ('free', 'premium'):
        return jsonify({'error': 'Valid tier_code (free or premium) is required'}), 400
    db = SessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter_by(tier_code=data['tier_code']).first()
        if not plan:
            return jsonify({'error': 'Plan not found'}), 404
        if 'plan_name' in data and isinstance(data['plan_name'], str) and data['plan_name'].strip():
            plan.plan_name = data['plan_name'].strip()
        if 'price_monthly' in data:
            try:
                price = Decimal(str(data['price_monthly']))
                if not price.is_finite() or price < 0 or price.as_tuple().exponent < -2:
                    raise ValueError
                plan.price_monthly = price
            except (InvalidOperation, ValueError):
                return jsonify({'error': 'Invalid price'}), 400
        if 'currency' in data and isinstance(data['currency'], str) and len(data['currency']) == 3:
            plan.currency = data['currency'].upper()
        if 'benefits' in data and isinstance(data['benefits'], list):
            plan.benefits_json = [str(b).strip() for b in data['benefits'] if isinstance(b, str) and b.strip()]
        if 'is_active' in data and isinstance(data['is_active'], bool):
            plan.is_active = data['is_active']
        plan.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return jsonify({'plan': {
            'tierCode': plan.tier_code,
            'planName': plan.plan_name,
            'priceMonthly': float(plan.price_monthly),
            'currency': plan.currency,
            'benefits': plan.benefits_json,
            'isActive': plan.is_active,
        }}), 200
    finally:
        db.close()


@app.route('/api/admin/fairness-audit', methods=['GET'])
@require_auth
@require_roles('admin')
def admin_fairness_audit():
    if not FAIRLEARN_AVAILABLE:
        return jsonify({'error': 'Fairlearn not available'}), 503
    db = SessionLocal()
    try:
        subgroup_dim = request.args.get('dimension', 'age_bracket')
        if subgroup_dim not in ('age_bracket', 'activity_tier'):
            return jsonify({'error': 'Dimension must be age_bracket or activity_tier'}), 400

        rows = db.query(Recommendation, UserProfile, User).join(
            DailyLog, Recommendation.log_id == DailyLog.log_id
        ).join(
            UserProfile, DailyLog.pseudonym_token == UserProfile.pseudonym_token
        ).join(
            User, UserProfile.user_id == User.id
        ).filter(
            Recommendation.predicted_plan.isnot(None),
            User.role.in_(MEMBER_ROLES)
        ).all()

        if len(rows) < 10:
            return jsonify({'error': 'Insufficient data for fairness audit (minimum 10 recommendations)'}), 400

        y_true = []
        y_pred = []
        sensitive_features = []

        for rec, profile, user in rows:
            plan_map = {'Active Recovery': 0, 'Moderate Cardio': 1, 'High-Intensity Training': 2}
            true_plan = plan_map.get(rec.predicted_plan)
            if true_plan is None:
                continue
            y_true.append(true_plan)
            y_pred.append(true_plan)
            if subgroup_dim == 'age_bracket':
                sensitive_features.append(profile.age_bracket)
            else:
                sensitive_features.append(profile.activity_tier)

        if len(set(sensitive_features)) < 2:
            return jsonify({'error': 'Need at least two distinct subgroups'}), 400

        import numpy as np
        from fairlearn.metrics import MetricFrame
        from sklearn.metrics import accuracy_score

        y_true = np.array(y_true)
        y_pred = np.array(y_pred)
        sensitive = np.array(sensitive_features)

        dp_diff = demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive)
        di_ratio = disparate_impact_ratio(y_true, y_pred, sensitive_features=sensitive)

        subgroup_metrics = {}
        for subgroup in np.unique(sensitive):
            mask = sensitive == subgroup
            if np.sum(mask) > 0:
                subgroup_metrics[str(subgroup)] = {
                    'count': int(np.sum(mask)),
                    'accuracy': float(accuracy_score(y_true[mask], y_pred[mask])),
                    'positive_rate': float(np.mean(y_pred[mask] > 0)),
                }

        audit = FairnessAudit(
            run_by_admin_id=request.user_id,
            subgroup_dimension=subgroup_dim,
            demographic_parity_diff=round(float(dp_diff), 4),
            disparate_impact_ratio=round(float(di_ratio), 4),
            subgroup_metrics_json=subgroup_metrics,
            sample_size=len(y_true),
        )
        db.add(audit)
        db.commit()

        return jsonify({
            'dimension': subgroup_dim,
            'demographicParityDifference': round(float(dp_diff), 4),
            'disparateImpactRatio': round(float(di_ratio), 4),
            'subgroupMetrics': subgroup_metrics,
            'sampleSize': len(y_true),
            'auditId': audit.fairness_id,
        }), 200
    finally:
        db.close()


@app.route('/api/admin/logs', methods=['GET'])
@require_auth
@require_roles('admin')
def admin_logs():
    db = SessionLocal()
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        level_filter = request.args.get('level')
        event_filter = request.args.get('event')
        query = db.query(SystemAuditLog)
        if level_filter and level_filter in ('INFO', 'WARN', 'ERROR'):
            query = query.filter(SystemAuditLog.log_level == level_filter)
        if event_filter and event_filter in ('inference', 'imputation', 'api_error', 'auth_event', 'admin_action'):
            query = query.filter(SystemAuditLog.event_type == event_filter)
        total = query.count()
        logs = query.order_by(SystemAuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
        return jsonify({
            'logs': [{
                'id': log.audit_id,
                'actor': log.actor_user_id,
                'level': log.log_level,
                'event': log.event_type,
                'endpoint': log.endpoint,
                'latencyMs': log.latency_ms,
                'message': log.message,
                'metadata': log.metadata_json,
                'createdAt': log.created_at.isoformat(),
            } for log in logs],
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': (total + per_page - 1) // per_page
        }), 200
    finally:
        db.close()


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)