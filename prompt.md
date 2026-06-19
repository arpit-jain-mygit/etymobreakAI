# EtymoBreak AI - Maintenance & Development Prompt

## Project Overview

**EtymoBreak** is a vocabulary learning platform built on the Norman Lewis word root strategy. Students take quizzes on words broken down by roots (prefixes/suffixes), practice with confident/needs-focus word lists, and receive detailed feedback on wrong answers.

**Purpose**: Help students master English vocabulary through root-centric etymology learning with interactive quizzes and adaptive practice.

---

## Tech Stack

### Frontend
- **Framework**: Angular 19 (standalone components, no NgModules)
- **State Management**: Angular signals (signal(), computed()) - NOT RxJS
- **Styling**: SCSS (compiled to CSS, budget: 31kB max)
- **Language**: TypeScript
- **Build**: Angular CLI (ng build, ng serve)

### Backend
- **Framework**: Python (Flask or similar)
- **Database**: PostgreSQL
- **ORM/Query**: psycopg3 with dict_row factory for automatic JSON parsing
- **Authentication**: Google OAuth 2.0
- **Storage**: GCS bucket (legacy, being phased out)
- **Deployment**: Render (backend service)

### Infrastructure
- **Frontend**: Likely Vercel/Netlify (or similar)
- **Database**: Managed PostgreSQL
- **CI/CD**: GitHub Actions with CloudBuild

---

## Key Architecture Decisions

### 1. Quiz Bank Strategy
- **Single JSON file**: `/public/aaptprep_quiz_master_norman_level5.json` (11,934 questions)
- **Structure**: Array of questions with metadata, options (id/text/feedback), answer key, parentRoot
- **Pattern Distribution**: 8 equal-weighted patterns (word_to_meaning, meaning_to_word, fill_blank, root_recognition, usage, synonym, word_family, root_inference)
- **Root-Centric Philosophy**: Every question linked to a parent root via `parentRoot` field
- **Feedback in Quiz Bank**: Each option has feedback object with `correct`, `message`, `whyCorrect`/`whyWrong`

### 2. Quiz Scoring System
- **Correct answer**: +3 points
- **Wrong answer**: -1 point
- **Skipped**: 0 points

### 3. Quiz Selection Algorithm
- **Mixed quiz**: Random selection across all patterns with equal weightage
- **Confident/Focus quiz**: Filtered by user's marked words, then same selection logic
- **Constraint**: Max one question per root (actualTarget = min(requestedTarget, numberOfRoots))

### 4. Data Persistence
- **Quiz History**: Saved to PostgreSQL `quiz_history` table with full attempt data
- **Confident/Needs-Focus Words**: Stored in PostgreSQL with Google identity linking
- **Draft Quizzes**: LocalStorage (disabled) - quizzes now save only on "Submit Quiz"
- **Option Feedback**: Loaded dynamically from quiz bank JSON when displaying history (NOT stored in DB)

### 5. Signal-Based Reactivity
- **No RxJS observables** — use Angular signals exclusively
- **Computed signals** track derived state (quiz counts, filter results, etc.)
- **Signal updates**: `signal.set(value)` or `signal.update(fn)`
- **Example**: `quizQuestions = signal<QuizQuestion[]>([])` → update with `this.quizQuestions.set(newQuestions)`

### 6. Quiz Flow Stages
- `setup`: Select quiz type/difficulty
- `taking`: Answer questions (timer runs)
- `summary`: Review submitted quiz with feedback
- `history`: Browse past quiz attempts

---

## Recent Features & Implementations

### Quiz History Download
- **Format**: Human-readable text file
- **Includes**: Summary stats, all questions, your answers, correct answers, and feedback explanations (for wrong answers only)
- **Filtered**: Download respects current filter (All/Correct/Wrong)

### Option Feedback System
- **Display**: "Why Each Option Matters" accordion (collapsed by default)
- **Content**: Explanation for each option (why correct or why wrong)
- **Scope**: Shows only on wrong answers, both in quiz summary and history review
- **Source**: Loaded from quiz bank JSON, not from database

### Accordion UI Component
- State tracked via `expandedFeedbackQuestions` signal
- Toggle via `toggleFeedbackAccordion(questionId)` method
- Icons: ▶ (collapsed) / ▼ (expanded)
- CSS styling with hover/focus states

### Quiz History UI
- **Question Cards**: Prominent 2px colored borders (green/red/orange for correct/wrong/skipped)
- **Filters**: All/Correct/Wrong/Skipped (with live counts)
- **Metadata**: Displays root word, quiz type, difficulty, score, time spent
- **Actions**: Mark Confident/Needs Focus buttons on each question

### Confident & Needs-Focus Words
- Students mark words from history or during quiz setup
- Stored in PostgreSQL linked to Google identity
- Used to filter quizzes (choose confident/focus/mixed)
- CSV download support for each category

---

## Important Constraints & Gotchas

### 1. PostgreSQL Column Naming
- ⚠️ **Unquoted aliases are lowercased** by PostgreSQL
- **Fix**: Use double quotes in SQL: `as "playerName"` not `as player_name`
- Applied to: quiz_history queries, user profile queries

### 2. JSON Handling in Database
- psycopg3 with dict_row **auto-parses JSON** into dicts
- If code expects strings, add type check: `isinstance(data, str) or isinstance(data, dict)`
- Applied to: attempt_data, question storage

### 3. CSS Budget (31kB max)
- Angular build fails if component CSS > 31kB
- **Solution**: Minimize gradients/shadows, use simple colors and borders
- Updated in `angular.json` → `budgets[].maximumError`

### 4. Quiz Bank Loading
- Currently loads only `mixed` type (can add more)
- File must be in `/public/` for static serving
- Loaded once on app startup, cached in `quizBankCache` Map
- If changing quiz bank: update fileMap path in `loadQuizBank()`

### 5. Google Sign-In
- ⚠️ Multiple calls to `google.accounts.id.initialize()` cause console warnings
- **Fix**: Guard with `googleInitialized` flag, reset on logout
- Only one initialization per app session

### 6. Timer Issues
- Timer should NOT auto-advance to next question (removed setTimeout)
- Students use arrow buttons (left/right) to navigate
- Quiz timeout is 25 minutes (hardcoded, consider making configurable)

---

## File Structure & Key Files

### Frontend (`/src/app/`)
- **app.ts**: Main component with all logic (3700+ lines, consider splitting)
  - `submitQuizAttempt()`: Lines 1734-1870 - saves quiz to backend
  - `loadQuizHistoryFromServer()`: Lines 3734-3833 - fetches quiz history
  - `normalizeQuizQuestion()`: Lines 3036-3100 - transforms quiz bank questions
  - `extractFeedbackFromQuizBank()`: Lines 3103-3150 - lookup feedback from quiz bank
  - `loadQuizBank()`: Lines 2950-3080 - loads and caches quiz bank JSON
  - `buildQuizDeck()`: Lines 3160-3350 - implements equal-weightage selection
  - `toggleFeedbackAccordion()`: Toggle accordion state for feedback sections
  
- **app.html**: Template (1520+ lines)
  - Lines 167-275: Tab navigation UI
  - Lines 351-550: Quiz history view with accordion feedback
  - Lines 1000-1300: Quiz taking flow
  - Lines 1460-1520: Quiz summary view with accordion feedback
  - Accordion pattern: Button with toggle icon + conditional content display

- **app.scss**: Styles (1300+ lines, 30.09kB)
  - Lines 247-280: Accordion header styling (feedback-accordion-header, accordion-icon)
  - Lines 256-330: Option feedback styling (accordions, color coding)
  - Lines 1190-1202: History question card styling (prominent borders)

### Quiz Bank
- **Source**: `/public/aaptprep_quiz_master_norman_level5.json`
- **Size**: 11,934 questions, ~15MB
- **Structure**: Root → Questions (8 patterns each)
- **Key Fields**: question, options (with feedback), answer, parentRoot, metadata, explanation

### Backend (`/backend/`)
- **profile_store.py**: Database operations
  - `list_quiz_history_by_google_identity()`: Lines 803-858 - fetch quiz history
  - `save_quiz_attempt()`: Lines 700-800 - insert quiz into DB
  - `_cache_confident_word_to_db()`: Lines 168-218 - save confident words
  - `_cache_needs_focus_word_to_db()`: Lines 220-270 - save focus words
  
- **main.py** (or similar): Flask endpoints
  - POST `/quiz-history`: Save completed quiz
  - GET `/quiz-history?sub=X&email=Y`: Fetch user's quiz history
  - GET `/profile`: Get user profile
  - POST `/confident-words`, `/needs-focus-words`: Save word lists

### Database Schema
```sql
quiz_history TABLE:
- id (UUID)
- google_sub (user ID)
- email
- quiz_scope (mixed/confident/focus)
- quiz_type (mixed/confident/focus)
- difficulty (1-5)
- question_count (int)
- correct_count, wrong_count (int)
- marks (int, can be negative)
- percentage (int)
- attempt_data (JSON: {questions: [...]})
- time_spent_seconds (int)
- created_at (timestamp)

confident_words, needs_focus_words TABLES:
- Similar structure, linked to google_sub
```

---

## How to Run Locally

### Frontend
```bash
cd /tmp/etymoBreakAI
npm install
ng serve
# Open http://localhost:4200
```

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs on http://localhost:8000 (or configured port)
```

### Build for Production
```bash
npm run build
# Output in /dist
```

---

## Type Definitions (Key Interfaces)

```typescript
// Quiz-related
interface QuizQuestion {
  id: string;
  type: 'meaning' | 'root' | 'family' | 'literal';
  prompt: string;
  options: string[];
  optionFeedbacks?: OptionFeedback[];
  correctIndex: number;
  selectedIndex: number | null;
  sourceTitle: string;
  sourceRoot: string;
  explanation: string;
}

interface QuizAttemptQuestion extends QuizQuestion {
  submitted: boolean;
  isCorrect: boolean | null;
  selectedText: string;
  correctText: string;
  skipped: boolean;
}

interface OptionFeedback {
  optionText: string;
  isCorrect: boolean;
  message: string;
}

// Quiz history
interface QuizHistoryEntry {
  id: string;
  playerName: string;
  playerEmail: string;
  quizType: string;
  quizScope: string;
  marks: number;
  percentage: number;
  questionCount: number;
  correct: number;
  wrong: number;
  questions: QuizAttemptQuestion[];
  timeSpentSeconds: number;
  difficulty: number;
  timeLimitMinutes: number;
  time: string; // ISO date
}

// User profile
interface StoredProfile {
  id: string;
  google: {
    sub: string;
    email: string;
    name: string;
  };
  firstName: string;
  lastName: string;
  country: string;
}
```

---

## Common Tasks

### Add a New Feature
1. **State**: Add `signal()` if needed in app.ts
2. **Logic**: Add method (e.g., `protectedNewMethod()`)
3. **Template**: Update HTML if UI needed
4. **Styles**: Add SCSS if needed (watch budget)
5. **Test**: Use dev server with `ng serve`
6. **Commit**: `git add -A && git commit -m "..."`

### Modify Quiz Bank
1. Update JSON file at `/public/aaptprep_quiz_master_norman_level5.json`
2. Ensure every question has:
   - `question` (prompt text)
   - `options[].id`, `options[].text`, `options[].feedback`
   - `answer` (option id)
   - `parentRoot` (for root-centric philosophy)
   - `metadata.pattern` (one of 8 patterns)
3. Rebuild: `npm run build`
4. Test quiz selection works

### Fix a Bug
1. Check `loadQuizHistoryFromServer()` for DB data issues
2. Check `normalizeQuizQuestion()` for data transformation issues
3. Check `extractFeedbackFromQuizBank()` for feedback lookup issues
4. Use Chrome DevTools → Network tab to inspect API responses
5. Use `console.log()` in TypeScript to debug

### Change Quiz Timeout
- Currently hardcoded: `25 * 60` (seconds) in multiple places
- Files: app.ts (lines 337, 1806, 1812)
- Consider: Add to quiz type select or config

---

## Testing Approach

### Manual Testing
1. **Auth Flow**: Login with Google → profile loads
2. **Quiz Taking**: Select quiz → answer questions → submit → verify history saved
3. **Quiz History**: Go to History tab → verify scores/times display correctly
4. **Download**: Download quiz history → verify feedback included and formatted
5. **Feedback**: Submit wrong answer → verify feedback shows in summary AND history
6. **Accordion**: Click "Why Each Option Matters" title → verify expands/collapses

### Edge Cases
- **Empty quiz bank**: Ensure graceful fallback
- **Network error**: Verify error message displayed
- **Old quiz history**: Verify feedback loads from current quiz bank (not DB)
- **Very long feedback**: Verify text wraps correctly
- **Mobile view**: Test on small screens (responsive design)

---

## Deployment Notes

### Frontend
- Deploy `/dist` folder to Vercel/Netlify
- Ensure `quiz-history` API endpoint is configured (backend URL in `getApiBaseUrl()`)
- Environment: `BACKEND_URL` or similar

### Backend
- Deploy to Render/Heroku/similar
- Set env vars: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Ensure PostgreSQL is accessible
- Run migrations if schema changes

### Database
- Managed PostgreSQL (AWS RDS, Neon, Render Postgres)
- Ensure SSL connections enabled
- Backup quiz_history and word lists regularly

---

## Known Issues & TODO

### ✅ Recently Completed
- Quiz history download with feedback
- Feedback accordion (collapsible)
- Prominent borders on history questions
- Equal-weightage pattern selection
- Root-centric quiz filtering
- Option feedback display in quiz history and summary
- Feedback loading from quiz bank (not DB)

### 🟡 In Progress / Considerations
- Profile dropdown enhancements (statistics, theme toggle, help section)
- Performance optimization (app.ts is 3700+ lines, consider splitting into services)
- CSS budget management (already at 30.09kB, limited room for new styles)
- Quiz bank optimization (11,934 questions, consider lazy-loading or pagination)

### ❌ Not Started / Backlog
- Root mastery quiz type (separate mode)
- Learning analytics dashboard
- Spaced repetition algorithm
- Mobile app (React Native)
- Offline support (Service Worker)
- Advanced word search/filtering
- Theme customization (dark mode)
- Keyboard shortcuts for quiz navigation
- Accessibility improvements (ARIA labels, keyboard nav)

---

## Useful Commands

```bash
# Development
ng serve                          # Start dev server
ng serve --open                   # Start and open browser

# Build
npm run build                     # Production build
npm run build -- --configuration development   # Dev build

# Linting & Type Checking
ng lint                           # ESLint (if configured)
npx tsc --noEmit                  # TypeScript check only

# Clean
rm -rf node_modules dist dist/*   # Full clean
npm install                       # Reinstall

# Git
git log --oneline -10             # Recent commits
git diff origin/main              # See unpushed changes
git push origin [branch]          # Push to GitHub

# Database (if local)
psql -U user -d etymobreak_db     # Connect to DB
\dt                               # List tables
SELECT * FROM quiz_history LIMIT 1; # Query
```

---

## Communication Tips

- **Ask for clarification** on conflicting requirements
- **Use Git commits** to document changes (clear commit messages)
- **Test manually** before pushing (ng serve works, no TypeScript errors)
- **Keep commit history clean** (one feature per commit when possible)
- **Document architectural decisions** in code comments (only when non-obvious)
- **Check console** for errors (use Chrome DevTools F12)
- **Verify API responses** in Network tab before assuming frontend bug

---

## Contact & Context

- **Original Developer**: Arpit Jain (apoorv20.jain@gmail.com)
- **Repository**: https://github.com/arpit-jain-mygit/etymobreakAI
- **Current Status**: Active development, stable quiz/history features
- **Last Updated**: June 19, 2026

---

## Quick Start for New Developer

1. Clone repo: `git clone https://github.com/arpit-jain-mygit/etymobreakAI.git`
2. Install deps: `npm install`
3. Start dev: `ng serve --open`
4. Review `/prompt.md` (this file) for architecture
5. Test: Submit a quiz → check history → download → verify feedback
6. Make changes → test → commit → push

This prompt should be comprehensive enough for another AI tool (Claude, ChatGPT, etc.) to understand the codebase and continue maintenance/development.
