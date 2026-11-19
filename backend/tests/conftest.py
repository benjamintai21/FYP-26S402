import os


os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('JWT_SECRET_KEY', 'test-only-secret-key-at-least-32-bytes')

import pytest

from database import SessionLocal, init_db
from models import Product, SubscriptionPlan


SEED_PRODUCTS = [
    dict(product_code='meal_vegetarian_starter', product_type='meal_plan',
         title='Vegetarian Starter Meal Plan',
         description='7-day vegetarian meal plan with simple recipes and grocery lists.',
         content_json={'duration_days': 7, 'diet': 'vegetarian'},
         price_cents=490, currency='SGD', is_active=True, premium_only=False),
    dict(product_code='workout_yoga_recovery', product_type='workout_plan',
         title='Yoga for Recovery & Mobility',
         description='4-week gentle yoga program focused on recovery and mobility.',
         content_json={'duration_weeks': 4, 'activity': 'yoga'},
         price_cents=390, currency='SGD', is_active=True, premium_only=False),
    dict(product_code='article_sleep_science', product_type='article',
         title='The Science of Sleep Hygiene',
         description='Expert-reviewed article on circadian rhythms and practical habits.',
         content_json={'category': 'sleep_science', 'reading_time_minutes': 8},
         price_cents=99, currency='SGD', is_active=True, premium_only=True),
    dict(product_code='subscription_premium_monthly', product_type='subscription',
         title='Healthy360 Plus (Monthly)',
         description='Monthly premium subscription.',
         content_json={'billing_period': 'monthly', 'renews_automatically': False},
         price_cents=990, currency='SGD', is_active=True, premium_only=True),
]


@pytest.fixture(scope='session', autouse=True)
def seed_products():
    init_db()
    db = SessionLocal()
    try:
        if db.query(Product).count() == 0:
            for data in SEED_PRODUCTS:
                db.add(Product(**data))
        if db.query(SubscriptionPlan).count() == 0:
            db.add(SubscriptionPlan(tier_code='free', plan_name='Healthy360 Core', price_monthly=0.00, currency='SGD', benefits_json=['Daily Recommendations', 'Basic SHAP Factors']))
            db.add(SubscriptionPlan(tier_code='premium', plan_name='Healthy360 Plus', price_monthly=9.90, currency='SGD', benefits_json=['Personalized Workout & Meal Plans', 'What-If Explorer']))
        db.commit()
    finally:
        db.close()
    yield
