-- Apply once to an existing database created before baseline persistence.
-- Back up the database first. Do not apply to a freshly created schema.sql.
ALTER TABLE user_profiles
    ADD COLUMN baseline_steps INT NOT NULL DEFAULT 8000,
    ADD COLUMN baseline_fatigue DOUBLE NOT NULL DEFAULT 4;

ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0;
ALTER TABLE daily_logs ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE challenge_entries ADD COLUMN participant_token CHAR(36) NULL UNIQUE;
ALTER TABLE consents MODIFY COLUMN consent_type ENUM('pdpa_lifestyle_processing', 'cohort_anonymized_sharing', 'business_account_processing') NOT NULL;
ALTER TABLE recommendations MODIFY COLUMN confidence_score DECIMAL(5,4) NULL, ADD COLUMN response_json JSON NULL;

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

CREATE TABLE revoked_tokens (
    token_id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    CONSTRAINT fk_revoked_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
