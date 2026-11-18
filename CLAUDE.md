# Claude Code Project Instructions: CSIT-26-S4-03 (Healthy360)

## 1. Language & Output Rules
- **Strict English Output:** Always think, plan, and respond strictly in **English**. Never output Chinese or any non-English text, even if an upstream API proxy switches models mid-session.
- **No Conversational Preamble in Commit Output:** When generating a commit message, output **only** the formatted commit text itself—never include introductory sentences (e.g., *"I'll inspect the staged diff..."*) that could be pasted into Git.

---                                                                                                                               

## 2. Mandatory `plan.txt` Tracking & Pre-Task Checklist Gate

1. **Before Any Task (Read & Verify Gate):**
   - Before writing code, modifying files, or proposing architectural changes, **always read `@plan.txt` first**.
   - Check the current active phase, the `- [ ]` task checklist, and `## Immediate Next Steps` to confirm the requested work aligns with the active sprint scope and does not duplicate completed (`- [x]`) work.
   - Start your response with a brief 2-line status check citing the active phase and target checklist item from `plan.txt`.

2. **Whenever Completed or Adjusted (Write & Sync Gate):**
   - Whenever you complete a task, finish a phase, change test counts, or adjust scope or architecture, **you must update `plan.txt` in the same session** before concluding:
     - Change completed checklist items from `- [ ]` to `- [x]`.
     - When all items in a phase are `- [x]`, update the phase header status from `*(Next Active Phase)*` or `*(In Progress)*` to `*(Completed)*` and promote the next phase to `*(Next Active Phase)*`.
     - Update `## Immediate Next Steps` so it always reflects the next uncompleted (`- [ ]`) actions and exact passing test count.
     - If scope, endpoints, or deadlines change, update the affected bullets in `plan.txt` directly rather than leaving stale notes.
   - Never mark a task as finished without confirming `plan.txt` has been saved with the updated checklist state.

---

## 3. Project Context, Tech Stack & Hard Guardrails
- **Project Scope:** Explainable AI Platform for Health and Lifestyle Recommendations (`CSIT-26-S4-03` / `Healthy360`).
- **Tech Stack:**
  - **Backend:** Python 3.9+, Flask, Flask-CORS, SQLAlchemy, PyJWT, MySQL 8 (with SQLite fallback for isolated `pytest` runs).
  - **ML & XAI:** XGBoost (`XGBClassifier`), Scikit-Learn, SHAP (`TreeExplainer`), deterministic template rationales, counterfactual "What-If" recourse search, Pandas, NumPy, `fairlearn` (Phase 5).
  - **Frontend & Mobile:** React.js (Vite), `react-router-dom`, custom CSS (`App.css`), Capacitor Android wrapper (`com.csit26.healthy360`).
  - **Deployment:** Podman Compose (`podman-compose.yml` in Phase 5).
- **Network Ports & Cross-Platform Routing:**
  - Flask backend binds to `0.0.0.0:5000` (`http://localhost:5000` for web; `http://10.0.2.2:5000` for Android emulator) and allowlists `localhost` and `capacitor://` origins in CORS.
  - React Vite dev server runs on `http://localhost:5173`.
- **Non-Negotiable System Guardrails:**
  - **Strict Non-Clinical Scope:** Only recommend non-clinical lifestyle modifications (sleep hygiene, active recovery, hydration, activity pacing). Never generate medical diagnoses, clinical evaluations, or prescription advice.
  - **Singapore PDPA & Privacy Compliance:** Isolate user account identities from biometric feature vectors using pseudonymized IDs; require explicit PDPA opt-in consent timestamps; enforce backend $k$-anonymity suppression ($\ge 5$ distinct opted-in contributors) for business cohort analytics; exclude simulated wearable sample logs from cohort and challenge metrics.
  - **Latency Ceiling:** End-to-end XGBoost inference, TreeSHAP attribution, and counterfactual search must complete in $\le 2.0$ seconds.

---

## 4. Repository Layout & Key Paths
```text
Healthy365/
├── backend/
│   ├── app.py                      # Flask REST API endpoints, RBAC, XAI & business/admin routes
│   ├── database.py                 # SQLAlchemy engine & working-dir-independent .env loader
│   ├── models.py                   # Relational ORM models
│   ├── auth.py                     # JWT authentication & role decorators
│   ├── requirements.txt            # Top-level Python dependencies
│   ├── database/
│   │   ├── schema.sql              # Master MySQL 8 schema (Phases 2–5)
│   │   ├── userstories.txt         # Consumer, business, and admin user story inventory
│   │   └── README.md               # Database setup & dev-reset documentation
│   ├── ml/
│   │   ├── generate_data.py        # Synthetic demographic & lifestyle dataset generator
│   │   └── train.py                # XGBClassifier training & artifact export
│   └── tests/
│       └── test_account_storage.py # Automated pytest suite (currently 38 passing tests)
├── frontend/
│   ├── src/
│   │   ├── components/             # Navbar, MetricForm, RecommendationCard, ShapBreakdown, WhatIfExplorer, ProtectedRoute
│   │   ├── context/AppContext.jsx  # Global auth & user state context
│   │   ├── pages/                  # HomePage, OnboardingPage, Dashboard, LoggingPage, ExplorerPage, PremiumPage, DevResetPage, LogInPage
│   │   ├── api.js                  # Centralized apiCall() helper & Android/Web base URL router
│   │   ├── App.jsx                 # Client router and layout container
│   │   └── App.css                 # Custom stylesheet with @media (max-width: 600px) mobile breakpoints
│   ├── android/                    # Capacitor Android native project
│   ├── capacitor.config.json       # Capacitor configuration (webDir: dist)
│   └── package.json
├── docs/
│   └── test-cases/                 # Test suites and execution logs (TC-<MODULE>-<ID>)
├── plan.txt                        # Live phase timeline, task checklist, and immediate next steps
├── CLAUDE.md                       # Claude Code instructions (this file)
└── .github/
    └── copilot-instructions.md     # GitHub Copilot instructions