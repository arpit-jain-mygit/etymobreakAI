# EtymoBreak AI - Deployment Readiness

This file collects the current deployment steps for the frontend on Vercel and the backend on Render.

## 1. Frontend Deployment on Vercel

### Project
- Angular SPA in the repository root.
- Vercel serves the static build from `dist/browser`.

### Vercel Settings
- **Build Command:** `npm run build`
- **Output Directory:** `dist/browser`
- **Install Command:** use the default Vercel install flow, or `npm ci` if you want a locked install.

### Required Files
- `vercel.json` is already configured for the Angular build output.
- `src/index.html` already loads Google Identity Services.

### Frontend Checklist
1. Import the GitHub repository into Vercel.
2. Select the repository root as the project root.
3. Confirm the build command is `npm run build`.
4. Confirm the output directory is `dist/browser`.
5. Deploy the project.
6. After deployment, verify the home page loads and the Google sign-in button appears.

### Frontend Runtime Notes
- The Angular app calls the backend API at `https://etymobreak-ai-api.onrender.com` by default.
- If you ever need to override that URL, set `window.__ETYMOBREAK_API_BASE_URL__` before the app boots.
- The app is a single-page experience, so no extra route rewrites are required for the current tab-based UI.

## 2. Backend Deployment on Render

### Service
- FastAPI app in `backend/app.py`
- Start command: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`

### Render Service Settings
- **Environment:** Python
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`

### Required Environment Variables
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL` (current default: `mistral-small-latest`)
- `GOOGLE_CLIENT_ID`
- `DATABASE_URL`

### Backend Checklist
1. Create or import the `etymobreak-ai-api` service on Render.
2. Attach the Render Postgres database to the service.
3. Use the **internal database URL** for `DATABASE_URL` inside Render.
4. Add `GOOGLE_CLIENT_ID` in the Render service environment.
5. Add `MISTRAL_API_KEY` in the Render service environment.
6. Keep `MISTRAL_MODEL` set to `mistral-small-latest` unless you intentionally change models.
7. Deploy the service.
8. Verify `GET /health` returns `{"status":"ok"}`.
9. Verify `GET /config` returns a non-empty `googleClientId`.
10. Verify `POST /profile` can create a profile and persist it in Postgres.
11. Verify `POST /quiz-history` can save a completed quiz attempt.
12. Verify `GET /quiz-history` returns prior quiz attempts for the signed-in Google account.

### Postgres Checklist
- The backend currently uses two tables: `profiles` and `quiz_history`.
- The backend can create these tables automatically on startup.
- You can also create them manually with the SQL stored in `outputs/postgres-schema.md`.

### Render CLI Option
If you want to create the table manually from your terminal, use the Render CLI and run the SQL against your database.

1. Sign in to Render:

```bash
render login
```

2. Open a SQL session or run the create-table statement directly against your Render Postgres database:

```bash
render psql <your-postgres-database-name-or-id> -c "CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL, country TEXT NOT NULL, google_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quiz_history (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, google_sub TEXT NOT NULL, email TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, country TEXT NOT NULL, quiz_scope TEXT NOT NULL, correct_count INTEGER NOT NULL, wrong_count INTEGER NOT NULL, marks INTEGER NOT NULL, percentage INTEGER NOT NULL, total_possible INTEGER NOT NULL, attempt_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"
```

3. Confirm the table exists in Render Postgres after the command runs.

### SQL Used by the Backend

```sql
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    country TEXT NOT NULL,
    google_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_history (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    google_sub TEXT NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    country TEXT NOT NULL,
    quiz_scope TEXT NOT NULL,
    correct_count INTEGER NOT NULL,
    wrong_count INTEGER NOT NULL,
    marks INTEGER NOT NULL,
    percentage INTEGER NOT NULL,
    total_possible INTEGER NOT NULL,
    attempt_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## 3. Google Sign-In Setup

### Google Cloud Console
1. Create or select the Google OAuth client for the app.
2. Add the Vercel frontend domain as an authorized JavaScript origin.
3. Add `http://localhost:4200` as an authorized JavaScript origin for local Angular development.
4. Make sure the `GOOGLE_CLIENT_ID` value matches the client ID in Google Cloud.

### Important Note
- The current app uses Google Identity Services on the frontend, so the main setup requirement is the **authorized JavaScript origin**.
- If you later move to a redirect-based OAuth flow, you will also need redirect URIs. The current app does not need that for sign-in.

## 4. Deployment Validation

### What to Verify After Deploy
- Home page loads on Vercel.
- Google sign-in button appears on the home page only.
- After Google sign-in, the app shows the profile creation screen.
- Creating a profile stores data in Postgres.
- Returning with the same Google account loads the saved profile.
- Search, Experiment, and Quiz tabs still work after the auth gate.

### Quick Health Checks
- Frontend: page loads without console errors.
- Backend: `/health` returns OK.
- Backend: `/config` returns the Google client ID.
- Backend: `/profile` accepts and returns a saved profile.

## 5. Production Readiness Notes

- Keep the frontend and backend deployed separately.
- Keep the backend CORS policy open only if needed for current Vercel domains.
- Keep `DATABASE_URL` private and sourced from Render Postgres.
- Keep Google credentials and Mistral credentials in environment variables, not in source control.
