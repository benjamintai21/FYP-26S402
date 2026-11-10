# GitHub Copilot Repository Instructions: CSIT-26-S4-03

## 1. Project Context & Architectural Standards
- **Project Scope:** Explainable AI Platform for Health and Lifestyle Recommendations (CSIT-26-S4-03).
- **Backend Stack:** Python 3.9+, Flask, Flask-CORS, Scikit-Learn, SHAP (TreeSHAP), MySQL. Counterfactuals via grid search (not dice-ml). Training data is synthetic.
- **Frontend Stack:** React.js (Vite), JavaScript ES Modules, custom CSS (`App.css`).
- **Network Ports:** Flask API runs on `http://localhost:5000`; React Vite client runs on `http://localhost:5173`.
- **System Boundaries & Guardrails:**
  - **Strict Non-Clinical Scope:** Only suggest lifestyle modifications (sleep hygiene, active recovery, hydration, activity pacing). Never generate medical diagnoses, clinical evaluations, or prescription guidance.
  - **Data Privacy (PDPA):** Isolate user identities from biometric metrics using pseudonymized IDs. Never mix user account credentials with health feature vectors.
  - **Performance Ceiling:** End-to-end model inference and SHAP attribution calculation must complete in $\le 2.0$ seconds.

---

## 2. Repository Layout & File Paths
```text
xai-health-platform/
├── backend/
│   ├── app.py                      # Flask REST API endpoints (/api/recommendation)
│   ├── requirements.txt            # Python dependencies (flask, shap, scikit-learn)
│   └── venv/                       # Python virtual environment (ignored)
├── frontend/
│   ├── src/
│   │   ├── components/             # React components:
│   │   │   ├── Navbar.jsx          # Navigation header
│   │   │   ├── MetricForm.jsx      # Daily check-in sliders (sleep, steps, HR, fatigue)
│   │   │   ├── RecommendationCard.jsx # Suggestion card & plain-English rationale
│   │   │   ├── ShapBreakdown.jsx   # Visual SHAP attribution horizontal bars
│   │   │   ├── WhatIfExplorer.jsx  # Counterfactual habit recourse simulator
│   │   │   └── ProtectedRoute.jsx  # Session gating wrapper
│   │   ├── context/
│   │   │   └── AppContext.jsx      # Global state & user session context
│   │   ├── pages/                  # Route views (HomePage, Dashboard, LogInPage, etc.)
│   │   ├── App.jsx                 # Client router and layout container
│   │   ├── App.css                 # Platform stylesheet
│   │   ├── main.jsx                # React virtual DOM entry point
│   │   ├── api.js                  # Asynchronous fetch client
│   │   └── constants.js            # Default baseline metrics
│   ├── package.json
│   └── vite.config.js
├── docs/
│   └── test-cases/                 # Test suites and execution sheets (TC-<MODULE>-<ID>)
├── .github/
│   ├── copilot-instructions.md     # This instruction file
│   └── pull_request_template.md    # PR structure
└── .gitignore                      # Root ignore file

##3. Code Generation & Styling Guidelines

    React Components:

        Every component using JSX elements must use the .jsx file extension.

        Use functional components with standard React hooks (useState, useEffect, useContext).

        Do not install heavy external CSS libraries (e.g., Tailwind, Bootstrap) unless instructed. Style elements using class names defined in frontend/src/App.css.

        Validate that component props match the backend JSON payload contract (recommendation, explanation, shap_factors, what_if).

    Python / Flask Backend:

        Implement robust defensive programming: always use .get() with safe median baseline fallbacks for incoming biometric inputs (sleep, heartRate, steps, fatigue) to prevent unhandled 500 runtime crashes.

        Ensure all API endpoints return standardized JSON structures with explicit HTTP status codes (200, 400, 404, 500) and CORS headers.

    Database & Schemas:

        Never write destructive migration queries (DROP TABLE) or modify production database configurations without explicit instructions.

##4. Git Commit Summary Generation Rules

Whenever asked to generate a commit message or summarize staged git changes, strictly output the text using this multi-section engineering structure (do not wrap the entire response in markdown backticks):

<Action/Scope> for <Ticket/Component/Test Case>, <verification/run context>. <Assertion: This is not a bug and not a regression OR Fixes regression>.

<1-2 sentences on root cause, technical context, or architectural reasoning citing exact paths/schemas.>

Changes

    <exact/relative/file/path>:

        <Indented bullet detailing preserved logic, step numbers, or regenerated artifacts>

    <exact/relative/file/path>:

<1 sentence explicitly stating what was intentionally left untouched/out of scope.>
🤖 Generated with GitHub Copilot
5. Branch Naming & Test Case Traceability

    Branch Naming Standard:

        Feature: feat/<MODULE>-<short-description> (e.g., feat/XAI-shap-bar-chart)

        Bugfix: fix/<MODULE>-<short-description> (e.g., fix/API-slider-payload-type)

        Testing: test/<MODULE>-<short-description> (e.g., test/TC-02-metric-validation)

    Test Case Identifier: Always reference test cases using the project schema TC-<MODULE>-<ID> (e.g., TC-AUTH-01, TC-RECOM-01, TC-XAI-01).