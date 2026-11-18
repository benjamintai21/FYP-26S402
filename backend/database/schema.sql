-- ============================================================================
-- CSIT-26-S4-03: Healthy360 MySQL 8.0 Database Schema
-- Scope: Non-Clinical Explainable AI Health & Lifestyle Platform
-- Privacy design: pseudonymized health records; cohort checks require application enforcement.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS healthy360_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE healthy360_db;

-- ============================================================================
-- 1. IDENTITY, RBAC & PDPA PSEUDONYMIZATION LAYER (PHASE 2)
-- ============================================================================

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    role ENUM('registered', 'premium', 'business', 'admin') NOT NULL DEFAULT 'registered',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    session_version INT NOT NULL DEFAULT 0,
    reset_token_hash VARCHAR(255) NULL,
    reset_token_expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE revoked_tokens (
    token_id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    CONSTRAINT fk_revoked_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Decouples PII (users) from numeric health logs via pseudonym_token (PDPA)
CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY,
    pseudonym_token CHAR(36) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    age_bracket ENUM('18-29', '30-44', '45-59', '60+') NOT NULL DEFAULT '30-44',
    gender ENUM('Female', 'Male', 'Non-Binary', 'Prefer not to say') NOT NULL DEFAULT 'Prefer not to say',
    activity_tier ENUM('sedentary', 'light', 'moderate', 'very_active') NOT NULL DEFAULT 'moderate',
    target_sleep_hours DECIMAL(3,1) NOT NULL DEFAULT 7.5,
    baseline_resting_hr INT NOT NULL DEFAULT 70,
    baseline_steps INT NOT NULL DEFAULT 8000,
    baseline_fatigue DOUBLE NOT NULL DEFAULT 4,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE consents (
    consent_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    consent_type ENUM('pdpa_lifestyle_processing', 'cohort_anonymized_sharing', 'business_account_processing') NOT NULL,
    policy_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    is_granted BOOLEAN NOT NULL DEFAULT TRUE,
    consented_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL,
    CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_consents_user_type (user_id, consent_type)
) ENGINE=InnoDB;

-- ============================================================================
-- 2. SUBSCRIPTION PLANS & BILLING LIFECYCLE (PHASES 3 & 5)
-- ============================================================================

CREATE TABLE subscription_plans (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    tier_code ENUM('free', 'premium') NOT NULL UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    currency CHAR(3) NOT NULL DEFAULT 'SGD',
    benefits_json JSON NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_subscriptions (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    status ENUM('active', 'cancelled', 'expired') NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL,
    renewal_date DATE NOT NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(plan_id),
    INDEX idx_sub_user_status (user_id, status)
) ENGINE=InnoDB;

-- ============================================================================
-- 3. CONSUMER PREFERENCES, GOALS, BIOMETRICS & XAI OUTPUTS (PHASES 2 & 3)
-- ============================================================================

CREATE TABLE user_preferences (
    user_id INT PRIMARY KEY,
    workout_preferences_json JSON NULL,       -- e.g., ["Walking", "Cycling", "Strength", "Yoga"]
    available_minutes_per_day INT NOT NULL DEFAULT 45,
    dietary_preferences_json JSON NULL,       -- e.g., ["Halal", "Vegetarian", "Low-Sugar"]
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE fitness_goals (
    goal_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    category ENUM('steps', 'sleep', 'cardio_minutes', 'recovery_days', 'general_fitness') NOT NULL,
    target_value DECIMAL(8,2) NOT NULL,
    current_value DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    unit VARCHAR(30) NOT NULL,
    deadline DATE NULL,
    status ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
    ai_adjustment_suggestion TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_goals_user_status (user_id, status)
) ENGINE=InnoDB;

-- Pseudonymized Health Vector Store (No direct email/name foreign key)
CREATE TABLE daily_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    pseudonym_token CHAR(36) NOT NULL,
    log_date VARCHAR(10) NOT NULL,
    source ENUM('manual', 'wearable_sync') NOT NULL DEFAULT 'manual',
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    sleep_hours DOUBLE NULL,
    resting_hr DOUBLE NULL,
    daily_steps DOUBLE NULL,
    fatigue_score DOUBLE NULL,
    was_imputed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_pseudonym FOREIGN KEY (pseudonym_token) REFERENCES user_profiles(pseudonym_token) ON DELETE CASCADE,
    INDEX idx_logs_token_date (pseudonym_token, log_date)
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
    activity_id INT AUTO_INCREMENT PRIMARY KEY,
    pseudonym_token CHAR(36) NOT NULL,
    activity_date DATE NOT NULL,
    title VARCHAR(150) NOT NULL,
    duration_minutes INT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_token_date (pseudonym_token, activity_date),
    CONSTRAINT fk_activity_pseudonym FOREIGN KEY (pseudonym_token) REFERENCES user_profiles(pseudonym_token) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE recommendations (
    rec_id INT AUTO_INCREMENT PRIMARY KEY,
    log_id INT NOT NULL,
    predicted_plan ENUM('Active Recovery', 'Moderate Cardio', 'High-Intensity Training') NOT NULL,
    confidence_score DECIMAL(5,4) NULL,
    shap_factors_json JSON NOT NULL,
    rationale_text TEXT NOT NULL,
    what_if_text TEXT NOT NULL,
    response_json JSON NULL,
    adherence_status ENUM('pending', 'completed', 'modified', 'skipped') NOT NULL DEFAULT 'pending',
    inference_latency_ms INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rec_log FOREIGN KEY (log_id) REFERENCES daily_logs(log_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE whatif_scenarios (
    scenario_id INT AUTO_INCREMENT PRIMARY KEY,
    pseudonym_token CHAR(36) NOT NULL,
    base_rec_id INT NULL,
    simulated_sleep DECIMAL(4,2) NOT NULL,
    simulated_hr INT NOT NULL,
    simulated_steps INT NOT NULL,
    simulated_fatigue TINYINT NOT NULL,
    projected_plan ENUM('Active Recovery', 'Moderate Cardio', 'High-Intensity Training') NOT NULL,
    projected_confidence DECIMAL(5,4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_whatif_token FOREIGN KEY (pseudonym_token) REFERENCES user_profiles(pseudonym_token) ON DELETE CASCADE,
    CONSTRAINT fk_whatif_rec FOREIGN KEY (base_rec_id) REFERENCES recommendations(rec_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Premium Structured Workout & Meal Plans
CREATE TABLE generated_plans (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    based_on_rec_id INT NULL,
    plan_type ENUM('workout', 'meal') NOT NULL,
    title VARCHAR(150) NOT NULL,
    plan_payload_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_genplan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_genplan_rec FOREIGN KEY (based_on_rec_id) REFERENCES recommendations(rec_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Expert-Reviewed Educational Content (Premium Read / Admin Approval)
CREATE TABLE educational_articles (
    article_id INT AUTO_INCREMENT PRIMARY KEY,
    author_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    category ENUM('sleep_science', 'recovery_pacing', 'nutrition_habits', 'cardio_training') NOT NULL,
    summary VARCHAR(500) NOT NULL,
    content_body TEXT NOT NULL,
    is_premium_only BOOLEAN NOT NULL DEFAULT TRUE,
    approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES users(id),
    CONSTRAINT fk_articles_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_articles_status (approval_status)
) ENGINE=InnoDB;

-- ============================================================================
-- 4. USER TRUST & PUBLIC PLATFORM FEEDBACK (PHASES 2, 3 & 5)
-- ============================================================================

CREATE TABLE feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    rec_id INT NULL,
    clarity_score TINYINT NULL CHECK (clarity_score BETWEEN 1 AND 5),
    trust_score TINYINT NULL CHECK (trust_score BETWEEN 1 AND 5),
    comment_text TEXT NULL,
    is_public_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_rec FOREIGN KEY (rec_id) REFERENCES recommendations(rec_id) ON DELETE SET NULL,
    INDEX idx_feedback_public (is_public_featured)
) ENGINE=InnoDB;

-- ============================================================================
-- 5. BUSINESS USER PORTAL & K-ANONYMITY COHORTS (PHASE 4)
-- ============================================================================

CREATE TABLE business_services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    business_user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    category ENUM('personal_training', 'group_class', 'gym_membership', 'wellness_program') NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(8,2) NOT NULL,
    schedule_info VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_services_biz FOREIGN KEY (business_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE business_events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    business_user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    event_datetime DATETIME NOT NULL,
    venue VARCHAR(255) NOT NULL,
    capacity INT NOT NULL DEFAULT 30,
    status ENUM('scheduled', 'cancelled', 'completed') NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_events_biz FOREIGN KEY (business_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE event_registrations (
    reg_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_user (event_id, user_id),
    CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES business_events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_reg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE service_reservations (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_service_user (service_id, user_id),
    CONSTRAINT fk_reservation_service FOREIGN KEY (service_id) REFERENCES business_services(service_id) ON DELETE CASCADE,
    CONSTRAINT fk_reservation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE event_notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_user (user_id, created_at),
    CONSTRAINT fk_notice_event FOREIGN KEY (event_id) REFERENCES business_events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_notice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE business_posts (
    post_id INT AUTO_INCREMENT PRIMARY KEY,
    business_user_id INT NOT NULL,
    post_type ENUM('tip', 'promotion', 'announcement') NOT NULL,
    title VARCHAR(180) NOT NULL,
    body TEXT NOT NULL,
    expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_posts_biz FOREIGN KEY (business_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE challenges (
    challenge_id INT AUTO_INCREMENT PRIMARY KEY,
    business_user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    metric_type ENUM('steps', 'active_days', 'sleep_consistency') NOT NULL,
    target_value INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_challenges_biz FOREIGN KEY (business_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE challenge_entries (
    entry_id INT AUTO_INCREMENT PRIMARY KEY,
    challenge_id INT NOT NULL,
    user_id INT NOT NULL,
    current_score INT NOT NULL DEFAULT 0,
    participant_token CHAR(36) NULL UNIQUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_challenge_user (challenge_id, user_id),
    CONSTRAINT fk_entry_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(challenge_id) ON DELETE CASCADE,
    CONSTRAINT fk_entry_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Cohort Grouping for Privacy-Preserving Analytics (Enforce COUNT >= 5 in API)
CREATE TABLE cohorts (
    cohort_id INT AUTO_INCREMENT PRIMARY KEY,
    business_user_id INT NOT NULL,
    cohort_name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cohorts_biz FOREIGN KEY (business_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cohort_members (
    cohort_id INT NOT NULL,
    pseudonym_token CHAR(36) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cohort_id, pseudonym_token),
    CONSTRAINT fk_cm_cohort FOREIGN KEY (cohort_id) REFERENCES cohorts(cohort_id) ON DELETE CASCADE,
    CONSTRAINT fk_cm_token FOREIGN KEY (pseudonym_token) REFERENCES user_profiles(pseudonym_token) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- 6. SYSTEM ADMIN AUDIT LOGS & ALGORITHMIC FAIRNESS (PHASE 5)
-- ============================================================================

CREATE TABLE system_audit_logs (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    log_level ENUM('INFO', 'WARN', 'ERROR') NOT NULL DEFAULT 'INFO',
    event_type ENUM('inference', 'imputation', 'api_error', 'auth_event', 'admin_action') NOT NULL,
    endpoint VARCHAR(150) NULL,
    latency_ms INT NULL,
    message VARCHAR(500) NOT NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_level_type (log_level, event_type, created_at)
) ENGINE=InnoDB;

CREATE TABLE fairness_audits (
    fairness_id INT AUTO_INCREMENT PRIMARY KEY,
    run_by_admin_id INT NULL,
    subgroup_dimension ENUM('age_bracket', 'activity_tier', 'gender') NOT NULL,
    demographic_parity_diff DECIMAL(5,4) NOT NULL,
    disparate_impact_ratio DECIMAL(5,4) NOT NULL,
    subgroup_metrics_json JSON NOT NULL,
    sample_size INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fairness_admin FOREIGN KEY (run_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================================
-- 7. IN-APP PURCHASES (PRODUCTS & PURCHASES)
-- ============================================================================

CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    product_type ENUM('meal_plan', 'workout_plan', 'article', 'subscription') NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    content_json JSON NOT NULL,
    price_cents INT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'SGD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    premium_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE purchases (
    purchase_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    amount_cents INT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'SGD',
    status ENUM('completed', 'refunded') NOT NULL DEFAULT 'completed',
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    INDEX idx_purchases_user (user_id)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. DEFAULT SEED DATA (SUBSCRIPTION PLANS)
-- ============================================================================

INSERT INTO subscription_plans (tier_code, plan_name, price_monthly, currency, benefits_json)
VALUES
  ('free', 'Healthy360 Core', 0.00, 'SGD', JSON_ARRAY(
    'Daily XGBoost Activity & Recovery Recommendations',
    'Basic SHAP Feature Attribution & Plain-English Rationale',
    'Daily Biometric Check-In & Wearable Sync',
    'Fitness Goal Tracking'
  )),
  ('premium', 'Healthy360 Plus', 9.90, 'SGD', JSON_ARRAY(
    'Everything in Healthy360 Core',
    'Personalized Structured Workout & Meal Plan Generators',
    'Multi-Scenario What-If Recourse Comparisons',
    'AI-Driven Goal Adjustment Suggestions',
    'Expert-Reviewed Wellness & Recovery Library'
  ));

-- ============================================================================
-- 9. DEFAULT SEED DATA (PRODUCTS)
-- ============================================================================

INSERT INTO products (product_code, product_type, title, description, content_json, price_cents, currency, is_active, premium_only)
VALUES
  ('meal_vegetarian_starter', 'meal_plan', 'Vegetarian Starter Meal Plan', '7-day vegetarian meal plan with simple recipes and grocery lists.', JSON_OBJECT('duration_days', 7, 'diet', 'vegetarian', 'meals_per_day', 3, 'includes_recipes', true, 'includes_grocery_list', true, 'notes', 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.'), 490, 'SGD', true, false),
  ('meal_vegan_starter', 'meal_plan', 'Vegan Starter Meal Plan', '7-day vegan meal plan with plant-based recipes and grocery lists.', JSON_OBJECT('duration_days', 7, 'diet', 'vegan', 'meals_per_day', 3, 'includes_recipes', true, 'includes_grocery_list', true, 'notes', 'General meal ideas only. Verify every ingredient and label against your own allergies and dietary needs; this is not nutritional or medical advice.'), 490, 'SGD', true, false),
  ('workout_walking_beginner', 'workout_plan', 'Walking for Wellness (Beginner)', '4-week progressive walking program with pacing guidance.', JSON_OBJECT('duration_weeks', 4, 'activity', 'walking', 'sessions_per_week', 3, 'includes_pacing_guide', true, 'notes', 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.'), 390, 'SGD', true, false),
  ('workout_yoga_recovery', 'workout_plan', 'Yoga for Recovery & Mobility', '4-week gentle yoga program focused on recovery and mobility.', JSON_OBJECT('duration_weeks', 4, 'activity', 'yoga', 'sessions_per_week', 3, 'includes_breathing_guide', true, 'notes', 'General lifestyle ideas, not a medical or exercise prescription. Choose a comfortable pace and stop if uncomfortable.'), 390, 'SGD', true, false),
  ('article_sleep_science', 'article', 'The Science of Sleep Hygiene', 'Expert-reviewed article on circadian rhythms, sleep pressure, and practical habits for better sleep.', JSON_OBJECT('category', 'sleep_science', 'reading_time_minutes', 8, 'is_premium_only', true, 'summary', 'Keeping a regular bedtime trains your body clock and improves how refreshed you feel.'), 99, 'SGD', true, true),
  ('article_recovery_pacing', 'article', 'Active Recovery: Why Light Movement Matters', 'Expert-reviewed article on active recovery principles and gentle movement for rest days.', JSON_OBJECT('category', 'recovery_pacing', 'reading_time_minutes', 6, 'is_premium_only', true, 'summary', 'Gentle activity on rest days supports circulation and can ease muscle soreness.'), 99, 'SGD', true, true),
  ('article_nutrition_habits', 'article', 'Hydration & Steady Energy', 'Expert-reviewed article on hydration timing and consistent energy through the day.', JSON_OBJECT('category', 'nutrition_habits', 'reading_time_minutes', 5, 'is_premium_only', true, 'summary', 'Small, consistent sips through the day beat one large intake before bed.'), 99, 'SGD', true, true),
  ('subscription_premium_monthly', 'subscription', 'Healthy360 Plus (Monthly)', 'Monthly premium subscription unlocking personalized plan generators, multi-scenario What-If comparisons, AI goal adjustments, and the expert-reviewed library.', JSON_OBJECT('billing_period', 'monthly', 'renews_automatically', false, 'notes', 'Non-clinical lifestyle content only. Not medical advice.'), 990, 'SGD', true, true);