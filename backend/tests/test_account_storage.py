import uuid
import time
from datetime import date

import pytest

from app import app
from database import SessionLocal
from models import DailyLog, Feedback, User, UserProfile, SubscriptionPlan, UserSubscription, Consent


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


def test_member_baseline_persists_and_sample_sync_is_labeled():
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
    assert client.post('/api/simulated-wearable-sync', headers=headers).status_code == 201
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(user_id=registered['user']['user_id']).one()
        stored_profile = db.query(UserProfile).filter_by(user_id=user.id).one()
        log = db.query(DailyLog).filter_by(pseudonym_token=stored_profile.pseudonym_token).one()
        assert log.source == 'wearable_sync'
        assert log.is_simulated is True
        assert log.fatigue is None
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


def test_manual_subscription_cancel_and_renew_without_payment():
    client = app.test_client()
    _, member = register(client)
    headers = {'Authorization': f"Bearer {member['token']}"}
    db = SessionLocal()
    try:
        if not db.query(SubscriptionPlan).filter_by(tier_code='premium').first():
            db.add(SubscriptionPlan(tier_code='premium', plan_name='Test premium', price_monthly=0,
                                    currency='SGD', benefits_json=[], is_active=True))
            db.commit()
    finally:
        db.close()
    started = client.post('/api/subscription', json={'action': 'start'}, headers=headers)
    assert started.status_code == 200
    assert started.get_json()['mode'] == 'manual_test'
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == 'premium'
    cancelled = client.post('/api/subscription', json={'action': 'cancel'}, headers=headers)
    assert cancelled.get_json()['subscription']['status'] == 'cancelled'
    assert client.get('/api/me', headers=headers).get_json()['user']['role'] == 'premium'
    assert client.post('/api/subscription', json={'action': 'renew'}, headers=headers).get_json()['subscription']['status'] == 'active'
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
    assert client.post('/api/premium/plans', json={'type': 'meal'}, headers=headers).status_code == 400
    workout = client.post('/api/premium/plans', json={'type': 'workout'}, headers=headers)
    assert workout.status_code == 201
    assert workout.get_json()['plans'][0]['details']['minutes'] == 15
    prefs['dietary'] = ['vegan']
    client.put('/api/preferences', json=prefs, headers=headers)
    assert client.post('/api/premium/plans', json={'type': 'meal'}, headers=headers).status_code == 201
    assert client.get('/api/premium/articles', headers=headers).get_json()['articles'] == []


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
