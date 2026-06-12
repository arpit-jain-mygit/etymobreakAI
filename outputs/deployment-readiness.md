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
- `BROKER_URL`
- `BROKER_SHARED_SECRET`

### Backend Checklist
1. Create or import the `etymobreak-ai-api` service on Render.
2. Attach the Render Postgres database to the service.
3. Use the **internal database URL** for `DATABASE_URL` inside Render.
4. Add `GOOGLE_CLIENT_ID` in the Render service environment.
5. Add `MISTRAL_API_KEY` in the Render service environment.
6. Keep `MISTRAL_MODEL` set to `mistral-small-latest` unless you intentionally change models.
7. Add the GCS bucket environment variables listed below.
8. Deploy the service.
9. Verify `GET /health` returns `{"status":"ok"}`.
10. Verify `GET /config` returns a non-empty `googleClientId`.
11. Verify `POST /profile` can create a profile and persist it in Postgres.
12. Verify `POST /quiz-history` forwards the full quiz attempt JSON to the broker and returns a bucket path.
13. Verify `GET /quiz-history` reads the signed-in user’s prior attempts from the broker-backed bucket.

### Postgres Checklist
- The backend now stores only `profiles` in Postgres.
- Quiz attempts are no longer persisted in Postgres.
- The backend can create the `profiles` table automatically on startup.
- You can also create it manually with the SQL stored in `outputs/postgres-schema.md`.

### GCS Quiz Storage Checklist
- Create a bucket for quiz attempts, for example `etymobreak-ai-quizzes`.
- Deploy the broker to Cloud Run with a service account attached to the service.
- Give that service account `Storage Object Admin` on the bucket, or at minimum `Storage Object Creator` plus `Storage Object Viewer`.
- Set `GCP_QUIZ_BUCKET` on the Cloud Run broker service to that bucket name.
- Set `BROKER_SHARED_SECRET` on the Cloud Run broker and mirror the same secret in the Render backend service.
- The broker stores attempts under `users/{google_sub}/quiz-attempts/YYYY/MM/DD/quiz-<attempt-id>.json`.
- Use a user-level folder keyed by the Google subject ID so each signed-in user stays isolated.

### Cloud Run Broker Checklist
1. Open Google Cloud Console and go to the `etymobreak-ai` project.
2. Open Cloud Shell from the console header. Cloud Shell already has `gcloud` installed and authenticated for the current Google account.
3. Clone the repository in Cloud Shell if the code is not already there:

```bash
git clone https://github.com/arpit-jain-mygit/etymobreakAI.git
cd etymobreakAI
git checkout codex-cloud-run-broker
```

4. Create the broker service account:

```bash
gcloud iam service-accounts create etymobreak-ai-broker \
  --display-name="EtymoBreak AI Broker"
```

5. Grant the deployer account permission to attach that service account:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  etymobreak-ai-broker@etymobreak-ai.iam.gserviceaccount.com \
  --member="user:sachin.arpit.gcp.may2026@gmail.com" \
  --role="roles/iam.serviceAccountUser"
```

6. Create or choose the GCS bucket for quiz attempts, for example `etymobreak-ai-quizzes`.
7. Grant bucket access to the broker service account:

```bash
gcloud storage buckets add-iam-policy-binding gs://etymobreak-ai-quizzes \
  --member="serviceAccount:etymobreak-ai-broker@etymobreak-ai.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

8. Deploy the broker from the `broker/` folder. Cloud Run will use the `broker/Dockerfile` for a deterministic build:

```bash
gcloud run deploy etymobreak-ai-quiz-broker \
  --source ./broker \
  --region asia-south1 \
  --service-account etymobreak-ai-broker@etymobreak-ai.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars GCP_QUIZ_BUCKET=etymobreak-ai-quizzes,BROKER_SHARED_SECRET=replace-with-a-long-random-secret
```

9. Copy the Cloud Run service URL into `BROKER_URL` on the Render backend service.
10. Put the same secret into `BROKER_SHARED_SECRET` on Render.
11. Confirm the broker accepts `POST /quiz-history` and `GET /quiz-history`.

### Render Backend Broker Wiring
1. Add `BROKER_URL` to the Render backend service.
2. Add `BROKER_SHARED_SECRET` to the Render backend service.
3. Keep `DATABASE_URL` pointed at Render Postgres for profiles only.
4. Keep quiz attempts out of Postgres.

### Example Cloud Run Deploy Command
Use the command below after signing in with the Google Cloud CLI and selecting the right project:

```bash
gcloud run deploy etymobreak-ai-quiz-broker \
  --source broker \
  --region asia-south1 \
  --service-account etymobreak-ai-broker@etymobreak-ai.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars GCP_QUIZ_BUCKET=etymobreak-ai-quizzes,BROKER_SHARED_SECRET=replace-with-a-long-random-secret
```

Notes:
- Cloud Run uses the attached service account through Application Default Credentials, so no JSON key file is needed.
- Give the broker service account `Storage Object Admin` on the quiz bucket, or at minimum `Storage Object Creator` plus `Storage Object Viewer`.
- Keep the broker service public only if you are protecting it with the shared secret header from the Render backend.
- If a buildpacks deploy fails, keep the Dockerfile path and redeploy from the same command above.

### Render CLI Option
If you want to create the table manually from your terminal, use the Render CLI and run the SQL against your database.

1. Sign in to Render:

```bash
render login
```

2. Open a SQL session or run the create-table statement directly against your Render Postgres database:

```bash
render psql <your-postgres-database-name-or-id> -c "CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL, country TEXT NOT NULL, google_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"
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
- Keep GCS credentials private and sourced from Render environment variables.
- Keep Google credentials and Mistral credentials in environment variables, not in source control.
