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
}

interface QuizAttemptQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  sourceTitle: string;
  selectedIndex: number | null;
  selectedText: string;
  correctIndex: number;
  correctText: string;
  submitted: boolean;
  isCorrect: boolean | null;
}

type QuizBankType = 'word' | 'root_prefix_suffix' | 'mixed';
type QuizFlowStage = 'setup' | 'taking' | 'summary';

type BreakdownRow = AnalysisPart[];
type AppTab = 'search' | 'experiment' | 'quiz';
type AuthStage = 'home' | 'loading' | 'profile' | 'app';
type QuizQuestionType = 'meaning' | 'root' | 'family' | 'literal';

interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
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
  status: 'correct' | 'wrong';
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
  protected readonly quizHistoryLoading = signal(false);
  protected readonly quizHistorySubmitting = signal(false);
  protected readonly quizHistorySaved = signal(false);
  protected readonly quizHistoryError = signal('');
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
      default:
        return 'Words quiz';
    }
  });
  protected readonly quizDifficultyLabel = computed(() => `Level ${this.quizDifficulty()}`);
  private inventoryIndex = new Map<string, unknown>();
  private inventoryLoadPromise: Promise<void> | null = null;
  private quizBankLoadPromise: Promise<void> | null = null;
  private quizBankCache = new Map<QuizBankType, QuizBankFile>();
  private quizTimerHandle: number | null = null;
  private readonly profileStorageKey = 'etymobreak-profile';
  private readonly pendingGoogleStorageKey = 'etymobreak-google-identity';
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
  protected readonly experimentSlides = computed(() => {
    const letter = this.experimentLetter().trim().toLowerCase();
    if (!letter) {
      return [];
    }

    const filtered = this.inventoryEntries()
      .filter((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const entry: any = item;
        const query = String(entry.query || '').trim().toLowerCase();
        return query.startsWith(letter);
      })
      .map((item) => {
        const entry: any = item;
        const query = String(entry.query || '').trim().toLowerCase();
        return this.normalizeAnalysisResult(item, query);
      })
      .filter((item) => !this.isEmptyAnalysis(item));

    return filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  });
  protected readonly experimentSlide = computed(() => {
    const slides = this.experimentSlides();
    if (!slides.length) {
      return null;
    }

    const index = Math.min(Math.max(this.experimentIndex(), 0), slides.length - 1);
    return slides[index] ?? null;
  });
  protected readonly experimentSlideCount = computed(() => this.experimentSlides().length);
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
    this.quizQuestions().filter((question) => question.submitted && question.isCorrect === false).length
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
      const userAnswerLabel = selectedText || 'Unanswered';
      const isCorrect = selectedIndex !== null && selectedIndex === question.correctIndex;
      return {
        ...question,
        userAnswer: selectedText,
        userAnswerLabel,
        correctAnswerLabel: correctText,
        status: isCorrect ? 'correct' : 'wrong',
      };
    })
  );
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
  }

  protected setProfileMenuView(view: 'profile' | 'history'): void {
    this.profileMenuView.set(view);
    if (view === 'history') {
      void this.loadQuizHistoryFromServer();
    }
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
    this.activeTab.set('experiment');
  }

  protected selectQuizType(type: QuizBankType): void {
    this.quizType.set(type);
  }

  protected selectQuizDifficulty(level: number): void {
    this.quizDifficulty.set(Math.min(5, Math.max(1, Math.floor(level))));
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

    const deck = await this.buildQuizDeck(this.quizType(), this.quizDifficulty());
    if (!deck.length) {
      this.quizFlowStage.set('setup');
      this.quizNotice.set('That quiz bank could not be loaded yet. Please try again in a moment.');
      this.quizPreparing.set(false);
      return;
    }

    this.quizQuestions.set(deck);
    this.quizFlowStage.set('taking');
    this.quizPreparing.set(false);
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
    };
    this.quizQuestions.set(updated);
    this.quizNotice.set('');
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
      const isCorrect = question.selectedIndex !== null && question.selectedIndex === question.correctIndex;
      return {
        ...question,
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
      selectedIndex: question.selectedIndex,
      selectedText: question.selectedIndex === null ? '' : question.options[question.selectedIndex] ?? '',
      correctIndex: question.correctIndex,
      correctText: question.options[question.correctIndex] ?? '',
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
    this.quizTimeRemaining.set(25 * 60);
    this.quizPreparing.set(false);
    this.quizNotice.set('');
    this.quizHistorySaved.set(false);
    this.quizHistoryError.set('');
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
      void this.loadQuizHistoryFromServer();
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
      void this.loadQuizHistoryFromServer();
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
      void this.loadQuizHistoryFromServer();

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

  private getInventoryAnalyses(letter = ''): AnalysisResult[] {
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

        return !normalizedLetter || query.startsWith(normalizedLetter);
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
    const cached = this.quizBankCache.get(bankType);
    if (cached) {
      return cached;
    }

    const fileMap: Record<QuizBankType, string> = {
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

  private async buildQuizDeck(type: QuizBankType, difficulty: number): Promise<QuizQuestion[]> {
    this.quizAttemptCounter += 1;
    const bank = await this.loadQuizBank(type);
    if (!bank) {
      return [];
    }

    const eligible = bank.questions.filter((question) => {
      const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(Number(question.difficulty || question.level || 1))));
      return normalizedDifficulty === difficulty;
    });
    const source = eligible.length >= 50 ? eligible : bank.questions;
    const selected = this.shuffle(source).slice(0, 50);

    return selected
      .map((record, index) => this.normalizeQuizQuestion(record, index))
      .filter((question): question is QuizQuestion => question !== null);
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
      const history = (payload?.items ?? [])
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
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

          if (!time || !playerName || !playerEmail) {
            return null;
          }

          return {
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
          };
        })
        .filter((entry): entry is QuizHistoryEntry => entry !== null)
        .sort((a, b) => b.time.localeCompare(a.time));

      this.quizHistory.set(history);
    } catch {
      this.quizHistory.set([]);
      this.quizHistoryError.set('Quiz history could not be loaded.');
    } finally {
      this.quizHistoryLoading.set(false);
    }
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
