"""Populate Healthy360 with realistic demo data so the app has real content.

Run from anywhere:  python backend/seed_demo.py

Idempotent: re-running skips users whose email already exists, so it is safe to
run repeatedly (e.g. after a partial run). Every demo account is seeded with
~30 days of realistic daily logs, and each log is pushed through the real
XGBoost + SHAP recommendation pipeline so SHAP bars, rationales, What-If
recourse, and trend charts all render genuine content.

Demo credentials are printed at the end.
"""

import json
import os
import random
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

# Load backend/.env before importing auth (which reads JWT_SECRET_KEY at import).
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from auth import hash_password
from database import SessionLocal, engine
from models import (
    ActivityLog, BusinessEvent, BusinessPost, BusinessService, Challenge,
    ChallengeEntry, Cohort, CohortMember, Consent, DailyLog, FitnessGoal,
    Recommendation, User, UserPreference, UserProfile, UserSubscription,
)
from ml.service import RecommendationService

DEMO_PASSWORD = "demo1234"

# (email, name, role, age_bracket, activity_tier, gender, target_sleep, baseline_hr, baseline_steps, baseline_fatigue)
MEMBERS = [
    ("alex.tan@demo.com", "Alex Tan", "registered", "18-29", "very_active", "Male", 7.5, 62, 10500, 3.0),
    ("priya.nair@demo.com", "Priya Nair", "registered", "30-44", "light", "Female", 7.0, 72, 6200, 4.5),
    ("marcus.lee@demo.com", "Marcus Lee", "premium", "30-44", "moderate", "Male", 7.8, 68, 8400, 3.5),
    ("sofia.reyes@demo.com", "Sofia Reyes", "premium", "45-59", "sedentary", "Female", 6.8, 78, 4800, 5.5),
    ("daniel.ong@demo.com", "Daniel Ong", "registered", "60+", "light", "Male", 7.2, 74, 5600, 4.0),
    ("mei.ling@demo.com", "Mei Ling", "premium", "30-44", "moderate", "Female", 7.6, 66, 9100, 3.0),
]

BUSINESS = [
    ("fit.harbour@demo.com", "HarbourFit Studio", "business"),
    ("zen.sg@demo.com", "Zen Wellness SG", "business"),
]

ADMIN = [
    ("admin@healthy360.demo", "Healthy360 Admin", "admin"),
]

# 30 consecutive days ending today, so trends (29-day cutoff) are fully populated.
LOG_DAYS = 30


def iso_today():
    return date.today().isoformat()


def days_ago(n):
    return (date.today() - timedelta(days=n)).isoformat()


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def make_log_value(profile, day):
    """Deterministic-ish realistic daily biometrics with day-of-week rhythm."""
    rng = random.Random(f"{profile['email']}:{day}")
    weekday = date.fromisoformat(day).weekday()
    weekend = weekday >= 5

    sleep = rng.gauss(profile["target_sleep"], 0.7)
    sleep += 0.6 if weekend else 0.0
    sleep = clamp(sleep, 5.0, 9.5)

    hr = rng.gauss(profile["baseline_hr"], 4)
    hr = clamp(hr, 50, 100)

    steps = rng.gauss(profile["baseline_steps"], 1800)
    if weekend:
        steps *= 1.15
    steps = clamp(steps, 1500, 19000)

    fatigue = rng.gauss(profile["baseline_fatigue"], 0.9)
    fatigue += 0.5 if sleep < 6.2 else 0.0
    fatigue = clamp(fatigue, 1.0, 9.0)

    return {
        "sleep": round(sleep, 1),
        "heartRate": round(hr),
        "steps": round(steps, -1),
        "fatigue": round(fatigue, 1),
    }


def seed_member(db, email, name, role, age, tier, gender, target_sleep, baseline_hr, baseline_steps, baseline_fatigue, service):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"  ~ existing {email}, skipping account creation")
        return existing.id

    user = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        name=name,
        role=role,
        onboarded=True,
    )
    db.add(user)
    db.flush()

    profile = UserProfile(
        user_id=user.id,
        pseudonym_token=str(uuid.uuid4()),
        display_name=name,
        age_bracket=age,
        activity_tier=tier,
        target_sleep_hours=target_sleep,
        baseline_resting_hr=baseline_hr,
        baseline_steps=baseline_steps,
        baseline_fatigue=baseline_fatigue,
    )
    db.add(profile)
    db.flush()

    db.add(Consent(user_id=user.id, consent_type="pdpa_lifestyle_processing",
                   policy_version="v1.0", is_granted=True))
    db.add(Consent(user_id=user.id, consent_type="cohort_anonymized_sharing",
                   policy_version="v1.0", is_granted=True))

    db.add(UserPreference(
        user_id=user.id,
        workout_preferences_json={"days_per_week": 3, "preferred_modalities": ["walking", "cycling", "yoga"]},
        available_minutes_per_day=45,
        dietary_preferences_json={"diet": "balanced", "excludes": []},
    ))

    # Goals: one step goal and one active-recovery goal.
    db.add(FitnessGoal(
        user_id=user.id, title="Daily step target", category="activity",
        target_value=baseline_steps * 1.1, current_value=baseline_steps,
        unit="steps", deadline=date.today() + timedelta(days=60), status="active",
    ))
    db.add(FitnessGoal(
        user_id=user.id, title="Sleep 7+ hours", category="recovery",
        target_value=7.0, current_value=target_sleep,
        unit="hours", deadline=date.today() + timedelta(days=90), status="active",
    ))

    # ~30 days of logs, each run through the real pipeline.
    profile_row = {
        "email": email,
        "target_sleep": target_sleep,
        "baseline_hr": baseline_hr,
        "baseline_steps": baseline_steps,
        "baseline_fatigue": baseline_fatigue,
    }
    latest_rec_id = None
    for i in range(LOG_DAYS - 1, -1, -1):
        day = days_ago(i)
        values = make_log_value(profile_row, day)
        try:
            result = service.recommend(values)
        except Exception as exc:  # pragma: no cover - defensive
            print(f"    ! recommend failed for {email} {day}: {exc}")
            continue

        log_entry = DailyLog(
            pseudonym_token=profile.pseudonym_token,
            date=day,
            sleep=values["sleep"],
            heart_rate=values["heartRate"],
            steps=values["steps"],
            fatigue=values["fatigue"],
            source="manual",
            is_simulated=False,
            was_imputed=bool(result["imputed_features"]),
        )
        db.add(log_entry)
        db.flush()

        rec = Recommendation(
            log_id=log_entry.log_id,
            predicted_plan=result["recommendation"],
            confidence_score=None,
            shap_factors_json=result["shap_factors"],
            rationale_text=result["explanation"],
            what_if_text=result["what_if"],
            response_json=result,
            adherence_status="pending",
            inference_latency_ms=round(result["latency_ms"]),
        )
        db.add(rec)
        db.flush()
        latest_rec_id = rec.rec_id

    # A few completed activities and some marked-adherence recommendations.
    for offset in (1, 3, 6, 9, 12, 15):
        day = days_ago(offset)
        db.add(ActivityLog(
            pseudonym_token=profile.pseudonym_token,
            activity_date=date.fromisoformat(day),
            title="30-minute light walk",
            duration_minutes=30,
            notes="Active recovery session",
        ))

    if latest_rec_id:
        latest = db.query(Recommendation).filter_by(rec_id=latest_rec_id).first()
        if latest:
            latest.adherence_status = "done"

    db.flush()
    return user.id


def seed_business(db, email, name, role):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"  ~ existing {email}, skipping account creation")
        return existing.id

    user = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        name=name,
        role=role,
        onboarded=True,
    )
    db.add(user)
    db.flush()
    db.add(Consent(user_id=user.id, consent_type="business_account_processing",
                   policy_version="v1.0", is_granted=True))
    db.flush()
    return user.id


def seed_admin(db, email, name, role):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"  ~ existing {email}, skipping account creation")
        return existing.id

    user = User(
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        name=name,
        role=role,
        onboarded=True,
    )
    db.add(user)
    db.flush()
    return user.id


def seed_business_content(db, business_ids):
    if not business_ids:
        return

    # Only add services/events/posts if the first business has none yet.
    has_services = db.query(BusinessService).filter(
        BusinessService.business_user_id == business_ids[0]).count() > 0
    if has_services:
        print("  ~ business content already present, skipping")
        return

    services = [
        ("Personal Training Session", "personal_training",
         "One-on-one coached session to build strength safely around your recovery targets.", 60.00, "Mon/Wed/Fri, 7am-9pm"),
        ("Small-Group HIIT", "group_class",
         "45-minute high-intensity interval class with recovery-focused scaling options.", 25.00, "Tue/Thu, 6pm & 7pm"),
        ("Monthly Membership", "gym_membership",
         "Unlimited access to equipment and open gym hours with a monthly check-in.", 89.00, "Daily, 6am-10pm"),
        ("Recovery & Mobility Program", "wellness_program",
         "6-week guided mobility and active-recovery program for desk workers.", 120.00, "Sat, 9am"),
    ]
    for i, (title, cat, desc, price, sched) in enumerate(services):
        db.add(BusinessService(
            business_user_id=business_ids[i % len(business_ids)],
            title=title, category=cat, description=desc,
            price=price, schedule_info=sched, is_active=True,
        ))

    events = [
        ("Weekend Sunrise Walk", "Group 5km walk with guided breathing at East Coast Park.",
         datetime.now() + timedelta(days=6, hours=9), "East Coast Park", 40, "scheduled"),
        ("Sleep & Recovery Workshop", "Non-clinical talk on sleep hygiene and pacing for busy schedules.",
         datetime.now() + timedelta(days=12, hours=18, minutes=30), "HarbourFit Studio", 25, "scheduled"),
    ]
    for title, desc, when, venue, cap, status in events:
        db.add(BusinessEvent(
            business_user_id=business_ids[0],
            title=title, description=desc, event_datetime=when,
            venue=venue, capacity=cap, status=status,
        ))

    posts = [
        ("tip", "Hydrate through the day", "Keep a water bottle nearby and aim for small, steady sips rather than a single large intake before bed."),
        ("promotion", "Recovery Month offer", "Book any wellness program this month and get a free mobility assessment with our coaches."),
        ("announcement", "New class times", "Starting next week, our evening HIIT classes move to 6:30pm to give commuters more room."),
    ]
    for ptype, title, body in posts:
        db.add(BusinessPost(
            business_user_id=business_ids[0],
            post_type=ptype, title=title, body=body,
            expires_at=datetime.now() + timedelta(days=30),
        ))

    # A live step challenge across the demo member cohort (needs >= 5 opted-in contributors).
    challenge = Challenge(
        business_user_id=business_ids[0],
        title="30-Day Step Challenge",
        metric_type="steps",
        target_value=250000,
        start_date=date.today() - timedelta(days=7),
        end_date=date.today() + timedelta(days=23),
    )
    db.add(challenge)
    db.flush()

    cohort = Cohort(business_user_id=business_ids[0], cohort_name="Demo Wellness Cohort")
    db.add(cohort)
    db.flush()

    members = db.query(UserProfile).join(User, UserProfile.user_id == User.id).filter(
        User.role.in_(("registered", "premium"))).all()
    for profile in members:
        db.add(CohortMember(cohort_id=cohort.cohort_id, pseudonym_token=profile.pseudonym_token))
        score = random.Random(profile.pseudonym_token).randint(20000, 160000)
        db.add(ChallengeEntry(
            challenge_id=challenge.challenge_id,
            user_id=profile.user_id,
            participant_token=str(uuid.uuid4()),
            current_score=score,
        ))
    db.flush()


def seed_articles(db, admin_id):
    count = db.execute(text("SELECT COUNT(*) FROM educational_articles")).scalar()
    if count and count > 0:
        print("  ~ educational articles already present, skipping")
        return

    articles = [
        ("sleep_science", "Why a consistent sleep window matters",
         "Keeping a regular bedtime trains your body clock and improves how refreshed you feel.",
         "Your body runs on a circadian rhythm. When you go to bed and wake up at roughly the same time each day, your sleep pressure builds and releases predictably. Aim for a 30-minute bedtime window and keep it even on weekends. Avoid caffeine after mid-afternoon and bright screens within an hour of bed. These are general lifestyle habits, not medical advice.", False),
        ("recovery_pacing", "Active recovery: light movement on rest days",
         "Gentle activity on rest days supports circulation and can ease muscle soreness.",
         "Active recovery does not mean a hard workout. A 20-30 minute walk, easy cycling, or gentle yoga keeps blood flowing and helps you feel ready for your next session. The key is staying well below your usual effort. If you feel unusually drained, scale down further.", False),
        ("nutrition_habits", "Hydration and steady energy",
         "Small, consistent sips through the day beat one large intake before bed.",
         "Water supports nearly every process in your body. Rather than drinking a lot in the evening, spread your intake across the day. Keep a bottle visible at your desk. If you are active, add a little extra around your sessions. This is a general wellness tip and not a medical or dietary prescription.", False),
        ("cardio_training", "Pacing your cardio to feel sustainable",
         "Building aerobic fitness is about consistency, not one exhausting session.",
         "Mix intensities across the week: a couple of moderate sessions and one longer, easier session. Listen to how you feel on the day. On high-fatigue days, choose a shorter, gentler session. Over time, steady consistency beats sporadic intensity.", True),
    ]
    for i, (cat, title, summary, body, premium) in enumerate(articles):
        db.execute(
            text("""
                INSERT INTO educational_articles
                    (author_id, title, category, summary, content_body, is_premium_only, approval_status, published_at)
                VALUES (:author, :title, :cat, :summary, :body, :premium, 'approved', :published)
            """),
            {
                "author": admin_id,
                "title": title,
                "cat": cat,
                "summary": summary,
                "body": body,
                "premium": 1 if premium else 0,
                "published": datetime.now() - timedelta(days=i * 2),
            },
        )
    db.flush()


def seed_subscription(db, member_user_ids):
    if not member_user_ids:
        return
    plan = db.execute(text("SELECT plan_id FROM subscription_plans WHERE tier_code='premium'")).scalar()
    if not plan:
        print("  ! premium subscription plan missing; skipping subscription")
        return
    # Give the premium demo users an active subscription.
    premium_users = db.query(User).filter(User.email.in_(
        ["marcus.lee@demo.com", "sofia.reyes@demo.com", "mei.ling@demo.com"])).all()
    for u in premium_users:
        has_sub = db.query(UserSubscription).filter_by(user_id=u.id, status="active").first()
        if has_sub:
            continue
        db.add(UserSubscription(
            user_id=u.id, plan_id=plan, status="active",
            start_date=date.today() - timedelta(days=15),
            renewal_date=date.today() + timedelta(days=15),
        ))
    db.flush()


def main():
    random.seed(42)
    service = RecommendationService()
    db = SessionLocal()
    created_users = []
    try:
        from app import ensure_default_seed_data
        print("Ensuring baseline subscription plans and products exist ...")
        ensure_default_seed_data(db)

        print("Seeding Healthy360 demo data ...")
        print("[members]")
        for m in MEMBERS:
            uid = seed_member(db, *m, service)
            created_users.append(uid)
            db.commit()
            print(f"  + {m[0]} ({m[2]})")

        print("[business]")
        biz_ids = []
        for b in BUSINESS:
            uid = seed_business(db, *b)
            biz_ids.append(uid)
            created_users.append(uid)
            db.commit()
            print(f"  + {b[0]} ({b[2]})")

        print("[admin]")
        admin_ids = []
        for a in ADMIN:
            uid = seed_admin(db, *a)
            admin_ids.append(uid)
            created_users.append(uid)
            db.commit()
            print(f"  + {a[0]} ({a[2]})")

        print("[business content]")
        seed_business_content(db, biz_ids)
        db.commit()

        print("[educational articles]")
        seed_articles(db, admin_ids[0])
        db.commit()

        print("[subscriptions]")
        seed_subscription(db, created_users)
        db.commit()

        # Final counts for verification.
        def count(table):
            return db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()

        print("\n=== Seed summary ===")
        print(f"  users:            {count('users')}")
        print(f"  profiles:         {count('user_profiles')}")
        print(f"  daily_logs:       {count('daily_logs')}")
        print(f"  recommendations:  {count('recommendations')}")
        print(f"  consents:         {count('consents')}")
        print(f"  fitness_goals:    {count('fitness_goals')}")
        print(f"  activity_logs:    {count('activity_logs')}")
        print(f"  subscriptions:    {count('user_subscriptions')}")
        print(f"  services:         {count('business_services')}")
        print(f"  events:           {count('business_events')}")
        print(f"  posts:            {count('business_posts')}")
        print(f"  challenges:       {count('challenges')}")
        print(f"  cohort_members:   {count('cohort_members')}")
        print(f"  articles:         {count('educational_articles')}")

        print("\n=== Demo logins (password: %s) ===" % DEMO_PASSWORD)
        for label, emails in [
            ("Members", [m[0] for m in MEMBERS]),
            ("Business", [b[0] for b in BUSINESS]),
            ("Admin", [a[0] for a in ADMIN]),
        ]:
            print(f"  {label}:")
            for e in emails:
                print(f"    {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
