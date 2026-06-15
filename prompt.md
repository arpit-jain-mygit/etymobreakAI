# EtymoBreak AI - Rebuild Prompt

Build a mobile-friendly web app called **EtymoBreak AI**.

## Goal
Create a root-centric English word learning app where users can:
- browse words from an inventory
- search root words with autocomplete
- mark roots as Confident or Needs Focus
- take a Revision Quiz based on saved word state
- review quiz history

## Stack
- Frontend: Angular SPA
- Backend API: FastAPI
- Hosting: Vercel for frontend, Render for API
- Profile storage: Postgres
- Quiz/state/history storage: GCP bucket
- Broker: small Cloud Run service that writes to GCS

## Core data
Use these files as source of truth:
- `aaptprep_root_centric_final.json`
- `aaptprep_root_mastery_question_bank.json`

The question bank metadata includes a `root` field. Use that root for state tracking and revision quiz logic.

## Main tabs
1. All Words
2. Root/Suffix Words
3. Play Quiz
4. History

Also keep a user profile dropdown in the top-right.

## Auth and profile
- Google sign-in
- If no profile exists, force profile creation with:
  - first name
  - last name
  - country
- Store profile in Postgres
- Show a loading state while profile is being loaded

## All Words
- Show inventory items as compact cards
- Search autocomplete must:
  - use inventory only
  - search root words only
  - match prefix only
  - show suggestions only after typing
- Search results must use the same card style as the main list

## Root/Suffix Words
- Show only root/prefix/suffix-related entries
- Keep this separate from All Words

## Marking state
Users can mark a root as:
- Confident
- Needs Focus

Rules:
- mutually exclusive
- initially show both buttons
- after one is selected, convert it to a label and hide the other
- same root should always show the same state everywhere
- persist per user in GCP bucket storage

## Revision Quiz
Only keep **Revision Quiz**.

Quiz generation rules:
- 80% Confident
- 10% Needs Focus
- 10% New / unseen words
- do not hard cap at 50 questions
- generate as many questions as the available data supports
- if no saved words exist, fall back gracefully to inventory

Quiz UX:
- centered flash-card style
- one question card at a time
- skip button
- save current answer locally button
- submit button at the far right and visually emphasized
- after submission show correct, wrong, skipped, and selected answer details

If a quiz is left unsubmitted, ask for confirmation before discarding it.
After submit, next time Quiz should show only a New Quiz button.

## History
- Add a History tab
- Use the same standard card style as the main word cards
- Clicking an item opens full review
- Add filters for Correct, Wrong, Skipped

## Storage
- Postgres: profiles only
- GCP bucket: quiz attempts, word state, history, and other transactional data
- Use a per-user folder in the bucket
- Use a single bucket env var everywhere: `GCP_ETYMOBREAK_BUCKET`

## Broker
Implement a small Cloud Run broker that:
- writes quiz attempts to GCS
- writes saved word state to GCS
- uses a service account
- can be called from the FastAPI backend

## Design
Keep the UI:
- light
- calm
- compact
- modern
- GenZ-friendly
- card-based, but not overly spacious

## Important constraints
- Do not reintroduce pronunciation
- Do not reintroduce old quiz types
- Do not use assembled words as the main browsing mode
- Render missing data gracefully
- Keep search/autocomplete clean and root-only

