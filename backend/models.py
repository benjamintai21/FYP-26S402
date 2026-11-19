import uuid
from sqlalchemy import Column, String, Integer, Float, DateTime, Date, Boolean, ForeignKey, JSON, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default='registered')
    is_active = Column(Boolean, nullable=False, default=True)
    session_version = Column(Integer, nullable=False, default=0)
    reset_token_hash = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserProfile(Base):
    __tablename__ = 'user_profiles'

    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    pseudonym_token = Column(String(36), nullable=False, unique=True, default=lambda: str(uuid.uuid4()))
    display_name = Column(String(100), nullable=False)
    age_bracket = Column(String(20), nullable=False, default='30-44')
    activity_tier = Column(String(20), nullable=False, default='moderate')
    target_sleep_hours = Column(Float, nullable=False, default=7.5)
    baseline_resting_hr = Column(Integer, nullable=False, default=70)
    baseline_steps = Column(Integer, nullable=False, default=8000)
    baseline_fatigue = Column(Float, nullable=False, default=4)


class DailyLog(Base):
    __tablename__ = 'daily_logs'

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    pseudonym_token = Column(String(36), ForeignKey('user_profiles.pseudonym_token', ondelete='CASCADE'), nullable=False, index=True)
    date = Column('log_date', String(10), nullable=False)
    sleep = Column('sleep_hours', Float)
    heart_rate = Column('resting_hr', Float)
    steps = Column('daily_steps', Float)
    fatigue = Column('fatigue_score', Float)
    source = Column(String(20), nullable=False, default='manual')
    is_simulated = Column(Boolean, nullable=False, default=False)
    was_imputed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Recommendation(Base):
    __tablename__ = 'recommendations'

    rec_id = Column(Integer, primary_key=True, autoincrement=True)
    log_id = Column(Integer, ForeignKey('daily_logs.log_id', ondelete='CASCADE'), nullable=False)
    predicted_plan = Column(String(30), nullable=False)
    confidence_score = Column(Numeric(5, 4))
    shap_factors_json = Column(JSON, nullable=False)
    rationale_text = Column(Text, nullable=False)
    what_if_text = Column(Text, nullable=False)
    response_json = Column(JSON)
    adherence_status = Column(String(20), nullable=False, default='pending')
    inference_latency_ms = Column(Integer, nullable=False)


class UserPreference(Base):
    __tablename__ = 'user_preferences'

    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    workout_preferences_json = Column(JSON)
    available_minutes_per_day = Column(Integer, nullable=False, default=45)
    dietary_preferences_json = Column(JSON)


class FitnessGoal(Base):
    __tablename__ = 'fitness_goals'

    goal_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(150), nullable=False)
    category = Column(String(30), nullable=False)
    target_value = Column(Numeric(8, 2), nullable=False)
    current_value = Column(Numeric(8, 2), nullable=False, default=0)
    unit = Column(String(30), nullable=False)
    deadline = Column(Date)
    status = Column(String(20), nullable=False, default='active')
    ai_adjustment_suggestion = Column(Text)


class RevokedToken(Base):
    __tablename__ = 'revoked_tokens'

    token_id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class BusinessService(Base):
    __tablename__ = 'business_services'

    service_id = Column(Integer, primary_key=True, autoincrement=True)
    business_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(150), nullable=False)
    category = Column(String(30), nullable=False)
    description = Column(Text, nullable=False)
    price = Column(Numeric(8, 2), nullable=False)
    schedule_info = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())


class BusinessEvent(Base):
    __tablename__ = 'business_events'

    event_id = Column(Integer, primary_key=True, autoincrement=True)
    business_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    event_datetime = Column(DateTime, nullable=False)
    venue = Column(String(255), nullable=False)
    capacity = Column(Integer, nullable=False, default=30)
    status = Column(String(20), nullable=False, default='scheduled')
    created_at = Column(DateTime, server_default=func.now())


class BusinessPost(Base):
    __tablename__ = 'business_posts'

    post_id = Column(Integer, primary_key=True, autoincrement=True)
    business_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    post_type = Column(String(20), nullable=False)
    title = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())


class EventRegistration(Base):
    __tablename__ = 'event_registrations'
    __table_args__ = (UniqueConstraint('event_id', 'user_id'),)

    reg_id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('business_events.event_id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    registered_at = Column(DateTime, server_default=func.now())


class ServiceReservation(Base):
    __tablename__ = 'service_reservations'
    __table_args__ = (UniqueConstraint('service_id', 'user_id'),)

    reservation_id = Column(Integer, primary_key=True, autoincrement=True)
    service_id = Column(Integer, ForeignKey('business_services.service_id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class EventNotification(Base):
    __tablename__ = 'event_notifications'

    notification_id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey('business_events.event_id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    message = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Feedback(Base):
    __tablename__ = 'feedback'

    feedback_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    rec_id = Column(Integer, ForeignKey('recommendations.rec_id', ondelete='SET NULL'))
    clarity_score = Column(Integer)
    trust_score = Column(Integer)
    comment_text = Column(Text)
    is_public_featured = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())


class SubscriptionPlan(Base):
    __tablename__ = 'subscription_plans'

    plan_id = Column(Integer, primary_key=True, autoincrement=True)
    tier_code = Column(String(20), unique=True, nullable=False)
    plan_name = Column(String(100), nullable=False)
    price_monthly = Column(Numeric(6, 2), nullable=False, default=0)
    currency = Column(String(3), nullable=False, default='SGD')
    benefits_json = Column(JSON, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)


class UserSubscription(Base):
    __tablename__ = 'user_subscriptions'

    subscription_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    plan_id = Column(Integer, ForeignKey('subscription_plans.plan_id'), nullable=False)
    status = Column(String(20), nullable=False, default='active')
    start_date = Column(Date, nullable=False)
    renewal_date = Column(Date, nullable=False)
    cancelled_at = Column(DateTime)

    plan = relationship('SubscriptionPlan')


class GeneratedPlan(Base):
    __tablename__ = 'generated_plans'

    plan_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    plan_type = Column(String(20), nullable=False)
    title = Column(String(150), nullable=False)
    plan_payload_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class EducationalArticle(Base):
    __tablename__ = 'educational_articles'

    article_id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    category = Column(String(30), nullable=False)
    summary = Column(String(500), nullable=False)
    content_body = Column(Text, nullable=False)
    approval_status = Column(String(20), nullable=False)


class Challenge(Base):
    __tablename__ = 'challenges'

    challenge_id = Column(Integer, primary_key=True, autoincrement=True)
    business_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(150), nullable=False)
    metric_type = Column(String(30), nullable=False)
    target_value = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)


class ChallengeEntry(Base):
    __tablename__ = 'challenge_entries'
    __table_args__ = (UniqueConstraint('challenge_id', 'user_id'),)

    entry_id = Column(Integer, primary_key=True, autoincrement=True)
    challenge_id = Column(Integer, ForeignKey('challenges.challenge_id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    participant_token = Column(String(36), unique=True)
    current_score = Column(Integer, nullable=False, default=0)


class Cohort(Base):
    __tablename__ = 'cohorts'

    cohort_id = Column(Integer, primary_key=True, autoincrement=True)
    business_user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    cohort_name = Column(String(120), nullable=False)


class CohortMember(Base):
    __tablename__ = 'cohort_members'

    cohort_id = Column(Integer, ForeignKey('cohorts.cohort_id', ondelete='CASCADE'), primary_key=True)
    pseudonym_token = Column(String(36), ForeignKey('user_profiles.pseudonym_token', ondelete='CASCADE'), primary_key=True)


class Consent(Base):
    __tablename__ = 'consents'

    consent_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    consent_type = Column(String(50), nullable=False)
    policy_version = Column(String(20), nullable=False)
    is_granted = Column(Boolean, nullable=False)
    revoked_at = Column(DateTime)


class ActivityLog(Base):
    __tablename__ = 'activity_logs'

    activity_id = Column(Integer, primary_key=True, autoincrement=True)
    pseudonym_token = Column(String(36), ForeignKey('user_profiles.pseudonym_token', ondelete='CASCADE'), nullable=False)
    activity_date = Column(Date, nullable=False)
    title = Column(String(150), nullable=False)
    duration_minutes = Column(Integer)
    notes = Column(Text)


class Product(Base):
    __tablename__ = 'products'

    product_id = Column(Integer, primary_key=True, autoincrement=True)
    product_code = Column(String(50), unique=True, nullable=False)
    product_type = Column(String(20), nullable=False)  # 'meal_plan', 'workout_plan', 'article'
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    content_json = Column(JSON, nullable=False)  # structured plan/article content
    price_cents = Column(Integer, nullable=False)  # price in cents (SGD)
    currency = Column(String(3), nullable=False, default='SGD')
    is_active = Column(Boolean, nullable=False, default=True)
    premium_only = Column(Boolean, nullable=False, default=False)  # if true, only premium users can purchase
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Purchase(Base):
    __tablename__ = 'purchases'

    purchase_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.product_id', ondelete='CASCADE'), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default='SGD')
    status = Column(String(20), nullable=False, default='completed')  # 'completed', 'refunded'
    purchased_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship('Product')


class SystemAuditLog(Base):
    __tablename__ = 'system_audit_logs'

    audit_id = Column(Integer, primary_key=True, autoincrement=True)
    actor_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    log_level = Column(String(10), nullable=False, default='INFO')
    event_type = Column(String(30), nullable=False)
    endpoint = Column(String(150))
    latency_ms = Column(Integer)
    message = Column(String(500), nullable=False)
    metadata_json = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())


class FairnessAudit(Base):
    __tablename__ = 'fairness_audits'

    fairness_id = Column(Integer, primary_key=True, autoincrement=True)
    run_by_admin_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    subgroup_dimension = Column(String(30), nullable=False)
    demographic_parity_diff = Column(Numeric(5, 4), nullable=False)
    disparate_impact_ratio = Column(Numeric(5, 4), nullable=False)
    subgroup_metrics_json = Column(JSON, nullable=False)
    sample_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
