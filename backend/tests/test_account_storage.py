import uuid
import time
from datetime import date

import pytest

from app import app
from database import SessionLocal
from models import DailyLog, Feedback, Recommendation, User, UserProfile, SubscriptionPlan, UserSubscription, Consent


def register(client, role='registered'):
    email = f'{uuid.uuid4()}@example.test'
    response = client.post('/api/register', json={
        'email': email, 'password': 'test-password', 'name': 'Test User', 'role': role, 'consent': True
    })
    assert response.status_code == 201
    return email, response.get_json()


def test_accounts_and_pseudonymized_logs_are_isolated():
    client = app.test_client()
    email, first = register(client)
    _, second = register(client)

    login = client.post('/api/login', json={'email': email, 'password': 'test-password'})
    assert login.status_code == 200
    headers = {'Authorization': f"Bearer {login.get_json()['token']}"}
    assert client.get('/api/me', headers=headers).get_json()['user']['user_id'] == first['user']['user_id']

    metrics = {'date': date.today().isoformat(), 'sleep': 7, 'heartRate': '', 'steps': 6000, 'fatigue': 4}
    response = client.post('/api/log-metrics', json=metrics, headers=headers)
    assert response.status_code == 200
    latest = client.get('/api/recommendations/latest', headers=headers).get_json()['recommendation']
    assert latest['recommendation_id'] == response.get_json()['recommendation_id']
    assert latest['recommendation']
    assert latest['metrics']['steps'] == 6000
    assert client.get('/api/recommendations/latest', headers={'Authorization': f"Bearer {second['token']}"}).get_json()['recommendation'] is None
    assert client.get('/api/trends', headers=headers).get_json()['logs'] == [{
        'date': metrics['date'], 'sleep': 7, 'heartRate': None, 'steps': 6000, 'fatigue': 4,
        'source': 'manual', 'is_simulated': False,
    }]
    other_headers = {'Authorization': f"Bearer {second['token']}"}
    assert client.get('/api/trends', headers=other_headers).get_json()['logs'] == []
    feedback = {'recommendation_id': latest['recommendation_id'], 'adherence': 'completed', 'comment': 'Helpful'}
    assert client.post('/api/feedback', headers=other_headers, json=feedback).status_code == 404
    assert client.post('/api/feedback', headers=headers, json=feedback).status_code == 201
    assert client.get('/api/recommendations/latest', headers=headers).get_json()['recommendation']['adherence'] == 'completed'

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=first['user']['user_id']).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        log = db.query(DailyLog).filter_by(pseudonym_token=profile.pseudonym_token).one()
        assert log.pseudonym_token != user.user_id
        assert log.was_imputed
        assert db.query(Feedback).filter_by(user_id=user.id, rec_id=latest['recommendation_id']).one().comment_text == 'Helpful'
    finally:
        db.close()


@pytest.mark.parametrize('role,profile', [
    ('registered', 'member'), ('premium', 'member'), ('business', 'business')
])
def test_login_uses_stored_role_and_checks_selected_profile(role, profile):
    client = app.test_client()
    email, registered = register(client, 'business' if role == 'business' else 'registered')
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        user.role = role
        db.commit()
    finally:
        db.close()

    credentials = {'email': email, 'password': 'test-password'}
    response = client.post('/api/login', json={**credentials, 'profile': profile})
    assert response.status_code == 200
    assert response.get_json()['user']['role'] == role
    headers = {'Authorization': f"Bearer {response.get_json()['token']}"}
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == role
    wrong_profile = 'business' if profile != 'business' else 'member'
    assert client.post('/api/login', json={**credentials, 'profile': wrong_profile}).status_code == 401
    expected = 200 if role in ('registered', 'premium') else 403
    assert client.get('/api/trends', headers=headers).status_code == expected
    if expected == 403:
        assert client.post('/api/log-metrics', json={}, headers=headers).status_code == 403
        assert client.post('/api/whatif', json={}, headers=headers).status_code == 403


@pytest.mark.parametrize('role', ['admin', 'premium', 'unknown'])
def test_registration_cannot_grant_privileged_roles(role):
    client = app.test_client()
    response = client.post('/api/register', json={
        'email': f'{uuid.uuid4()}@example.test', 'password': 'test-password',
        'name': 'Test User', 'role': role,
    })
    assert response.status_code == 400


def test_role_and_active_status_are_checked_for_existing_tokens():
    client = app.test_client()
    _, registered = register(client)
    headers = {'Authorization': f"Bearer {registered['token']}"}
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        user.role = 'business'
        db.commit()
        assert client.get('/api/trends', headers=headers).status_code == 403
        user.is_active = False
        db.commit()
        assert client.get('/api/me', headers=headers).status_code == 401
    finally:
        db.close()


def test_admin_login_is_not_available():
    client = app.test_client()
    email, registered = register(client)
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        user.role = 'admin'
        db.commit()
    finally:
        db.close()
    assert client.post('/api/login', json={'email': email, 'password': 'test-password'}).status_code == 401


def test_member_baseline_persists_and_imported_logs_are_labeled():
    client = app.test_client()
    _, registered = register(client)
    headers = {'Authorization': f"Bearer {registered['token']}"}
    profile = {'ageBracket': '30-44', 'activityLevel': 'light', 'baseline': {
        'sleep': 7.5, 'heartRate': 65, 'steps': 8500, 'fatigue': 3,
    }}
    assert client.post('/api/onboarding', json=profile, headers=headers).status_code == 200
    me = client.get('/api/me', headers=headers).get_json()['user']
    assert me['onboarded'] is True
    assert me['baseline'] == profile['baseline']
    today = date.today().isoformat()
    resp = client.post('/api/import-logs', headers=headers, json={'logs': [
        {'date': today, 'sleep': 7.2, 'heartRate': 68, 'steps': 9200, 'fatigue': 3.5},
    ]})
    assert resp.status_code == 200
    assert resp.get_json()['imported'] == 1
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        stored_profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        log = db.query(DailyLog).filter_by(pseudonym_token=stored_profile.pseudonym_token).one()
        assert log.source == 'import'
        assert log.is_simulated is False
        assert log.fatigue == 3.5
        assert db.query(Recommendation).filter_by(log_id=log.log_id).count() == 1
    finally:
        db.close()


def test_import_logs_supports_csv_idempotency_and_validation():
    client = app.test_client()
    _, registered = register(client)
    headers = {'Authorization': f"Bearer {registered['token']}"}
    assert client.post('/api/onboarding', headers=headers, json={
        'ageBracket': '30-44', 'activityLevel': 'light', 'baseline': {
            'sleep': 7.5, 'heartRate': 65, 'steps': 8500, 'fatigue': 3,
        },
    }).status_code == 200
    today = date.today().isoformat()
    csv_body = f"date,sleep,heartRate,steps,fatigue\n{today},7.4,66,10100,3.0\n2026-01-01,6.2,75,4300,5.5\n"
    first = client.post('/api/import-logs', headers=headers, data=csv_body, content_type='text/csv')
    assert first.status_code == 200
    body = first.get_json()
    assert body['imported'] == 2
    assert body['skipped'] == 0

    # Re-importing the same CSV updates in place rather than duplicating.
    again = client.post('/api/import-logs', headers=headers, data=csv_body, content_type='text/csv')
    assert again.get_json()['updated'] == 2
    assert again.get_json()['imported'] == 0

    # A malformed body is rejected, and a bad row is skipped, not fatal.
    assert client.post('/api/import-logs', headers=headers, json={'logs': 'not-a-list'}).status_code == 400
    mixed = client.post('/api/import-logs', headers=headers, json={'logs': [
        {'date': today, 'sleep': 'abc', 'heartRate': 70, 'steps': 5000, 'fatigue': 4},
        {'date': '2026-02-01', 'sleep': 7.0, 'heartRate': 70, 'steps': 5000, 'fatigue': 4},
    ]})
    assert mixed.status_code == 200
    assert mixed.get_json()['skipped'] == 1
    assert mixed.get_json()['imported'] == 1

    # Imported logs must never be flagged simulated (PDPA exclusion guardrail).
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        logs = db.query(DailyLog).filter_by(pseudonym_token=profile.pseudonym_token).all()
        assert len(logs) == 3
        assert all(log.source == 'import' for log in logs)
        assert all(log.is_simulated is False for log in logs)
    finally:
        db.close()


def test_simulated_business_reset_is_disabled_by_default_and_token_is_single_use(monkeypatch):
    client = app.test_client()
    email, _ = register(client, 'business')
    assert client.post('/api/dev/password-reset', json={'email': email}).status_code == 404
    monkeypatch.setenv('DEV_SIMULATED_RESET', '1')
    response = client.post('/api/dev/password-reset', json={'email': email})
    assert response.status_code == 200
    token = response.get_json()['token']
    payload = {'email': email, 'token': token, 'password': 'new-password'}
    assert client.post('/api/dev/password-reset/confirm', json=payload).status_code == 200
    assert client.post('/api/dev/password-reset/confirm', json=payload).status_code == 400
    assert client.post('/api/login', json={'email': email, 'password': 'new-password', 'profile': 'business'}).status_code == 200


@pytest.mark.parametrize('role', ['registered', 'premium'])
def test_simulated_member_reset_is_local_only_and_revokes_sessions(monkeypatch, role):
    client = app.test_client()
    email, registered = register(client)
    if role == 'premium':
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
            user.role = role
            db.commit()
        finally:
            db.close()
    assert client.post('/api/dev/password-reset', json={'email': email}).status_code == 404
    monkeypatch.setenv('DEV_SIMULATED_RESET', '1')
    assert client.post('/api/dev/password-reset', json={'email': email},
                       environ_base={'REMOTE_ADDR': '192.0.2.1'}).status_code == 404
    response = client.post('/api/dev/password-reset', json={'email': email})
    assert response.status_code == 200
    payload = {'email': email, 'token': response.get_json()['token'], 'password': 'new-password'}
    assert client.post('/api/dev/password-reset/confirm', json=payload,
                       environ_base={'REMOTE_ADDR': '192.0.2.1'}).status_code == 404
    assert client.post('/api/dev/password-reset/confirm', json={**payload, 'token': 'invalid'}).status_code == 400
    assert client.post('/api/dev/password-reset/confirm', json=payload).status_code == 200
    assert client.post('/api/dev/password-reset/confirm', json=payload).status_code == 400
    assert client.get('/api/me', headers={'Authorization': f"Bearer {registered['token']}"}).status_code == 401
    assert client.post('/api/login', json={'email': email, 'password': 'new-password', 'profile': 'member'}).status_code == 200


def test_goals_and_preferences_are_private_and_persisted():
    client = app.test_client()
    _, first = register(client)
    _, second = register(client)
    headers = {'Authorization': f"Bearer {first['token']}"}
    other = {'Authorization': f"Bearer {second['token']}"}
    preferences = {'workout': ['Walking'], 'dietary': ['Vegetarian'], 'availableMinutes': 30}
    assert client.put('/api/preferences', json=preferences, headers=headers).get_json() == preferences
    assert client.get('/api/preferences', headers=other).get_json()['workout'] == []
    goal = {'title': 'Walk more', 'category': 'steps', 'target': 8000, 'current': 2000, 'unit': 'steps'}
    created = client.post('/api/goals', json=goal, headers=headers)
    assert created.status_code == 201
    goal_id = created.get_json()['goal']['id']
    assert client.get('/api/goals', headers=other).get_json()['goals'] == []
    assert client.delete(f'/api/goals/{goal_id}', headers=other).status_code == 404
    goal['current'] = 3000
    assert client.put(f'/api/goals/{goal_id}', json=goal, headers=headers).get_json()['goal']['current'] == 3000
    assert client.delete(f'/api/goals/{goal_id}', headers=headers).status_code == 200
    assert client.get('/api/goals', headers=headers).get_json()['goals'] == []
    goal['target'] = -1
    assert client.post('/api/goals', json=goal, headers=headers).status_code == 400


def test_logout_revokes_only_current_session_and_password_change_revokes_others():
    client = app.test_client()
    email, first = register(client)
    second = client.post('/api/login', json={'email': email, 'password': 'test-password'}).get_json()
    first_headers = {'Authorization': f"Bearer {first['token']}"}
    second_headers = {'Authorization': f"Bearer {second['token']}"}
    assert client.post('/api/logout', headers=first_headers).status_code == 200
    assert client.get('/api/me', headers=first_headers).status_code == 401
    assert client.get('/api/me', headers=second_headers).status_code == 200
    changed = client.post('/api/change-password', headers=second_headers, json={
        'currentPassword': 'test-password', 'newPassword': 'another-password',
    })
    assert changed.status_code == 200
    assert client.get('/api/me', headers=second_headers).status_code == 401
    new_headers = {'Authorization': f"Bearer {changed.get_json()['token']}"}
    assert client.get('/api/me', headers=new_headers).status_code == 200


def test_business_offerings_are_owned_and_event_changes_notify_attendees():
    client = app.test_client()
    _, business = register(client, 'business')
    _, other_business = register(client, 'business')
    _, member = register(client)
    owner_headers = {'Authorization': f"Bearer {business['token']}"}
    other_headers = {'Authorization': f"Bearer {other_business['token']}"}
    member_headers = {'Authorization': f"Bearer {member['token']}"}
    event = {'title': 'Walk together', 'description': 'A group walk', 'dateTime': '2099-01-01T10:00',
             'venue': 'Park', 'capacity': 1}
    response = client.post('/api/business/events', json=event, headers=owner_headers)
    assert response.status_code == 201
    item_id = response.get_json()['item']['id']
    assert client.put(f'/api/business/events/{item_id}', json=event, headers=other_headers).status_code == 404
    assert any(item['id'] == item_id for item in client.get('/api/marketplace').get_json()['events'])
    assert client.post(f'/api/marketplace/events/{item_id}/reserve', headers=member_headers).status_code == 201
    _, another_member = register(client)
    another_headers = {'Authorization': f"Bearer {another_member['token']}"}
    assert client.post(f'/api/marketplace/events/{item_id}/reserve', headers=another_headers).status_code == 409
    event['venue'] = 'Community park'
    assert client.put(f'/api/business/events/{item_id}', json=event, headers=owner_headers).status_code == 200
    assert client.get('/api/event-notifications', headers=member_headers).get_json()['notifications'][0]['event']['venue'] == 'Community park'
    assert client.delete(f'/api/business/events/{item_id}', headers=owner_headers).status_code == 200
    notices = client.get('/api/event-notifications', headers=member_headers).get_json()['notifications']
    assert notices[0]['event']['status'] == 'cancelled'
    assert client.post('/api/business/events', json=event, headers=member_headers).status_code == 403


def test_subscription_purchase_promotes_to_premium():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    db = SessionLocal()
    try:
        if not db.query(SubscriptionPlan).filter_by(tier_code='premium').first():
            db.add(SubscriptionPlan(tier_code='premium', plan_name='Test premium', price_monthly=9.90,
                                    currency='SGD', benefits_json=['benefit1'], is_active=True))
            db.commit()
    finally:
        db.close()
    # Start = purchase subscription -> promotes to premium
    started = client.post('/api/subscription', json={'action': 'start'}, headers=headers)
    assert started.status_code == 200
    assert started.get_json()['mode'] == 'subscription_purchase'
    assert started.get_json()['role'] == 'premium'
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == 'premium'
    # Verify a purchase was recorded
    purchases = client.get('/api/purchases', headers=headers).get_json()['purchases']
    assert len(purchases) == 1
    assert purchases[0]['product']['code'] == 'subscription_premium_monthly'
    # Cancel future renewal (no payment)
    cancelled = client.post('/api/subscription', json={'action': 'cancel'}, headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.get_json()['subscription']['status'] == 'cancelled'
    # Still premium until renewal date passes
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == 'premium'
    # Renew = purchase again -> extends access
    renewed = client.post('/api/subscription', json={'action': 'renew'}, headers=headers)
    assert renewed.status_code == 200
    assert renewed.get_json()['subscription']['status'] == 'active'
    # Verify another purchase recorded
    purchases = client.get('/api/purchases', headers=headers).get_json()['purchases']
    assert len(purchases) == 2
    # Expire subscription -> role drops to registered
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=member['user']['user_id']).one()
        subscription = db.query(UserSubscription).filter_by(user_id=user.id).one()
        subscription.renewal_date = date(2000, 1, 1)
        db.commit()
    finally:
        db.close()
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == 'registered'


def test_premium_plan_access_and_unsupported_restrictions():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    assert client.get('/api/premium/plans', headers=headers).status_code == 403
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=member['user']['user_id']).one()
        user.role = 'premium'
        db.commit()
    finally:
        db.close()
    prefs = {'workout': ['Walking'], 'dietary': ['nut allergy'], 'availableMinutes': 15}
    assert client.put('/api/preferences', json=prefs, headers=headers).status_code == 200
    assert client.post('/api/log-metrics', headers=headers, json={
        'sleep': 7, 'heartRate': 70, 'steps': 8000, 'fatigue': 4,
    }).status_code == 200
    assert client.post('/api/premium/plans', json={'type': 'meal'}, headers=headers).status_code == 400
    workout = client.post('/api/premium/plans', json={'type': 'workout'}, headers=headers)
    assert workout.status_code == 201
    assert workout.get_json()['plans'][0]['details']['minutes'] == 15
    prefs['dietary'] = ['vegan']
    client.put('/api/preferences', json=prefs, headers=headers)
    assert client.post('/api/premium/plans', json={'type': 'meal'}, headers=headers).status_code == 201
    assert client.get('/api/articles', headers=headers).get_json()['articles'] == []


def test_premium_plans_use_own_latest_recovery_state_and_preferences():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=member['user']['user_id']).one()
        user.role = 'premium'
        db.commit()
    finally:
        db.close()
    _, other = register(client)
    other_headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.post('/api/log-metrics', headers=other_headers, json={
        'sleep': 8.5, 'heartRate': 58, 'steps': 12000, 'fatigue': 2,
    }).status_code == 200
    assert client.post('/api/premium/plans', headers=headers, json={'type': 'workout'}).status_code == 409
    prefs = {'workout': ['cycling'], 'dietary': ['vegan'], 'availableMinutes': 15}
    assert client.put('/api/preferences', headers=headers, json=prefs).status_code == 200
    tired = client.post('/api/log-metrics', headers=headers, json={
        'sleep': 5.5, 'heartRate': 80, 'steps': 6000, 'fatigue': 7,
    }).get_json()
    recovery = client.post('/api/premium/plans', headers=headers, json={'type': 'workout'}).get_json()['plans'][0]
    meal = client.post('/api/premium/plans', headers=headers, json={'type': 'meal'}).get_json()['plans'][0]
    assert recovery['details']['recoveryLevel'] == tired['plan_level'] == 0
    assert recovery['details']['recommendationId'] == tired['recommendation_id']
    assert recovery['details']['minutes'] <= 15
    assert 'cycling' in ' '.join(recovery['details']['items']).lower()
    assert meal['details']['recoveryLevel'] == 0
    assert meal['details']['preferences'] == ['vegan']
    fit = client.post('/api/log-metrics', headers=headers, json={
        'sleep': 8.5, 'heartRate': 58, 'steps': 12000, 'fatigue': 2,
    }).get_json()
    active = client.post('/api/premium/plans', headers=headers, json={'type': 'workout'}).get_json()['plans'][0]
    active_meal = client.post('/api/premium/plans', headers=headers, json={'type': 'meal'}).get_json()['plans'][0]
    assert active['details']['recoveryLevel'] == fit['plan_level'] == 2
    assert active['details']['recommendationId'] == fit['recommendation_id']
    assert active['details']['items'] != recovery['details']['items']
    assert active_meal['details']['recoveryLevel'] == 2
    assert active_meal['details']['items'] != meal['details']['items']


def test_challenge_requires_consent_and_excludes_simulated_steps():
    client = app.test_client()
    _, business = register(client, 'business')
    _, member = register(client)
    owner = {'Authorization': f"Bearer {business['token']}"}
    member_headers = {'Authorization': f"Bearer {member['token']}"}
    today = date.today().isoformat()
    challenge = client.post('/api/business/challenges', headers=owner, json={
        'title': 'Walk', 'target': 10000, 'startDate': today, 'endDate': today,
    }).get_json()['challenge']
    path = f"/api/challenges/{challenge['id']}"
    assert client.post(f'{path}/participation', headers=member_headers, json={}).status_code == 400
    assert client.post(f'{path}/participation', headers=member_headers, json={'consent': True}).status_code == 201
    assert client.post('/api/simulated-wearable-sync', headers=member_headers).status_code == 201
    standings = client.get(f'{path}/leaderboard').get_json()['standings']
    assert standings[0]['score'] == 0
    assert set(standings[0]) == {'participant', 'score'}
    assert client.delete(f'{path}/participation', headers=member_headers).status_code == 200
    assert client.get(f'{path}/leaderboard').get_json()['standings'] == []


def test_business_analytics_suppresses_groups_below_five_and_allows_withdrawal():
    client = app.test_client()
    _, business = register(client, 'business')
    owner = {'Authorization': f"Bearer {business['token']}"}
    cohort = client.post('/api/business/cohort', headers=owner).get_json()['cohort']
    members = []
    for index in range(5):
        _, account = register(client)
        headers = {'Authorization': f"Bearer {account['token']}"}
        members.append(headers)
        assert client.post(f"/api/cohorts/{cohort['id']}/participation", headers=headers, json={'consent': True}).status_code == 200
        assert client.post('/api/log-metrics', headers=headers, json={
            'sleep': 7, 'heartRate': 70, 'steps': 6000 + index * 100, 'fatigue': 4,
        }).status_code == 200
        if index == 3:
            assert client.get('/api/business/analytics', headers=owner).get_json()['metrics']['steps'] is None
    result = client.get('/api/business/analytics', headers=owner).get_json()
    assert result['metrics']['steps']['contributors'] == 5
    assert result['metrics']['steps']['average'] == 6200
    assert client.delete(f"/api/cohorts/{cohort['id']}/participation", headers=members[0]).status_code == 200
    assert client.get('/api/business/analytics', headers=owner).get_json()['metrics']['steps'] is None


def test_feedback_is_private_unless_user_opts_in():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    comment = str(uuid.uuid4())
    assert client.post('/api/feedback', headers=headers, json={'comment': comment, 'public': False}).status_code == 201
    assert all(item['comment'] != comment for item in client.get('/api/public-feedback').get_json()['feedback'])
    assert client.post('/api/feedback', headers=headers, json={'comment': comment, 'clarity': 5, 'public': True}).status_code == 201
    public = client.get('/api/public-feedback').get_json()['feedback']
    assert any(item['comment'] == comment and 'user_id' not in item for item in public)
    assert client.get('/api/feedback/public').get_json()['feedback'] == public


def test_registration_consent_and_activity_logs():
    client = app.test_client()
    payload = {'email': f'{uuid.uuid4()}@example.test', 'password': 'test-password', 'name': 'Test'}
    assert client.post('/api/register', json=payload).status_code == 400
    _, first = register(client)
    _, second = register(client)
    first_headers = {'Authorization': f"Bearer {first['token']}"}
    second_headers = {'Authorization': f"Bearer {second['token']}"}
    activity = {'title': 'Evening walk', 'date': date.today().isoformat(), 'duration': 20, 'notes': ''}
    response = client.post('/api/activities', json=activity, headers=first_headers)
    assert response.status_code == 201
    activity_id = response.get_json()['activities'][0]['id']
    assert client.get('/api/activities', headers=second_headers).get_json()['activities'] == []
    assert client.delete(f'/api/activities/{activity_id}', headers=second_headers).status_code == 404
    assert client.delete(f'/api/activities/{activity_id}', headers=first_headers).status_code == 200
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=first['user']['user_id']).one()
        assert db.query(Consent).filter_by(user_id=user.id, consent_type='pdpa_lifestyle_processing', is_granted=True).count() == 1
    finally:
        db.close()


def test_authenticated_checkin_completes_within_two_seconds():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    started = time.perf_counter()
    response = client.post('/api/log-metrics', headers=headers, json={
        'sleep': 7, 'heartRate': 70, 'steps': 8000, 'fatigue': 4,
    })
    assert response.status_code == 200
    assert time.perf_counter() - started <= 2.0


def test_products_catalog_respects_role_and_purchase_flow_is_isolated():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}

    # Registered member sees only non-premium-only products
    catalog = client.get('/api/products', headers=headers)
    assert catalog.status_code == 200
    products = catalog.get_json()['products']
    assert products
    assert all(not p['premium_only'] for p in products)
    assert all(p['currency'] == 'SGD' for p in products)
    assert all(isinstance(p['content'], dict) for p in products)

    # Purchase the first available product
    target = products[0]
    purchase = client.post(f"/api/products/{target['id']}/purchase", headers=headers)
    assert purchase.status_code == 201
    assert purchase.get_json()['purchase']['product_id'] == target['id']
    assert purchase.get_json()['purchase']['amount_cents'] == target['price_cents']

    # Duplicate purchase is rejected with 409
    duplicate = client.post(f"/api/products/{target['id']}/purchase", headers=headers)
    assert duplicate.status_code == 409

    # Purchases history lists the owned product with its content
    history = client.get('/api/purchases', headers=headers)
    assert history.status_code == 200
    purchases = history.get_json()['purchases']
    assert len(purchases) == 1
    assert purchases[0]['product']['id'] == target['id']
    assert purchases[0]['product']['title'] == target['title']
    assert purchases[0]['product']['content'] == target['content']

    # A second member cannot see the first member's purchases
    _, other = register(client)
    other_headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.get('/api/purchases', headers=other_headers).get_json()['purchases'] == []


def test_premium_only_products_require_premium_role():
    client = app.test_client()
    _, member = register(client)
    member_headers = {'Authorization': f"Bearer {member['token']}"}

    # First, purchase a premium subscription to become a premium user
    sub = client.post('/api/subscription', json={'action': 'start'}, headers=member_headers)
    assert sub.status_code == 200
    assert sub.get_json()['role'] == 'premium'
    assert client.get('/api/me', headers=member_headers).get_json()['user']['role'] == 'premium'

    premium_catalog = client.get('/api/products', headers=member_headers).get_json()['products']
    premium_only = [p for p in premium_catalog if p['premium_only']]
    assert premium_only, 'Expected premium-only products in seed catalog'

    # Premium member can buy a premium-only product
    ok = client.post(f"/api/products/{premium_only[0]['id']}/purchase", headers=member_headers)
    assert ok.status_code == 201

    # A registered member cannot buy a premium-only product
    _, registered_member = register(client)
    reg_headers = {'Authorization': f"Bearer {registered_member['token']}"}
    blocked = client.post(f"/api/products/{premium_only[0]['id']}/purchase", headers=reg_headers)
    assert blocked.status_code == 403
