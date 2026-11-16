# MySQL setup

This is a fresh-database setup. Existing SQLite accounts and logs are not
copied or deleted.

1. Install MySQL 8 and the dependencies in `backend/requirements.txt`.
2. With an administrative account, apply `schema.sql` once to a **new**
   database. It creates and selects `healthy360_db`; do not run it against an
   existing database. For example, from PowerShell in this directory:

   ```powershell
   Get-Content -Raw .\schema.sql | mysql --user=root --password
   ```

3. Configure a separate, least-privilege application account with access to
   `healthy360_db`, then set `DATABASE_URL` in the shell that starts Flask:

   ```powershell
   $env:DATABASE_URL = 'mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/healthy360_db?charset=utf8mb4'
   ```

   Replace the placeholders locally. URL-encode special characters in the
   username and password. Never commit credentials.
4. Set `JWT_SECRET_KEY` to a private, persistent random secret of at least
   32 bytes before starting Flask. For local development, generate one with
   `$env:JWT_SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(48))"`
   in the same PowerShell session as `DATABASE_URL`. For persistent sessions,
   securely store and reuse the generated secret rather than generating a new
   one on every start. Keep it out of source control; changing it invalidates
   existing sessions.
5. From `backend`, run `python app.py`. The application does not create or
   migrate MySQL tables automatically. Apply schema changes separately.

## Existing MySQL database

If the database was created using the earlier version of `schema.sql`, back it
up and apply `migration_member_baselines.sql` **once** with the correct database
selected before starting the updated backend. Do not apply that migration to a
fresh database created from the current `schema.sql`, or apply it twice.
For example, from PowerShell in this directory:

```powershell
Get-Content -Raw .\migration_member_baselines.sql | mysql --user=YOUR_USER --password healthy360_db
```

The migration adds baseline, session, simulation, consent, recommendation and
leaderboard fields and tables for session revocation, activity logs,
reservations and in-app event notifications.
Existing sign-in tokens are invalidated. Review the SQL and verify your target
database and backup before applying it. The application does not apply the
migration automatically.

## Feature limits and privacy

- Members and businesses can register. Admin screens and sign-in are excluded.
- Premium subscriptions are **manual tests**: no payment or automatic renewal
  occurs. Cancellation retains access through the displayed end date.
- The wearable button imports labelled sample data; it does not connect to a
  device. Sample logs are excluded from challenges and cohort analytics.
- Simulated business password reset is disabled by default. For local
  development only, set `DEV_SIMULATED_RESET=1` before starting Flask. It
  displays a token instead of sending email and must never be enabled on a
  publicly reachable or production server.
- Business cohort analytics require member opt-in and suppress individual
  metrics below five contributors. This threshold does **not** by itself
  guarantee anonymity. Challenge scores are public under a random pseudonym
  only after a separate opt-in.
- Workout ideas support walking, cycling and yoga. Meal ideas support
  vegetarian and vegan preferences; other restrictions are rejected rather
  than assumed safe. Ideas are not medical or professional advice. Approved
  articles are shown only if records exist; approval alone does not establish
  expert review.
- Event times are entered and shown as local, timezone-free values. Event
  changes and cancellations appear as in-app notifications, not emails.
- Public feedback is opt-in and unmoderated. Users should not include personal
  information. Feedback and Done/Skipped selections submitted from the
  dashboard are linked to the saved recommendation.

For isolated tests, run `python -m pytest` from `backend`. Without
`DATABASE_URL`, tests use an in-memory SQLite database. To test against MySQL,
set `DATABASE_URL` to a dedicated database initialized with the schema first;
tests create accounts and logs there.

The pseudonym token separates health rows from account identifiers, but it is
still linkable through the profile table. Access control and operational
privacy measures are required; the schema alone does not ensure compliance.
