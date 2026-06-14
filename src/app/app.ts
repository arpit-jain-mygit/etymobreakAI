import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getApiBaseUrl } from './api-base';

interface AnalysisPart {
  index?: number;
  label: string;
  type: string;
  meaning: string;
  source?: string;
  otherExamples?: string[];
}

interface WordFamilyGroup {
  title: string;
  focus: string;
  words: Array<{
    word: string;
    meaning: string;
  }>;
}

interface RelatedWord {
  word: string;
  breakdown?: string;
  meaning: string;
  explanation?: string;
  exampleSentence?: string;
}

interface WordFamilyItem {
  word: string;
  meaning: string;
  breakdown?: AnalysisPart[];
  exampleSentence?: string;
}

interface FamilyMemoryItem {
  term: string;
  meaning: string;
  exampleSentence?: string;
}

interface FamilySection {
  label: string;
  title: string;
  items: FamilyMemoryItem[];
  tone: string;
}

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

interface StoredProfile {
  firstName: string;
  lastName: string;
  country: string;
  google: GoogleIdentity;
}

interface CreatedProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  country: string;
  google: GoogleIdentity;
  createdAt: string;
  updatedAt?: string;
}

interface QuizHistoryEntry {
  id: string;
  time: string;
  playerName: string;
  playerEmail: string;
  country: string;
  quizScope: string;
  correct: number;
  wrong: number;
  marks: number;
  percentage: number;
  total: number;
  quizType: string;
  difficulty: number;
  questionCount: number;
  timeLimitMinutes: number;
  timeSpentSeconds: number;
  questions: QuizAttemptQuestion[];
  bucketObjectName?: string;
  bucketUri?: string;
}

interface ConfidentWordEntry {
  id: string;
  time: string;
  query: string;
  mode: string;
  title: string;
  playerName: string;
  playerEmail: string;
  country: string;
  analysis: AnalysisResult;
  bucketObjectName?: string;
  bucketUri?: string;
}

type NeedsFocusWordEntry = ConfidentWordEntry;

interface QuizAttemptQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  sourceTitle: string;
  sourceQuery?: string;
  sourceMode?: string;
  options: string[];
  selectedIndex: number | null;
  selectedText: string;
  correctIndex: number;
  correctText: string;
  skipped: boolean;
  submitted: boolean;
  isCorrect: boolean | null;
}

type QuizBankType = 'word' | 'root_prefix_suffix' | 'mixed' | 'confident';
type QuizFlowStage = 'setup' | 'taking' | 'summary';
type QuizReviewFilter = 'all' | 'correct' | 'wrong' | 'skipped';

type BreakdownRow = AnalysisPart[];
type AppTab = 'search' | 'all_words' | 'root_suffix' | 'quiz';
type AuthStage = 'home' | 'loading' | 'profile' | 'app';
type QuizQuestionType = 'meaning' | 'root' | 'family' | 'literal';

interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  skipped: boolean;
  submitted: boolean;
  isCorrect: boolean | null;
  sourceTitle: string;
  explanation: string;
}

interface QuizBankOption {
  id: string;
  text: string;
}

interface QuizBankQuestion {
  id: string;
  bankType: QuizBankType;
  difficulty: number;
  level: number;
  questionType: string;
  question: string;
  options: QuizBankOption[];
  answer: string;
  answerText: string;
  metadata?: Record<string, unknown>;
}

interface QuizBankFile {
  metadata?: {
    bankName?: string;
    bankType?: QuizBankType;
    difficultyScale?: Record<string, string>;
    optionCount?: number;
  };
  questions: QuizBankQuestion[];
}

interface QuizSummaryQuestion extends QuizQuestion {
  userAnswer: string;
  userAnswerLabel: string;
  correctAnswerLabel: string;
  status: 'correct' | 'wrong' | 'skipped';
}

interface QuizDraftState {
  quizType: QuizBankType;
  quizDifficulty: number;
  quizQuestionTarget: number;
  quizIndex: number;
  quizTimeRemaining: number;
  quizFlowStage: QuizFlowStage;
  questions: QuizQuestion[];
  savedAt: string;
}

interface RootFamily {
  root: string;
  meaning: string;
  origin: string;
}

interface AnalysisResult {
  query: string;
  mode: string;
  title: string;
  summary: string;
  literalMeaningFormula: string;
  literalMeaningArrow: string;
  literalMeaning: string;
  actualMeaning: string;
  breakdown: AnalysisPart[];
  wordFamily: WordFamilyItem[];
  otherWords: WordFamilyGroup[];
  relatedWords: RelatedWord[];
  slideNumber: number | null;
  rootFamily: RootFamily;
  familyMemory: FamilyMemoryItem[];
  notes: string[];
}

const EMPTY_ANALYSIS: AnalysisResult = {
  query: '',
  mode: 'word',
  title: '',
  summary: '',
  literalMeaningFormula: '',
  literalMeaningArrow: '',
  literalMeaning: '',
  actualMeaning: '',
  breakdown: [],
  wordFamily: [],
  otherWords: [],
  relatedWords: [],
  slideNumber: null,
  rootFamily: {
    root: '',
    meaning: '',
    origin: '',
  },
  familyMemory: [],
  notes: [],
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, AfterViewInit {
  @ViewChild('googleButtonHost') private googleButtonHost?: ElementRef<HTMLDivElement>;

  protected readonly activeTab = signal<AppTab>('search');
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly rootAutocomplete = signal<string[]>([]);
  protected readonly autocompleteOpen = signal(false);
  protected readonly experimentLetter = signal('');
  protected readonly experimentIndex = signal(0);
  protected readonly quizFlowStage = signal<QuizFlowStage>('setup');
  protected readonly quizType = signal<QuizBankType>('word');
  protected readonly quizDifficulty = signal(1);
  protected readonly quizQuestionTarget = signal(50);
  protected readonly quizIndex = signal(0);
  protected readonly quizQuestions = signal<QuizQuestion[]>([]);
  protected readonly quizTimeRemaining = signal(25 * 60);
  protected readonly quizPreparing = signal(false);
  protected readonly quizNotice = signal('');
  protected readonly googleIdentity = signal<GoogleIdentity | null>(null);
  protected readonly profile = signal<StoredProfile | null>(null);
  protected readonly profileFirstName = signal('');
  protected readonly profileLastName = signal('');
  protected readonly profileCountry = signal('');
  protected readonly authMessage = signal('');
  protected readonly authError = signal('');
  protected readonly authGateLoading = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly profileMenuView = signal<'profile' | 'history'>('profile');
  protected readonly googleClientId = signal('');
  protected readonly googleButtonRendered = signal(false);
  protected readonly inventoryEntries = signal<unknown[]>([]);
  protected readonly quizHistory = signal<QuizHistoryEntry[]>([]);
  protected readonly confidentWords = signal<ConfidentWordEntry[]>([]);
  protected readonly needsFocusWords = signal<NeedsFocusWordEntry[]>([]);
  protected readonly quizHistoryLoading = signal(false);
  protected readonly quizHistorySubmitting = signal(false);
  protected readonly quizHistorySaved = signal(false);
  protected readonly quizHistoryError = signal('');
  protected readonly selectedQuizHistoryId = signal('');
  protected readonly quizReviewFilter = signal<QuizReviewFilter>('all');
  protected readonly confidentWordsLoading = signal(false);
  protected readonly confidentWordsSaving = signal(false);
  protected readonly confidentWordsError = signal('');
  protected readonly confidentWordNotice = signal('');
  protected readonly needsFocusWordsLoading = signal(false);
  protected readonly needsFocusWordsSaving = signal(false);
  protected readonly needsFocusWordsError = signal('');
  protected readonly needsFocusWordNotice = signal('');
  protected readonly quizTimeLabel = computed(() => {
    const remaining = Math.max(0, this.quizTimeRemaining());
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  protected readonly quizTypeLabel = computed(() => {
    switch (this.quizType()) {
      case 'root_prefix_suffix':
        return 'Root / Prefix / Suffix quiz';
      case 'mixed':
        return 'Mixed quiz';
      case 'confident':
        return 'Revision quiz';
      default:
        return 'Words quiz';
    }
  });
  protected readonly quizDifficultyLabel = computed(() => `Level ${this.quizDifficulty()}`);
  protected readonly quizQuestionTargetLabel = computed(() => `${this.quizQuestionTarget()} questions`);
  private inventoryIndex = new Map<string, unknown>();
  private inventoryLoadPromise: Promise<void> | null = null;
  private quizBankLoadPromise: Promise<void> | null = null;
  private confidentWordsLoadPromise: Promise<void> | null = null;
  private needsFocusWordsLoadPromise: Promise<void> | null = null;
  private quizBankCache = new Map<QuizBankType, QuizBankFile>();
  private quizTimerHandle: number | null = null;
  private readonly profileStorageKey = 'etymobreak-profile';
  private readonly pendingGoogleStorageKey = 'etymobreak-google-identity';
  private readonly quizDraftPrefix = 'etymobreak-quiz-draft';
  private quizAttemptCounter = 0;
  protected readonly autocompleteOptions = computed(() => {
    const current = this.query().trim().toLowerCase();
    const unique = [
      ...new Set(
      this.rootAutocomplete()
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (!current) {
      return [];
    }

    const filtered = unique.filter((item) => item.startsWith(current));
    return filtered.slice(0, 8);
  });
  protected readonly showAutocomplete = computed(
    () =>
      this.autocompleteOpen() &&
      this.query().trim().length > 0 &&
      this.autocompleteOptions().length > 0
  );
  protected readonly alphabet = computed(() => 'abcdefghijklmnopqrstuvwxyz'.split(''));
  protected readonly allWordSlides = computed(() => this.getInventoryAnalyses(this.experimentLetter(), 'all'));
  protected readonly rootSuffixSlides = computed(() => this.getInventoryAnalyses(this.experimentLetter(), 'root_suffix'));
  protected readonly activeWordSlides = computed(() =>
    this.activeTab() === 'root_suffix' ? this.rootSuffixSlides() : this.allWordSlides()
  );
  protected readonly experimentSlide = computed(() => {
    const slides = this.activeWordSlides();
    if (!slides.length) {
      return null;
    }

    const index = Math.min(Math.max(this.experimentIndex(), 0), slides.length - 1);
    return slides[index] ?? null;
  });
  protected readonly experimentSlideCount = computed(() => this.activeWordSlides().length);
  protected readonly experimentSlidePosition = computed(() => {
    const total = this.experimentSlideCount();
    if (!total) {
      return 0;
    }

    return Math.min(Math.max(this.experimentIndex(), 0), total - 1) + 1;
  });
  protected readonly quizQuestion = computed(() => {
    const questions = this.quizQuestions();
    if (!questions.length) {
      return null;
    }

    const index = Math.min(Math.max(this.quizIndex(), 0), questions.length - 1);
    return questions[index] ?? null;
  });
  protected readonly quizQuestionCount = computed(() => this.quizQuestions().length);
  protected readonly quizQuestionPosition = computed(() => {
    const total = this.quizQuestionCount();
    if (!total) {
      return 0;
    }

    return Math.min(Math.max(this.quizIndex(), 0), total - 1) + 1;
  });
  protected readonly quizAnsweredCount = computed(
    () => this.quizQuestions().filter((question) => question.selectedIndex !== null).length
  );
  protected readonly quizCanSubmit = computed(
    () => this.quizQuestionCount() > 0 && this.quizAnsweredCount() === this.quizQuestionCount()
  );
  protected readonly quizCorrectCount = computed(() =>
    this.quizQuestions().filter((question) => question.submitted && question.isCorrect).length
  );
  protected readonly quizWrongCount = computed(() =>
    this.quizQuestions().filter(
      (question) => question.submitted && !question.skipped && question.isCorrect === false
    ).length
  );
  protected readonly quizTotalMarks = computed(
    () => this.quizCorrectCount() * 3 - this.quizWrongCount()
  );
  protected readonly quizCompleted = computed(
    () => this.quizQuestions().length > 0 && this.quizQuestions().every((question) => question.submitted)
  );
  protected readonly quizSummaryItems = computed<QuizSummaryQuestion[]>(() =>
    this.quizQuestions().map((question) => {
      const selectedIndex = question.selectedIndex;
      const selectedText = selectedIndex === null ? '' : question.options[selectedIndex] ?? '';
      const correctText = question.options[question.correctIndex] ?? '';
      const isSkipped = question.skipped || selectedIndex === null;
      const userAnswerLabel = isSkipped ? 'Skipped' : selectedText || 'Unanswered';
      const isCorrect = !isSkipped && selectedIndex === question.correctIndex;
      return {
        ...question,
        userAnswer: selectedText,
        userAnswerLabel,
        correctAnswerLabel: correctText,
        status: isCorrect ? 'correct' : isSkipped ? 'skipped' : 'wrong',
      };
    })
  );
  protected readonly quizSummaryFilteredItems = computed(() => {
    const filter = this.quizReviewFilter();
    const items = this.quizSummaryItems();
    if (filter === 'all') {
      return items;
    }

    return items.filter((item) => item.status === filter);
  });
  protected readonly quizSummaryFilterCounts = computed(() => {
    const items = this.quizSummaryItems();
    return {
      all: items.length,
      correct: items.filter((item) => item.status === 'correct').length,
      wrong: items.filter((item) => item.status === 'wrong').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
    };
  });
  protected readonly quizCurrentQuestionSubmitted = computed(() => this.quizQuestion()?.submitted ?? false);
  protected readonly profileComplete = computed(() => {
    const profile = this.profile();
    return !!profile?.firstName && !!profile?.lastName && !!profile?.country;
  });
  protected readonly authStage = computed<AuthStage>(() => {
    if (this.profileComplete()) {
      return 'app';
    }

    if (this.authGateLoading()) {
      return 'loading';
    }

    if (this.googleIdentity()) {
      return 'profile';
    }

    return 'home';
  });
  protected readonly canCompleteProfile = computed(
    () =>
      !!this.googleIdentity() &&
      this.profileFirstName().trim().length > 0 &&
      this.profileLastName().trim().length > 0 &&
      this.profileCountry().trim().length > 0
  );
  protected readonly profileInitials = computed(() => {
    const profile = this.profile();
    const first = String(profile?.firstName || '').trim().charAt(0);
    const last = String(profile?.lastName || '').trim().charAt(0);
    const fallback = String(profile?.google?.name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('');
    return (first + last || fallback || 'U').toUpperCase().slice(0, 2);
  });
  protected readonly profileDisplayName = computed(() => {
    const profile = this.profile();
    return [profile?.firstName, profile?.lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  });
  protected readonly quizHistoryCount = computed(() => this.quizHistory().length);
  protected readonly selectedQuizHistory = computed(() =>
    this.quizHistory().find((item) => item.id === this.selectedQuizHistoryId()) ?? null
  );
  private normalizeForMatch(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private familyKey(label: string): string {
    const primary = label.trim().toLowerCase().split('/')[0].replace(/^-+/, '');
    return this.normalizeForMatch(primary);
  }

  private matchesFamilySection(term: string, label: string): boolean {
    const cleanedTerm = this.normalizeForMatch(term);
    const cleanedLabel = this.familyKey(label);
    if (!cleanedTerm || !cleanedLabel) {
      return false;
    }

    if (label.trim().startsWith('-')) {
      return cleanedTerm.endsWith(cleanedLabel);
    }

    return cleanedTerm.includes(cleanedLabel);
  }

  protected breakdownRowsFor(analysis: AnalysisResult | null): BreakdownRow[] {
    if (!analysis) {
      return [];
    }

    const rows: BreakdownRow[] = [];
    for (let index = 0; index < analysis.breakdown.length; index += 2) {
      rows.push(analysis.breakdown.slice(index, index + 2));
    }
    return rows;
  }

  protected familyCardsFor(analysis: AnalysisResult | null): FamilySection[] {
    if (!analysis) {
      return [];
    }

    const rootPart = analysis.breakdown.find((part) => part.type === 'root') ?? analysis.breakdown[0];
    const suffixPart = analysis.breakdown.find((part) => part.type === 'suffix') ?? analysis.breakdown[1];

    const sortedItems = [...analysis.familyMemory].sort((a, b) =>
      a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
    );

    const makeSection = (part: AnalysisPart | undefined, tone: string): FamilySection | null => {
      if (!part) {
        return null;
      }

      const items = sortedItems.filter((item) => this.matchesFamilySection(item.term, part.label));
      if (!items.length) {
        return null;
      }

      return {
        label: part.label,
        title: tone === 'root' ? 'Root' : 'Suffix',
        tone,
        items: [...items].sort((a, b) =>
          a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
        ),
      };
    };

    return [makeSection(rootPart, 'root'), makeSection(suffixPart, 'suffix')].filter(
      (section): section is FamilySection => section !== null
    );
  }

  public ngOnInit(): void {
    this.inventoryLoadPromise = this.loadRootAutocomplete();
    void this.loadQuizBanks();
    void this.loadAuthConfig();
    this.loadStoredProfile();
  }

  public ngAfterViewInit(): void {
    this.tryRenderGoogleButton();
  }

  protected setActiveTab(tab: AppTab): void {
    this.activeTab.set(tab);
  }

  protected completeProfile(): void {
    if (!this.googleIdentity()) {
      this.authError.set('Please sign in with Google first.');
      return;
    }

    const firstName = this.profileFirstName().trim();
    const lastName = this.profileLastName().trim();
    const country = this.profileCountry().trim();

    if (!firstName || !lastName || !country) {
      this.authError.set('First name, last name, and country are required.');
      return;
    }

    const profile: StoredProfile = {
      firstName,
      lastName,
      country,
      google: this.googleIdentity()!,
    };

    this.loading.set(true);
    this.authError.set('');
    this.authMessage.set('Creating your profile...');

    void this.saveProfile(profile);
  }

  protected signOutProfile(): void {
    this.clearQuizDraftLocally();
    this.profileMenuOpen.set(false);
    this.profileMenuView.set('profile');
    this.profile.set(null);
    this.googleIdentity.set(null);
    this.profileFirstName.set('');
    this.profileLastName.set('');
    this.profileCountry.set('');
    this.authMessage.set('Signed out.');
    this.authError.set('');
    this.googleButtonRendered.set(false);
    this.quizHistory.set([]);
    this.quizHistoryError.set('');
    this.quizHistorySaved.set(false);
    this.selectedQuizHistoryId.set('');
    this.confidentWords.set([]);
    this.confidentWordsError.set('');
    this.confidentWordNotice.set('');
    this.needsFocusWords.set([]);
    this.needsFocusWordsError.set('');
    this.needsFocusWordNotice.set('');
    try {
      localStorage.removeItem(this.profileStorageKey);
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
    } catch {
      return;
    }
    setTimeout(() => this.tryRenderGoogleButton(), 0);
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
    if (!this.profileMenuOpen()) {
      return;
    }

    this.profileMenuView.set('profile');
    void this.loadQuizHistoryFromServer();
    void this.loadConfidentWordsFromServer();
    void this.loadNeedsFocusWordsFromServer();
  }

  protected setProfileMenuView(view: 'profile' | 'history'): void {
    this.profileMenuView.set(view);
    if (view === 'history') {
      if (!this.selectedQuizHistoryId() && this.quizHistory().length) {
        this.selectedQuizHistoryId.set(this.quizHistory()[0]!.id);
      }
      void this.loadQuizHistoryFromServer();
      void this.loadConfidentWordsFromServer();
      void this.loadNeedsFocusWordsFromServer();
    }
  }

  protected selectQuizHistory(id: string): void {
    this.selectedQuizHistoryId.set(id);
  }

  protected startGoogleSignIn(): void {
    if (!this.googleClientId()) {
      this.authError.set('Google sign-in is not configured yet.');
      return;
    }

    this.tryRenderGoogleButton();

    const google = (window as Window & { google?: any }).google;
    if (!google?.accounts?.id) {
      this.authError.set('Google sign-in is still loading. Please try again in a moment.');
      return;
    }

    google.accounts.id.prompt();
  }

  protected chooseExperimentLetter(letter: string): void {
    this.experimentLetter.set(letter);
    this.experimentIndex.set(0);
  }

  protected selectQuizType(type: QuizBankType): void {
    this.quizType.set(type);
  }

  protected isAnalysisConfident(analysis: AnalysisResult | null): boolean {
    if (!analysis) {
      return false;
    }

    const key = this.confidentKey(analysis.query, analysis.mode);
    return this.confidentWords().some((item) => this.confidentKey(item.query, item.mode) === key);
  }

  protected async toggleConfidentForAnalysis(analysis: AnalysisResult | null): Promise<void> {
    const profile = this.profile();
    if (!analysis || !profile) {
      return;
    }

    const query = analysis.query.trim();
    if (!query) {
      return;
    }

    const confident = !this.isAnalysisConfident(analysis);
    this.confidentWordsSaving.set(true);
    this.confidentWordsError.set('');
    this.confidentWordNotice.set('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/confident-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          query,
          mode: analysis.mode || 'word',
          analysis,
          confident,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          details?: string;
        } | null;
        const message = payload?.error || 'Your confident word could not be saved.';
        const details = payload?.details ? ` ${payload.details}` : '';
        throw new Error(`${message}${details}`.trim());
      }

      const saved = (await response.json().catch(() => null)) as
        | ConfidentWordEntry
        | { removed?: boolean }
        | null;

      if (saved && !(saved as { removed?: boolean }).removed) {
        const entry = saved as ConfidentWordEntry;
        const key = this.confidentKey(entry.query, entry.mode);
        const next = [entry, ...this.confidentWords().filter((item) => this.confidentKey(item.query, item.mode) !== key)];
        this.confidentWords.set(next);
        this.confidentWordNotice.set(`${analysis.title || analysis.query} was marked as Confident.`);
        if (this.isAnalysisNeedsFocus(analysis)) {
          await this.removeNeedsFocusForAnalysis(analysis);
        }
      } else {
        const key = this.confidentKey(query, analysis.mode || 'word');
        this.confidentWords.update((items) =>
          items.filter((item) => this.confidentKey(item.query, item.mode) !== key)
        );
        this.confidentWordNotice.set(`${analysis.title || analysis.query} was removed from Confident words.`);
      }
    } catch (error) {
      this.confidentWordsError.set(error instanceof Error ? error.message : 'Your confident word could not be saved.');
    } finally {
      this.confidentWordsSaving.set(false);
    }
  }

  protected isAnalysisNeedsFocus(analysis: AnalysisResult | null): boolean {
    if (!analysis) {
      return false;
    }

    const key = this.needsFocusKey(analysis.query, analysis.mode);
    return this.needsFocusWords().some((item) => this.needsFocusKey(item.query, item.mode) === key);
  }

  protected async toggleNeedsFocusForAnalysis(analysis: AnalysisResult | null): Promise<void> {
    const profile = this.profile();
    if (!analysis || !profile) {
      return;
    }

    const query = analysis.query.trim();
    if (!query) {
      return;
    }

    const needsFocus = !this.isAnalysisNeedsFocus(analysis);
    this.needsFocusWordsSaving.set(true);
    this.needsFocusWordsError.set('');
    this.needsFocusWordNotice.set('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/needs-focus-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          query,
          mode: analysis.mode || 'word',
          analysis,
          needsFocus,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          details?: string;
        } | null;
        const message = payload?.error || 'Your needs-focus word could not be saved.';
        const details = payload?.details ? ` ${payload.details}` : '';
        throw new Error(`${message}${details}`.trim());
      }

      const saved = (await response.json().catch(() => null)) as
        | NeedsFocusWordEntry
        | { removed?: boolean }
        | null;

      if (saved && !(saved as { removed?: boolean }).removed) {
        const entry = saved as NeedsFocusWordEntry;
        const key = this.needsFocusKey(entry.query, entry.mode);
        const next = [entry, ...this.needsFocusWords().filter((item) => this.needsFocusKey(item.query, item.mode) !== key)];
        this.needsFocusWords.set(next);
        this.needsFocusWordNotice.set(`${analysis.title || analysis.query} was marked as Needs Focus.`);
        if (this.isAnalysisConfident(analysis)) {
          await this.removeConfidentForAnalysis(analysis);
        }
      } else {
        const key = this.needsFocusKey(query, analysis.mode || 'word');
        this.needsFocusWords.update((items) =>
          items.filter((item) => this.needsFocusKey(item.query, item.mode) !== key)
        );
        this.needsFocusWordNotice.set(`${analysis.title || analysis.query} was removed from Needs Focus words.`);
      }
    } catch (error) {
      this.needsFocusWordsError.set(error instanceof Error ? error.message : 'Your needs-focus word could not be saved.');
    } finally {
      this.needsFocusWordsSaving.set(false);
    }
  }

  private async removeConfidentForAnalysis(analysis: AnalysisResult | null): Promise<void> {
    const profile = this.profile();
    if (!analysis || !profile) {
      return;
    }

    const query = analysis.query.trim();
    if (!query) {
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/confident-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          query,
          mode: analysis.mode || 'word',
          analysis,
          confident: false,
        }),
      });

      if (!response.ok) {
        return;
      }

      this.confidentWords.update((items) =>
        items.filter((item) => this.confidentKey(item.query, item.mode) !== this.confidentKey(query, analysis.mode || 'word'))
      );
    } catch {
      return;
    }
  }

  private async removeNeedsFocusForAnalysis(analysis: AnalysisResult | null): Promise<void> {
    const profile = this.profile();
    if (!analysis || !profile) {
      return;
    }

    const query = analysis.query.trim();
    if (!query) {
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/needs-focus-words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          query,
          mode: analysis.mode || 'word',
          analysis,
          needsFocus: false,
        }),
      });

      if (!response.ok) {
        return;
      }

      this.needsFocusWords.update((items) =>
        items.filter((item) => this.needsFocusKey(item.query, item.mode) !== this.needsFocusKey(query, analysis.mode || 'word'))
      );
    } catch {
      return;
    }
  }

  protected isHistoryQuestionConfident(question: QuizAttemptQuestion | null): boolean {
    const analysis = this.buildHistoryQuestionAnalysis(question);
    return this.isAnalysisConfident(analysis);
  }

  protected isHistoryQuestionNeedsFocus(question: QuizAttemptQuestion | null): boolean {
    const analysis = this.buildHistoryQuestionAnalysis(question);
    return this.isAnalysisNeedsFocus(analysis);
  }

  protected async toggleConfidentForHistoryQuestion(question: QuizAttemptQuestion | null): Promise<void> {
    const analysis = this.buildHistoryQuestionAnalysis(question);
    if (!analysis) {
      return;
    }

    await this.toggleConfidentForAnalysis(analysis);
  }

  protected async toggleNeedsFocusForHistoryQuestion(question: QuizAttemptQuestion | null): Promise<void> {
    const analysis = this.buildHistoryQuestionAnalysis(question);
    if (!analysis) {
      return;
    }

    await this.toggleNeedsFocusForAnalysis(analysis);
  }

  protected selectQuizDifficulty(level: number): void {
    this.quizDifficulty.set(Math.min(5, Math.max(1, Math.floor(level))));
  }

  protected selectQuizQuestionCount(count: number): void {
    const normalized = Math.min(50, Math.max(5, Math.floor(count / 5) * 5));
    this.quizQuestionTarget.set(normalized || 5);
  }

  protected async startQuiz(): Promise<void> {
    if (this.quizFlowStage() === 'taking' || this.quizPreparing()) {
      return;
    }

    this.quizPreparing.set(true);
    this.quizHistorySaved.set(false);
    this.quizHistorySubmitting.set(false);
    this.quizHistoryError.set('');
    this.quizNotice.set('');
    this.quizIndex.set(0);
    this.quizTimeRemaining.set(25 * 60);
    this.quizQuestions.set([]);

    const deck = await this.buildQuizDeck(
      this.quizType(),
      this.quizDifficulty(),
      this.quizQuestionTarget()
    );
    if (!deck.length) {
      this.quizFlowStage.set('setup');
      this.quizNotice.set(
        this.quizType() === 'confident'
          ? 'Mark a few words as Confident first, then build a revision quiz from them.'
          : 'That quiz bank could not be loaded yet. Please try again in a moment.'
      );
      this.quizPreparing.set(false);
      return;
    }

    this.quizQuestions.set(deck);
    this.quizFlowStage.set('taking');
    this.quizPreparing.set(false);
    this.persistQuizDraft(false);
    this.startQuizTimer();
  }

  protected previousExperimentSlide(): void {
    const total = this.experimentSlideCount();
    if (!total) {
      return;
    }

    this.experimentIndex.set(Math.max(0, this.experimentIndex() - 1));
  }

  protected nextExperimentSlide(): void {
    const total = this.experimentSlideCount();
    if (!total) {
      return;
    }

    this.experimentIndex.set(Math.min(total - 1, this.experimentIndex() + 1));
  }

  protected previousQuizQuestion(): void {
    if (!this.quizQuestionCount()) {
      return;
    }

    this.quizIndex.set(Math.max(0, this.quizIndex() - 1));
  }

  protected nextQuizQuestion(): void {
    const total = this.quizQuestionCount();
    if (!total) {
      return;
    }

    this.quizIndex.set(Math.min(total - 1, this.quizIndex() + 1));
  }

  protected skipCurrentQuizQuestion(): void {
    const total = this.quizQuestionCount();
    if (!total) {
      return;
    }

    this.quizNotice.set('Question skipped. Come back to it anytime before finishing.');
    const questions = this.quizQuestions();
    const currentIndex = this.quizIndex();
    const question = questions[currentIndex];
    if (question) {
      const updated = [...questions];
      updated[currentIndex] = {
        ...question,
        selectedIndex: null,
        skipped: true,
      };
      this.quizQuestions.set(updated);
      this.persistQuizDraft(false);
    }
    this.quizIndex.set(Math.min(total - 1, this.quizIndex() + 1));
  }

  protected selectQuizOption(index: number): void {
    if (this.quizCurrentQuestionSubmitted()) {
      return;
    }

    const questions = this.quizQuestions();
    const currentIndex = this.quizIndex();
    const question = questions[currentIndex];
    if (!question) {
      return;
    }

    const updated = [...questions];
    updated[currentIndex] = {
      ...question,
      selectedIndex: index,
      skipped: false,
    };
    this.quizQuestions.set(updated);
    this.persistQuizDraft(false);
    this.quizNotice.set('');
  }

  protected saveCurrentQuizAnswerLocally(): void {
    if (this.quizFlowStage() !== 'taking' || !this.quizQuestions().length) {
      this.quizNotice.set('Start a quiz first.');
      return;
    }

    if (this.persistQuizDraft(true)) {
      this.quizNotice.set('Answer saved locally on this device.');
    } else {
      this.quizNotice.set('Nothing to save yet. Choose an answer first.');
    }
  }

  protected async submitQuizAttempt(): Promise<void> {
    if (!this.profile()) {
      this.quizHistoryError.set('Sign in first to save quiz history.');
      return;
    }

    if (!this.quizQuestions().length) {
      this.quizNotice.set('Start a quiz first.');
      return;
    }

    if (this.quizHistorySubmitting() || this.quizHistorySaved()) {
      return;
    }

    const profile = this.profile();
    if (!profile) {
      return;
    }

    const finalizedQuestions = this.quizQuestions().map((question) => {
      const skipped = question.skipped || question.selectedIndex === null;
      const isCorrect = !skipped && question.selectedIndex === question.correctIndex;
      return {
        ...question,
        skipped,
        submitted: true,
        isCorrect,
      };
    });

    this.quizQuestions.set(finalizedQuestions);
    this.quizFlowStage.set('summary');
    this.stopQuizTimer();
    this.quizHistorySubmitting.set(true);
    this.quizHistoryError.set('');

    const totalPossible = this.quizQuestionCount() * 3;
    const marks = this.quizTotalMarks();
    const percentage = totalPossible > 0 ? Math.max(0, Math.round((marks / totalPossible) * 100)) : 0;
    const questionHistory: QuizAttemptQuestion[] = finalizedQuestions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      sourceTitle: question.sourceTitle,
      sourceQuery: question.sourceTitle,
      sourceMode: 'word',
      options: question.options,
      selectedIndex: question.selectedIndex,
      selectedText: question.selectedIndex === null ? '' : question.options[question.selectedIndex] ?? '',
      correctIndex: question.correctIndex,
      correctText: question.options[question.correctIndex] ?? '',
      skipped: question.skipped,
      submitted: question.submitted,
      isCorrect: question.isCorrect,
    }));

    try {
      const response = await fetch(`${getApiBaseUrl()}/quiz-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile,
          quizScope: this.quizType(),
          quizType: this.quizType(),
          difficulty: this.quizDifficulty(),
          questionCount: this.quizQuestionCount(),
          timeLimitMinutes: 25,
          correctCount: this.quizCorrectCount(),
          wrongCount: this.quizWrongCount(),
          marks,
          percentage,
          totalPossible,
          timeSpentSeconds: 25 * 60 - this.quizTimeRemaining(),
          attempt: {
            quizType: this.quizType(),
            difficulty: this.quizDifficulty(),
            questionCount: this.quizQuestionCount(),
            timeLimitMinutes: 25,
            questions: questionHistory,
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          details?: string;
        } | null;
        const message = payload?.error || 'Your quiz history could not be saved.';
        const details = payload?.details ? ` ${payload.details}` : '';
        throw new Error(`${message}${details}`.trim());
      }

      const saved = (await response.json().catch(() => null)) as QuizHistoryEntry | null;
      if (saved) {
        const next = [saved, ...this.quizHistory().filter((item) => item.id !== saved.id)].slice(0, 25);
        this.quizHistory.set(next);
      } else {
        await this.loadQuizHistoryFromServer();
      }

      this.quizHistorySaved.set(true);
      this.quizNotice.set('Quiz saved to your history.');
      this.clearQuizDraftLocally();
    } catch (error) {
      this.quizHistoryError.set(error instanceof Error ? error.message : 'Your quiz history could not be saved.');
    } finally {
      this.quizHistorySubmitting.set(false);
    }
  }

  protected resetQuiz(): void {
    this.stopQuizTimer();
    this.quizFlowStage.set('setup');
    this.quizQuestions.set([]);
    this.quizIndex.set(0);
    this.quizReviewFilter.set('all');
    this.quizTimeRemaining.set(25 * 60);
    this.quizPreparing.set(false);
    this.quizQuestionTarget.set(50);
    this.quizNotice.set('');
    this.quizHistorySaved.set(false);
    this.quizHistoryError.set('');
    this.clearQuizDraftLocally();
  }

  protected formatHistoryTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  protected historyActionLabel(): string {
    if (this.quizHistorySubmitting()) {
      return 'Saving...';
    }

    if (this.quizHistorySaved()) {
      return 'Saved';
    }

    return 'Submit Quiz';
  }

  private async loadRootAutocomplete(): Promise<void> {
    try {
      const response = await fetch('/root-inventory.json');
      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!Array.isArray(payload)) {
        return;
      }

      this.inventoryEntries.set(payload);

      const inventoryTerms = payload
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }

          const entry: any = item;
          const key = String(entry.query || '').trim().toLowerCase();
          if (key) {
            this.inventoryIndex.set(key, item);
          }
          return String(entry.query || '').trim().toLowerCase();
        })
        .filter(Boolean);

      this.rootAutocomplete.set([...new Set(inventoryTerms)]);
    } catch {
      return;
    }
  }

  private async loadAuthConfig(): Promise<void> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/config`);
      if (!response.ok) {
        this.authMessage.set('Google sign-in is not ready yet.');
        return;
      }

      const payload = (await response.json().catch(() => null)) as { googleClientId?: string } | null;
      const clientId = String(payload?.googleClientId || '').trim();
      this.googleClientId.set(clientId);
      if (!clientId) {
        this.authMessage.set('Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID on Render.');
        return;
      }

      this.authMessage.set('Connect your Google account to continue.');
      this.tryRenderGoogleButton();
    } catch {
      this.authMessage.set('Google sign-in is not available right now.');
    }
  }

  private loadStoredProfile(): void {
    try {
      const raw = localStorage.getItem(this.profileStorageKey);
      if (!raw) {
        this.loadPendingGoogleIdentity();
        return;
      }

      const stored = JSON.parse(raw) as Partial<StoredProfile> | null;
      if (!stored || !stored.google) {
        return;
      }

      const firstName = String(stored.firstName || '').trim();
      const lastName = String(stored.lastName || '').trim();
      const country = String(stored.country || '').trim();
      if (!firstName || !lastName || !country) {
        return;
      }

      this.profile.set({
        firstName,
        lastName,
        country,
        google: stored.google as GoogleIdentity,
      });
      this.profileFirstName.set(firstName);
      this.profileLastName.set(lastName);
      this.profileCountry.set(country);
      this.loadQuizDraftLocally();
      void this.loadQuizHistoryFromServer();
      void this.loadConfidentWordsFromServer();
      void this.loadNeedsFocusWordsFromServer();
      return;
    } catch {
      this.loadPendingGoogleIdentity();
    }
  }

  private loadPendingGoogleIdentity(): void {
    try {
      const raw = sessionStorage.getItem(this.pendingGoogleStorageKey);
      if (!raw) {
        return;
      }

      const pending = JSON.parse(raw) as Partial<GoogleIdentity> | null;
      if (!pending) {
        return;
      }

      const identity: GoogleIdentity = {
        sub: String(pending.sub || '').trim(),
        email: String(pending.email || '').trim(),
        name: String(pending.name || '').trim(),
        given_name: String(pending.given_name || '').trim(),
        family_name: String(pending.family_name || '').trim(),
        picture: String(pending.picture || '').trim(),
      };

      if (!identity.sub && !identity.email) {
        return;
      }

      this.googleIdentity.set(identity);
      this.profileFirstName.set(identity.given_name || identity.name.split(/\s+/)[0] || '');
      this.profileLastName.set(identity.family_name || identity.name.split(/\s+/).slice(1).join(' ') || '');
      this.authGateLoading.set(true);
      this.authMessage.set('Checking your saved profile...');
      void this.loadProfileFromServer(identity);
    } catch {
      return;
    }
  }

  private async loadProfileFromServer(identity: GoogleIdentity): Promise<void> {
    if (!identity.sub && !identity.email) {
      return;
    }

    try {
      this.authGateLoading.set(true);
      const params = new URLSearchParams();
      if (identity.sub) {
        params.set('sub', identity.sub);
      }
      if (identity.email) {
        params.set('email', identity.email);
      }

      const response = await fetch(`${getApiBaseUrl()}/profile?${params.toString()}`);
      if (!response.ok) {
        this.authGateLoading.set(false);
        this.authMessage.set('Google account connected. Finish your profile and continue.');
        return;
      }

      const payload = (await response.json().catch(() => null)) as Partial<CreatedProfileResponse> | null;
      const firstName = String(payload?.firstName || '').trim();
      const lastName = String(payload?.lastName || '').trim();
      const country = String(payload?.country || '').trim();
      const google = payload?.google || identity;
      if (!firstName || !lastName || !country) {
        this.authGateLoading.set(false);
        this.authMessage.set('Google account connected. Finish your profile and continue.');
        return;
      }

      const normalizedProfile: StoredProfile = {
        firstName,
        lastName,
        country,
        google,
      };

      this.profile.set(normalizedProfile);
      this.profileFirstName.set(firstName);
      this.profileLastName.set(lastName);
      this.profileCountry.set(country);
      this.profileMenuOpen.set(false);
      this.loadQuizDraftLocally();
      void this.loadQuizHistoryFromServer();
      void this.loadConfidentWordsFromServer();
      void this.loadNeedsFocusWordsFromServer();
      localStorage.setItem(this.profileStorageKey, JSON.stringify(normalizedProfile));
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
      this.authGateLoading.set(false);
      this.authMessage.set('Welcome back. Your profile is ready.');
      this.authError.set('');
    } catch {
      this.authGateLoading.set(false);
      this.authMessage.set('Google account connected. Finish your profile and continue.');
      return;
    }
  }

  private async saveProfile(profile: StoredProfile): Promise<void> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          details?: string;
        } | null;
        const message = payload?.error || 'Your profile could not be created right now.';
        const details = payload?.details ? ` ${payload.details}` : '';
        throw new Error(`${message}${details}`.trim());
      }

      const created = (await response.json()) as CreatedProfileResponse;
      const normalizedProfile: StoredProfile = {
        firstName: String(created.firstName || profile.firstName).trim(),
        lastName: String(created.lastName || profile.lastName).trim(),
        country: String(created.country || profile.country).trim(),
        google: created.google || profile.google,
      };

      this.profile.set(normalizedProfile);
      this.authMessage.set('Profile created. Welcome to EtymoBreak.');
      this.authError.set('');
      this.authGateLoading.set(false);
      this.profileMenuOpen.set(false);
      void this.loadQuizHistoryFromServer();
      void this.loadConfidentWordsFromServer();
      void this.loadNeedsFocusWordsFromServer();

      localStorage.setItem(this.profileStorageKey, JSON.stringify(normalizedProfile));
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
    } catch (error) {
      const fallbackProfile: StoredProfile = {
        ...profile,
      };

      this.profile.set(fallbackProfile);
      this.authMessage.set('Profile saved locally. Welcome to EtymoBreak.');
      this.authError.set(error instanceof Error ? error.message : 'Your profile could not be created.');
      this.authGateLoading.set(false);
      this.profileMenuOpen.set(false);
      this.loadQuizDraftLocally();
      void this.loadQuizHistoryFromServer();
      void this.loadConfidentWordsFromServer();
      void this.loadNeedsFocusWordsFromServer();

      try {
        localStorage.setItem(this.profileStorageKey, JSON.stringify(fallbackProfile));
        sessionStorage.removeItem(this.pendingGoogleStorageKey);
      } catch {
        this.authError.set('Your profile could not be saved locally.');
      }
      return;
    } finally {
      this.loading.set(false);
    }
  }

  private tryRenderGoogleButton(attempt = 0): void {
    if (this.googleButtonRendered() || !this.googleClientId() || !this.googleButtonHost?.nativeElement) {
      return;
    }

    const google = (window as Window & { google?: any }).google;
    if (!google?.accounts?.id) {
      if (attempt < 20) {
        setTimeout(() => this.tryRenderGoogleButton(attempt + 1), 250);
      }
      return;
    }

    google.accounts.id.initialize({
      client_id: this.googleClientId(),
      callback: (response: { credential?: string }) => this.handleGoogleCredential(response),
    });

    google.accounts.id.renderButton(this.googleButtonHost.nativeElement, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 280,
    });

    this.googleButtonRendered.set(true);
  }

  private handleGoogleCredential(response: { credential?: string }): void {
    const credential = String(response?.credential || '').trim();
    if (!credential) {
      this.authError.set('Google sign-in did not return a credential.');
      return;
    }

    const payload = this.decodeJwtPayload(credential);
    if (!payload) {
      this.authError.set('Could not read the Google profile.');
      return;
    }

    const givenName = String(payload.given_name || '').trim();
    const familyName = String(payload.family_name || '').trim();
    const fullName = String(payload.name || '').trim();
    const fallbackParts = fullName.split(/\s+/).filter(Boolean);

    this.authGateLoading.set(true);
    this.authMessage.set('Checking your saved profile...');
    this.authError.set('');

    this.googleIdentity.set({
      sub: String(payload.sub || '').trim(),
      email: String(payload.email || '').trim(),
      name: fullName,
      given_name: givenName,
      family_name: familyName,
      picture: String(payload.picture || '').trim(),
    });

    try {
      sessionStorage.setItem(
        this.pendingGoogleStorageKey,
        JSON.stringify(this.googleIdentity())
      );
    } catch {
      this.authError.set('Could not save Google sign-in temporarily.');
    }

    if (!this.profileFirstName().trim()) {
      this.profileFirstName.set(givenName || fallbackParts[0] || '');
    }
    if (!this.profileLastName().trim()) {
      this.profileLastName.set(familyName || fallbackParts.slice(1).join(' ') || '');
    }
    void this.loadProfileFromServer(this.googleIdentity()!);
    this.authError.set('');
  }

  private decodeJwtPayload(token: string): GoogleIdentity | null {
    try {
      const segment = token.split('.')[1];
      if (!segment) {
        return null;
      }

      const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
      const binary = atob(normalized + padding);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as GoogleIdentity;
    } catch {
      return null;
    }
  }

  private getInventoryAnalyses(letter = '', mode: 'all' | 'root_suffix' = 'all'): AnalysisResult[] {
    const normalizedLetter = letter.trim().toLowerCase();
    return this.inventoryEntries()
      .filter((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const entry: any = item;
        const query = String(entry.query || '').trim().toLowerCase();
        if (!query) {
          return false;
        }

        if (normalizedLetter && !query.startsWith(normalizedLetter)) {
          return false;
        }

        if (mode === 'all') {
          return true;
        }

        const breakdown = Array.isArray(entry.breakdown) ? entry.breakdown : [];
        return breakdown.some((part: any) => {
          const type = String(part?.type || '').trim().toLowerCase();
          return type.includes('root') || type.includes('suffix') || type.includes('prefix');
        });
      })
      .map((item) => {
        const entry: any = item;
        const query = String(entry.query || '').trim().toLowerCase();
        return this.normalizeAnalysisResult(item, query);
      })
      .filter((item) => !this.isEmptyAnalysis(item))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }

  private shuffle<T>(items: T[]): T[] {
    const values = [...items];
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [values[index], values[swap]] = [values[swap], values[index]];
    }
    return values;
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private async loadQuizBanks(): Promise<void> {
    if (this.quizBankLoadPromise) {
      await this.quizBankLoadPromise;
      return;
    }

    this.quizBankLoadPromise = Promise.all(
      (['word', 'root_prefix_suffix', 'mixed'] as QuizBankType[]).map(async (bankType) => {
        const bank = await this.loadQuizBank(bankType);
        if (bank) {
          this.quizBankCache.set(bankType, bank);
        }
      })
    ).then(() => undefined);

    await this.quizBankLoadPromise;
  }

  private async loadQuizBank(bankType: QuizBankType): Promise<QuizBankFile | null> {
    if (bankType === 'confident') {
      return null;
    }

    const cached = this.quizBankCache.get(bankType);
    if (cached) {
      return cached;
    }

    const fileMap: Record<Exclude<QuizBankType, 'confident'>, string> = {
      word: '/question_bank_words.json',
      root_prefix_suffix: '/question_bank_roots_prefixes_suffixes.json',
      mixed: '/question_bank_mixed.json',
    };

    try {
      const response = await fetch(fileMap[bankType]);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json().catch(() => null)) as QuizBankFile | null;
      if (!payload || !Array.isArray(payload.questions)) {
        return null;
      }

      this.quizBankCache.set(bankType, payload);
      return payload;
    } catch {
      return null;
    }
  }

  private normalizeQuizQuestion(record: QuizBankQuestion, index: number): QuizQuestion | null {
    const options = Array.isArray(record.options)
      ? this.shuffle(
          record.options
            .map((option) => ({
              id: String(option?.id || '').trim(),
              text: String(option?.text || '').trim(),
            }))
            .filter((option) => option.id && option.text)
        )
      : [];

    if (options.length < 4) {
      return null;
    }

    const answerKey = String(record.answer || '').trim().toUpperCase();
    const correctIndex = options.findIndex((option) => option.id.toUpperCase() === answerKey);
    if (correctIndex < 0) {
      return null;
    }

    const metadata = record.metadata ?? {};
    const sourceTitle = String(
      metadata['word'] || metadata['part'] || metadata['root'] || record.questionType || record.id
    ).trim();

    return {
      id: `${record.id}-${index}`,
      type: this.mapQuizQuestionType(record.questionType),
      prompt: String(record.question || '').trim(),
      options: options.map((option) => option.text),
      correctIndex,
      selectedIndex: null,
      skipped: false,
      submitted: false,
      isCorrect: null,
      sourceTitle: sourceTitle || 'Quiz item',
      explanation: String(record.answerText || '').trim() || 'Review the highlighted answer.',
    };
  }

  private mapQuizQuestionType(questionType: string): QuizQuestionType {
    const value = String(questionType || '').toLowerCase();
    if (value.includes('root') || value.includes('part')) {
      return 'root';
    }
    if (value.includes('family') || value.includes('belongs') || value.includes('contains')) {
      return 'family';
    }
    if (value.includes('literal')) {
      return 'literal';
    }
    return 'meaning';
  }

  private async buildQuizDeck(
    type: QuizBankType,
    difficulty: number,
    targetCount: number
  ): Promise<QuizQuestion[]> {
    this.quizAttemptCounter += 1;
    if (type === 'confident') {
      return this.buildConfidentQuizDeck(difficulty, targetCount);
    }

    const bank = await this.loadQuizBank(type);
    if (!bank) {
      return [];
    }

    const eligible = bank.questions.filter((question) => {
      const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(Number(question.difficulty || question.level || 1))));
      return normalizedDifficulty === difficulty;
    });
    const target = Math.min(50, Math.max(5, Math.floor(targetCount / 5) * 5));
    const source = eligible.length >= target ? eligible : bank.questions;
    const selected = this.shuffle(source).slice(0, target);

    return selected
      .map((record, index) => this.normalizeQuizQuestion(record, index))
      .filter((question): question is QuizQuestion => question !== null);
  }

  private buildQuestionOptions(correct: string, distractors: string[]): { options: string[]; correctIndex: number } | null {
    const safeCorrect = String(correct || '').trim();
    if (!safeCorrect) {
      return null;
    }

    const uniqueDistractors = this.uniqueStrings(distractors).filter((item) => item !== safeCorrect);
    if (uniqueDistractors.length < 3) {
      return null;
    }

    const options = this.shuffle([safeCorrect, ...this.shuffle(uniqueDistractors).slice(0, 3)]);
    const correctIndex = options.indexOf(safeCorrect);
    return { options, correctIndex };
  }

  private createConfidentQuestion(
    sourceTitle: string,
    prompt: string,
    correct: string,
    distractors: string[],
    type: QuizQuestionType,
    explanation: string
  ): QuizQuestion | null {
    const safeCorrect = String(correct || '').trim();
    if (!safeCorrect || !prompt.trim()) {
      return null;
    }

    const options = this.buildQuestionOptions(safeCorrect, distractors);
    if (!options) {
      return null;
    }

    return {
      id: `confident-${this.quizAttemptCounter}-${this.quizQuestions().length}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      prompt: prompt.trim(),
      options: options.options,
      correctIndex: options.correctIndex,
      selectedIndex: null,
      skipped: false,
      submitted: false,
      isCorrect: null,
      sourceTitle: sourceTitle || 'Confident word',
      explanation: explanation.trim() || 'Review the answer from your confident words.',
    };
  }

  private async buildConfidentQuizDeck(difficulty: number, targetCount: number): Promise<QuizQuestion[]> {
    await this.loadConfidentWordsFromServer();

    const analyses = this.shuffle(
      this.confidentWords()
        .map((item) => item.analysis)
        .filter((item) => !this.isEmptyAnalysis(item))
    );
    if (!analyses.length) {
      return [];
    }

    const titles = this.uniqueStrings(
      analyses.map((analysis) => analysis.title || analysis.query).filter((value): value is string => Boolean(value))
    );
    const meanings = this.uniqueStrings(
      analyses
        .map((analysis) => analysis.actualMeaning || analysis.summary || analysis.literalMeaning)
        .filter((value): value is string => Boolean(value))
    );
    const formulas = this.uniqueStrings(
      analyses
        .map((analysis) => analysis.literalMeaningFormula || analysis.literalMeaning)
        .filter((value): value is string => Boolean(value))
    );
    const breakdownMeanings = this.uniqueStrings(
      analyses.flatMap((analysis) => analysis.breakdown.map((part) => part.meaning).filter(Boolean))
    );
    const familyTerms = this.uniqueStrings(
      analyses.flatMap((analysis) => analysis.familyMemory.map((item) => item.term).filter(Boolean))
    );
    const rootMeanings = this.uniqueStrings(
      analyses
        .map((analysis) => analysis.rootFamily.meaning)
        .filter((value): value is string => Boolean(value))
    );
    const fallbackPool = this.uniqueStrings([
      ...titles,
      ...meanings,
      ...formulas,
      ...breakdownMeanings,
      ...familyTerms,
      ...rootMeanings,
    ]);

    const candidates: QuizQuestion[] = [];
    for (const analysis of analyses) {
      const sourceTitle = analysis.title || analysis.query || 'Confident word';
      const explanation = analysis.actualMeaning || analysis.summary || analysis.literalMeaning || sourceTitle;

      if (difficulty >= 1) {
        const correctMeaning = analysis.actualMeaning || analysis.summary || analysis.literalMeaning;
        if (correctMeaning) {
          const distractors = fallbackPool.filter((item) => item !== correctMeaning);
          const question = this.createConfidentQuestion(
            sourceTitle,
            `What does ${sourceTitle} mean?`,
            correctMeaning,
            distractors,
            'meaning',
            explanation
          );
          if (question) {
            candidates.push(question);
          }
        }
      }

      if (difficulty >= 2) {
        const formula = analysis.literalMeaningFormula || analysis.literalMeaning;
        if (formula) {
          const distractors = fallbackPool.filter((item) => item !== formula);
          const question = this.createConfidentQuestion(
            sourceTitle,
            `Which literal formula fits ${sourceTitle}?`,
            formula,
            distractors,
            'literal',
            analysis.literalMeaningArrow || explanation
          );
          if (question) {
            candidates.push(question);
          }
        }
      }

      if (difficulty >= 3) {
        for (const part of analysis.breakdown) {
          const prompt = `What does ${part.label} mean in ${sourceTitle}?`;
          const distractors = fallbackPool.filter((item) => item !== part.meaning);
          const question = this.createConfidentQuestion(
            sourceTitle,
            prompt,
            part.meaning,
            distractors,
            'root',
            part.source || explanation
          );
          if (question) {
            candidates.push(question);
          }
        }
      }

      if (difficulty >= 4) {
        for (const item of analysis.familyMemory) {
          const prompt = `Which word belongs to the ${analysis.rootFamily.root || sourceTitle} family?`;
          const distractors = fallbackPool.filter((value) => value !== item.term);
          const question = this.createConfidentQuestion(
            sourceTitle,
            prompt,
            item.term,
            distractors,
            'family',
            item.exampleSentence || item.meaning || explanation
          );
          if (question) {
            candidates.push(question);
          }
        }
      }

      if (difficulty >= 5 && analysis.rootFamily.root && analysis.rootFamily.meaning) {
        const prompt = `What does the root ${analysis.rootFamily.root} mean?`;
        const distractors = fallbackPool.filter((value) => value !== analysis.rootFamily.meaning);
        const question = this.createConfidentQuestion(
          sourceTitle,
          prompt,
          analysis.rootFamily.meaning,
          distractors,
          'root',
          analysis.rootFamily.origin || explanation
        );
        if (question) {
          candidates.push(question);
        }
      }
    }

    return this.shuffle(candidates).slice(0, Math.min(50, Math.max(5, Math.floor(targetCount / 5) * 5)) || candidates.length);
  }

  private startQuizTimer(): void {
    this.stopQuizTimer();
    this.quizTimerHandle = window.setInterval(() => {
      if (this.quizFlowStage() !== 'taking') {
        this.stopQuizTimer();
        return;
      }

      const next = Math.max(0, this.quizTimeRemaining() - 1);
      this.quizTimeRemaining.set(next);
      if (next === 0) {
        void this.submitQuizAttempt();
      }
    }, 1000);
  }

  private stopQuizTimer(): void {
    if (this.quizTimerHandle !== null) {
      window.clearInterval(this.quizTimerHandle);
      this.quizTimerHandle = null;
    }
  }

  private quizDraftStorageKey(profile = this.profile()): string {
    const identity =
      profile?.google.sub ||
      profile?.google.email ||
      this.googleIdentity()?.sub ||
      this.googleIdentity()?.email ||
      'anonymous';
    return `${this.quizDraftPrefix}:${identity}`;
  }

  private persistQuizDraft(showFeedback: boolean): boolean {
    const profile = this.profile();
    const questions = this.quizQuestions();
    if (!profile || !questions.length || this.quizFlowStage() !== 'taking') {
      return false;
    }

    const draft: QuizDraftState = {
      quizType: this.quizType(),
      quizDifficulty: this.quizDifficulty(),
      quizQuestionTarget: this.quizQuestionTarget(),
      quizIndex: this.quizIndex(),
      quizTimeRemaining: this.quizTimeRemaining(),
      quizFlowStage: this.quizFlowStage(),
      questions,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(this.quizDraftStorageKey(profile), JSON.stringify(draft));
      if (showFeedback) {
        this.quizNotice.set('Answer saved locally on this device.');
      }
      return true;
    } catch {
      if (showFeedback) {
        this.quizNotice.set('Your answer could not be saved locally right now.');
      }
      return false;
    }
  }

  private clearQuizDraftLocally(): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    try {
      localStorage.removeItem(this.quizDraftStorageKey(profile));
    } catch {
      return;
    }
  }

  private loadQuizDraftLocally(): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    try {
      const raw = localStorage.getItem(this.quizDraftStorageKey(profile));
      if (!raw) {
        return;
      }

      const draft = JSON.parse(raw) as Partial<QuizDraftState> | null;
      if (!draft || !Array.isArray(draft.questions) || !draft.questions.length) {
        return;
      }

      const questions = draft.questions
        .map((question) => {
          if (!question || typeof question !== 'object') {
            return null;
          }

          const entry = question as QuizQuestion;
          return {
            ...entry,
            options: Array.isArray(entry.options)
              ? entry.options.filter((option): option is string => typeof option === 'string')
              : [],
          } satisfies QuizQuestion;
        })
        .filter((question): question is QuizQuestion => question !== null);

      if (!questions.length) {
        return;
      }

      this.quizType.set((draft.quizType as QuizBankType) || 'word');
      this.quizDifficulty.set(Math.min(5, Math.max(1, Math.floor(Number(draft.quizDifficulty || 1)))));
      this.quizQuestionTarget.set(Math.min(50, Math.max(5, Math.floor(Number(draft.quizQuestionTarget || 50)))));
      this.quizIndex.set(Math.min(Math.max(0, Math.floor(Number(draft.quizIndex || 0))), Math.max(0, questions.length - 1)));
      this.quizTimeRemaining.set(Math.max(0, Math.floor(Number(draft.quizTimeRemaining || 0))));
      this.quizQuestions.set(questions);
      this.quizFlowStage.set(
        draft.quizFlowStage === 'summary' ? 'summary' : questions.length ? 'taking' : 'setup'
      );
      if (this.quizFlowStage() === 'taking') {
        this.quizNotice.set('Loaded your saved quiz draft on this device.');
      }

      if (this.quizFlowStage() === 'taking') {
        this.stopQuizTimer();
        this.startQuizTimer();
      }
    } catch {
      return;
    }
  }

  private async loadQuizHistoryFromServer(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      this.quizHistory.set([]);
      return;
    }

    try {
      this.quizHistoryLoading.set(true);
      this.quizHistoryError.set('');
      const params = new URLSearchParams();
      if (profile.google.sub) {
        params.set('sub', profile.google.sub);
      }
      if (profile.google.email) {
        params.set('email', profile.google.email);
      }

      const response = await fetch(`${getApiBaseUrl()}/quiz-history?${params.toString()}`);
      if (!response.ok) {
        this.quizHistory.set([]);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { items?: Partial<QuizHistoryEntry>[] } | null;
      const history: QuizHistoryEntry[] = [];
      for (const item of payload?.items ?? []) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const entry = item as Partial<QuizHistoryEntry>;
        const time = String(entry.time || '').trim();
        const playerName = String(entry.playerName || '').trim();
        const playerEmail = String(entry.playerEmail || '').trim();
        const country = String(entry.country || '').trim();
        const quizScope = String(entry.quizScope || '').trim();
        const marks = Number(entry.marks || 0);
        const percentage = Number(entry.percentage || 0);
        const total = Number(entry.total || 0);
        const correct = Number(entry.correct || 0);
        const wrong = Number(entry.wrong || 0);
        const quizType = String(entry.quizType || '').trim();
        const difficulty = Number(entry.difficulty || 0);
        const questionCount = Number(entry.questionCount || 0);
        const timeLimitMinutes = Number(entry.timeLimitMinutes || 0);
        const timeSpentSeconds = Number(entry.timeSpentSeconds || 0);
        const questions = Array.isArray((entry as { questions?: unknown }).questions)
          ? (((entry as { questions?: QuizAttemptQuestion[] }).questions ?? []).map((question) => ({
              ...question,
              options: Array.isArray(question?.options) ? question.options : [],
            })) as QuizAttemptQuestion[])
          : [];

        if (!time || !playerName || !playerEmail) {
          continue;
        }

        history.push({
          id: String(entry.id || `${time}-${playerEmail}`).trim(),
          time,
          playerName,
          playerEmail,
          country,
          quizScope,
          correct,
          wrong,
          marks,
          percentage,
          total,
          quizType,
          difficulty,
          questionCount,
          timeLimitMinutes,
          timeSpentSeconds,
          questions,
          bucketObjectName: String((entry as { bucketObjectName?: string }).bucketObjectName || '').trim(),
          bucketUri: String((entry as { bucketUri?: string }).bucketUri || '').trim(),
        });
      }

      history.sort((a, b) => b.time.localeCompare(a.time));

      this.quizHistory.set(history);
      if (history.length && !history.some((item) => item.id === this.selectedQuizHistoryId())) {
        this.selectedQuizHistoryId.set(history[0]!.id);
      }
    } catch {
      this.quizHistory.set([]);
      this.quizHistoryError.set('Quiz history could not be loaded.');
    } finally {
      this.quizHistoryLoading.set(false);
    }
  }

  private confidentKey(query: string, mode: string): string {
    return `${this.normalizeForMatch(query)}|${this.normalizeForMatch(mode || 'word')}`;
  }

  private needsFocusKey(query: string, mode: string): string {
    return `${this.normalizeForMatch(query)}|${this.normalizeForMatch(mode || 'word')}`;
  }

  private normalizeConfidentEntry(item: unknown): ConfidentWordEntry | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const entry = item as { [key: string]: unknown };
    const rawAnalysis =
      entry['analysis'] && typeof entry['analysis'] === 'object' ? (entry['analysis'] as unknown) : entry;
    const rawAnalysisRecord = rawAnalysis as { [key: string]: unknown };
    const query = String(entry['query'] || rawAnalysisRecord['query'] || '').trim();
    const mode = String(entry['mode'] || rawAnalysisRecord['mode'] || 'word').trim() || 'word';
    const analysis = this.normalizeAnalysisResult(rawAnalysis, query);
    if (!query || this.isEmptyAnalysis(analysis)) {
      return null;
    }

    const player = entry['player'] && typeof entry['player'] === 'object' ? (entry['player'] as { [key: string]: unknown }) : {};

    return {
      id: String(entry['id'] || `${query}-${mode}`).trim(),
      time: String(entry['time'] || entry['updatedAt'] || entry['createdAt'] || '').trim(),
      query,
      mode,
      title: String(entry['title'] || analysis.title || query).trim(),
      playerName: String(entry['playerName'] || '').trim() || `${String(player['firstName'] || '').trim()} ${String(player['lastName'] || '').trim()}`.trim(),
      playerEmail: String(entry['playerEmail'] || '').trim() || String(player['email'] || '').trim(),
      country: String(entry['country'] || '').trim() || String(player['country'] || '').trim(),
      analysis,
      bucketObjectName: String(entry['bucketObjectName'] || '').trim() || undefined,
      bucketUri: String(entry['bucketUri'] || '').trim() || undefined,
    };
  }

  private async loadConfidentWordsFromServer(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      this.confidentWords.set([]);
      return;
    }

    if (this.confidentWordsLoadPromise) {
      await this.confidentWordsLoadPromise;
      return;
    }

    this.confidentWordsLoadPromise = (async () => {
      try {
        this.confidentWordsLoading.set(true);
        this.confidentWordsError.set('');
        const params = new URLSearchParams();
        if (profile.google.sub) {
          params.set('sub', profile.google.sub);
        }
        if (profile.google.email) {
          params.set('email', profile.google.email);
        }

        const response = await fetch(`${getApiBaseUrl()}/confident-words?${params.toString()}`);
        if (!response.ok) {
          this.confidentWords.set([]);
          return;
        }

        const payload = (await response.json().catch(() => null)) as { items?: unknown[] } | null;
        const entries = (payload?.items ?? [])
          .map((item) => this.normalizeConfidentEntry(item))
          .filter((item): item is ConfidentWordEntry => item !== null)
          .sort((a, b) => b.time.localeCompare(a.time));

        this.confidentWords.set(entries);
      } catch {
        this.confidentWords.set([]);
        this.confidentWordsError.set('Confident words could not be loaded.');
      } finally {
        this.confidentWordsLoading.set(false);
        this.confidentWordsLoadPromise = null;
      }
    })();

    await this.confidentWordsLoadPromise;
  }

  private normalizeNeedsFocusEntry(item: unknown): NeedsFocusWordEntry | null {
    const normalized = this.normalizeConfidentEntry(item);
    return normalized;
  }

  private buildHistoryQuestionAnalysis(question: QuizAttemptQuestion | null): AnalysisResult | null {
    if (!question) {
      return null;
    }

    const query = String(question.sourceQuery || question.sourceTitle || question.correctText || '').trim();
    const title = String(question.sourceTitle || query || question.correctText || '').trim();
    const prompt = String(question.prompt || '').trim();
    const correctText = String(question.correctText || question.selectedText || '').trim();
    const summary = prompt || correctText || title || query;
    if (!query && !title && !summary && !correctText) {
      return null;
    }

    return {
      ...EMPTY_ANALYSIS,
      query: query || title || summary,
      mode: String(question.sourceMode || 'word').trim() || 'word',
      title: title || query || summary || 'Quiz question',
      summary,
      literalMeaningFormula: '',
      literalMeaningArrow: '',
      literalMeaning: correctText || summary,
      actualMeaning: correctText || summary,
      rootFamily: {
        root: '',
        meaning: '',
        origin: '',
      },
      notes: [],
    };
  }

  private async loadNeedsFocusWordsFromServer(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      this.needsFocusWords.set([]);
      return;
    }

    if (this.needsFocusWordsLoadPromise) {
      await this.needsFocusWordsLoadPromise;
      return;
    }

    this.needsFocusWordsLoadPromise = (async () => {
      try {
        this.needsFocusWordsLoading.set(true);
        this.needsFocusWordsError.set('');
        const params = new URLSearchParams();
        if (profile.google.sub) {
          params.set('sub', profile.google.sub);
        }
        if (profile.google.email) {
          params.set('email', profile.google.email);
        }

        const response = await fetch(`${getApiBaseUrl()}/needs-focus-words?${params.toString()}`);
        if (!response.ok) {
          this.needsFocusWords.set([]);
          return;
        }

        const payload = (await response.json().catch(() => null)) as { items?: unknown[] } | null;
        const entries = (payload?.items ?? [])
          .map((item) => this.normalizeNeedsFocusEntry(item))
          .filter((item): item is NeedsFocusWordEntry => item !== null)
          .sort((a, b) => b.time.localeCompare(a.time));

        this.needsFocusWords.set(entries);
      } catch {
        this.needsFocusWords.set([]);
        this.needsFocusWordsError.set('Needs Focus words could not be loaded.');
      } finally {
        this.needsFocusWordsLoading.set(false);
        this.needsFocusWordsLoadPromise = null;
      }
    })();

    await this.needsFocusWordsLoadPromise;
  }

  private normalizeAnalysisResult(payload: unknown, query: string): AnalysisResult {
    const text = (value: unknown): string => {
      if (typeof value !== 'string') {
        return '';
      }

      const cleaned = value.trim();
      if (!cleaned || cleaned.startsWith('{') || cleaned.startsWith('[')) {
        return '';
      }

      return cleaned;
    };

    const list = <T>(value: unknown, mapper: (item: unknown) => T | null): T[] => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value.map(mapper).filter((item): item is T => item !== null);
    };

    const data: any = payload && typeof payload === 'object' ? payload : {};

    const breakdown = list(data.breakdown, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const entry: any = item;
      const label = text(entry.label);
      const meaning = text(entry.meaning);
      if (!label || !meaning) {
        return null;
      }

      return {
        index: typeof entry.index === 'number' ? entry.index : undefined,
        label,
        type: text(entry.type),
        meaning,
        source: text(entry.source),
        otherExamples: list(entry.otherExamples, (example) => text(example)).filter(Boolean),
      };
    });

    const wordFamily = list(data.wordFamily ?? data.relatedWords, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const entry: any = item;
      const word = text(entry.word);
      const meaning = text(entry.meaning);
      if (!word || !meaning) {
        return null;
      }

      return {
        word,
        meaning,
        breakdown: list(entry.breakdown, (part) => {
          if (!part || typeof part !== 'object') {
            return null;
          }

          const partEntry: any = part;
          const label = text(partEntry.label);
          const meaningText = text(partEntry.meaning);
          if (!label || !meaningText) {
            return null;
          }

          return {
            index: typeof partEntry.index === 'number' ? partEntry.index : undefined,
            label,
            type: text(partEntry.type),
            meaning: meaningText,
            source: text(partEntry.source),
            otherExamples: list(partEntry.otherExamples, (example) => text(example)).filter(Boolean),
          };
        }),
        exampleSentence: text(entry.exampleSentence),
      };
    });

    const otherWords = list(data.otherWords, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const entry: any = item;
      const words = list(entry.words, (word) => {
        if (!word || typeof word !== 'object') {
          return null;
        }

        const wordEntry: any = word;
        const wordLabel = text(wordEntry.word);
        const wordMeaning = text(wordEntry.meaning);
        if (!wordLabel || !wordMeaning) {
          return null;
        }

        return {
          word: wordLabel,
          meaning: wordMeaning,
        };
      });

      if (!text(entry.title) || !text(entry.focus) || !words.length) {
        return null;
      }

      return {
        title: text(entry.title),
        focus: text(entry.focus),
        words,
      };
    });

    const relatedWords = list(data.relatedWords, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const entry: any = item;
      const word = text(entry.word);
      const meaning = text(entry.meaning);
      if (!word || !meaning) {
        return null;
      }

      return {
        word,
        breakdown: text(entry.breakdown),
        meaning,
        explanation: text(entry.explanation),
        exampleSentence: text(entry.exampleSentence),
      };
    });

    const familyMemory = list(data.familyMemory, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const entry: any = item;
      const term = text(entry.term);
      const meaning = text(entry.meaning);
      if (!term || !meaning) {
        return null;
      }

      return {
        term,
        meaning,
        exampleSentence: text(entry.exampleSentence),
      };
    });

    const slideNumber = typeof data.slideNumber === 'number' ? data.slideNumber : null;
    const rootFamily: any =
      data.rootFamily && typeof data.rootFamily === 'object' ? data.rootFamily : {};

    return {
      query: text(data.query) || query,
      mode: ['word', 'root', 'prefix', 'suffix'].includes(text(data.mode)) ? text(data.mode) : 'word',
      title: text(data.title),
      summary: text(data.summary),
      literalMeaningFormula: text(data.literalMeaningFormula),
      literalMeaningArrow: text(data.literalMeaningArrow),
      literalMeaning: text(data.literalMeaning),
      actualMeaning: text(data.actualMeaning),
      breakdown,
      wordFamily,
      otherWords,
      relatedWords,
      slideNumber,
      rootFamily: {
        root: text(rootFamily.root),
        meaning: text(rootFamily.meaning),
        origin: text(rootFamily.origin),
      },
      familyMemory,
      notes: list(data.notes, (item) => text(item)).filter(Boolean),
    };
  }

  private mergeAnalysisResult(primary: AnalysisResult, fallback: AnalysisResult): AnalysisResult {
    const mergeStrings = (current: string, backup: string): string => current || backup;
    const mergeObject = (
      current: RootFamily,
      backup: RootFamily
    ): RootFamily => ({
      root: mergeStrings(current.root, backup.root),
      meaning: mergeStrings(current.meaning, backup.meaning),
      origin: mergeStrings(current.origin, backup.origin),
    });

    const mergeLists = <T>(current: T[], backup: T[]): T[] => (current.length ? current : backup);
    const mergeWordFamilies = (
      current: WordFamilyItem[],
      backup: WordFamilyItem[]
    ): WordFamilyItem[] => {
      if (!backup.length) {
        return current;
      }

      const fallbackMap = new Map(
        backup.map((item) => [item.word.trim().toLowerCase(), item] as const)
      );

      const mergedCurrent = current.map((item) => {
        const fallback = fallbackMap.get(item.word.trim().toLowerCase());
        if (!fallback) {
          return item;
        }

        return {
          word: mergeStrings(item.word, fallback.word),
          meaning: mergeStrings(item.meaning, fallback.meaning),
          breakdown: item.breakdown?.length ? item.breakdown : fallback.breakdown,
          exampleSentence: mergeStrings(item.exampleSentence || '', fallback.exampleSentence || ''),
        };
      });

      const currentKeys = new Set(mergedCurrent.map((item) => item.word.trim().toLowerCase()));
      const extras = backup.filter(
        (item) => !currentKeys.has(item.word.trim().toLowerCase())
      );

      return mergedCurrent.length ? [...mergedCurrent, ...extras] : backup;
    };

    return {
      query: mergeStrings(primary.query, fallback.query),
      mode: mergeStrings(primary.mode, fallback.mode),
      title: mergeStrings(primary.title, fallback.title),
      summary: mergeStrings(primary.summary, fallback.summary),
      literalMeaningFormula: mergeStrings(primary.literalMeaningFormula, fallback.literalMeaningFormula),
      literalMeaningArrow: mergeStrings(primary.literalMeaningArrow, fallback.literalMeaningArrow),
      literalMeaning: mergeStrings(primary.literalMeaning, fallback.literalMeaning),
      actualMeaning: mergeStrings(primary.actualMeaning, fallback.actualMeaning),
      breakdown: mergeLists(primary.breakdown, fallback.breakdown),
      wordFamily: mergeWordFamilies(primary.wordFamily, fallback.wordFamily),
      otherWords: mergeLists(primary.otherWords, fallback.otherWords),
      relatedWords: mergeLists(primary.relatedWords, fallback.relatedWords),
      slideNumber: primary.slideNumber ?? fallback.slideNumber,
      rootFamily: mergeObject(primary.rootFamily, fallback.rootFamily),
      familyMemory: mergeLists(primary.familyMemory, fallback.familyMemory),
      notes: mergeLists(primary.notes, fallback.notes),
    };
  }

  private hydrateFromInventory(query: string, result: AnalysisResult): AnalysisResult {
    const inventory = this.inventoryIndex.get(query.trim().toLowerCase());
    if (!inventory || typeof inventory !== 'object') {
      return result;
    }

    const fallback = this.normalizeAnalysisResult(inventory, query);
    return this.mergeAnalysisResult(result, fallback);
  }

  private isEmptyAnalysis(result: AnalysisResult | null): boolean {
    if (!result) {
      return true;
    }

    return (
      !result.title &&
      !result.summary &&
      !result.literalMeaning &&
      !result.literalMeaningFormula &&
      !result.literalMeaningArrow &&
      !result.actualMeaning &&
      !result.breakdown.length &&
      !result.wordFamily.length &&
      !result.otherWords.length &&
      !result.relatedWords.length &&
      !result.familyMemory.length &&
      !result.notes.length &&
      !result.rootFamily.root &&
      !result.rootFamily.meaning &&
      !result.rootFamily.origin
    );
  }

  protected async analyze(): Promise<void> {
    const normalized = this.query().trim().toLowerCase();

    if (!normalized) {
      this.error.set('Enter a word or root to continue.');
      this.notice.set('');
      this.result.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    this.confidentWordNotice.set('');

    try {
      if (this.inventoryLoadPromise) {
        await this.inventoryLoadPromise;
      }

      const inventoryHit = this.inventoryIndex.get(normalized);
      if (inventoryHit && typeof inventoryHit === 'object') {
        const analysis = this.normalizeAnalysisResult(inventoryHit, normalized);
        if (this.isEmptyAnalysis(analysis)) {
          this.result.set(null);
          this.notice.set(`I’m not aware of "${normalized}" yet. Try another word or root.`);
          return;
        }

        this.result.set(analysis);
        return;
      }

      const response = await fetch(`${getApiBaseUrl()}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: normalized,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: string }
          | null;
        throw new Error(
          payload?.details || payload?.error || `Request failed with status ${response.status}`
        );
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      const analysis = this.hydrateFromInventory(
        normalized,
        this.normalizeAnalysisResult(payload, normalized)
      );
      if (this.isEmptyAnalysis(analysis)) {
        this.result.set(null);
        this.notice.set(`I’m not aware of "${normalized}" yet. Try another word or root.`);
        return;
      }

      this.result.set(analysis);
      return;
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Unable to reach the backend.';
      this.result.set(null);
      this.notice.set('');
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  protected chooseAutocomplete(value: string): void {
    this.query.set(value);
    this.autocompleteOpen.set(false);
  }

  protected openAutocomplete(): void {
    this.autocompleteOpen.set(true);
  }

  protected closeAutocomplete(): void {
    this.autocompleteOpen.set(false);
  }
}
