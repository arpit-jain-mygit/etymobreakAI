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

interface RootAssembledRoot {
  root: string;
  type: string;
  meaning: string;
  examples?: Array<{
    word: string;
    meaning: string;
  }>;
}

interface RootAssembledWord {
  word: string;
  meaning: string;
  breakdown: string;
  breakdownParts: string[];
  otherRootWords: RootAssembledRoot[];
  exampleSentence?: string;
  slideNumber?: number;
}

interface RootInventoryEntry {
  root: string;
  alternateForms: string[];
  type: string;
  meaning: string;
  origin: string;
  source: string;
  exampleSentence: string;
  assembledWords: RootAssembledWord[];
  familyMemory: FamilyMemoryItem[];
  slideNumbers: number[];
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
  root?: string;
  rootMeaning?: string;
  explanation?: string;
  options: string[];
  selectedIndex: number | null;
  selectedText: string;
  correctIndex: number;
  correctText: string;
  skipped: boolean;
  submitted: boolean;
  isCorrect: boolean | null;
}

type QuizBankType =
  | 'root'
  | 'revision'
  | 'word'
  | 'root_prefix_suffix'
  | 'mixed'
  | 'confident'
  | 'needs_focus';
type QuizFlowStage = 'setup' | 'taking' | 'summary';
type QuizReviewFilter = 'all' | 'correct' | 'wrong' | 'skipped' | 'confident' | 'needs_focus';

type BreakdownRow = AnalysisPart[];
type AppTab = 'search' | 'all_words' | 'root_suffix' | 'confident_words' | 'needs_focus_words' | 'quiz' | 'history';
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
  sourceRoot?: string;
  sourceRootMeaning?: string;
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
  parentRoot?: string;
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
  isConfident: boolean;
  isNeedsFocus: boolean;
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

  protected readonly activeTab = signal<AppTab>('all_words');
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly searchResults = signal<RootInventoryEntry[]>([]);
  protected readonly rootAutocomplete = signal<string[]>([]);
  protected readonly autocompleteOpen = signal(false);
  protected readonly experimentLetter = signal('');
  protected readonly experimentIndex = signal(0);
  protected readonly quizFlowStage = signal<QuizFlowStage>('setup');
  protected readonly quizType = signal<QuizBankType>('mixed');
  protected readonly quizDifficulty = signal(1);
  protected readonly quizQuestionTarget = signal(5);
  protected readonly quizIndex = signal(0);
  protected readonly quizQuestions = signal<QuizQuestion[]>([]);
  protected readonly quizTimeRemaining = signal(25 * 60);
  protected readonly quizPreparing = signal(false);
  protected readonly quizNotice = signal('');
  protected readonly quizDraftPromptOpen = signal(false);
  protected readonly quizDraftPromptMessage = signal('');
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
  protected readonly quizAnswerFeedback = signal<{ type: 'correct' | 'wrong' | null; questionId?: string }>({ type: null });
  protected readonly quizHighestScore = signal(0);
  protected readonly quizIsNewHighScore = signal(false);
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
  protected readonly confidentWordsApiResponse = signal('');
  protected readonly needsFocusWordsLoading = signal(false);
  protected readonly needsFocusWordsSaving = signal(false);
  protected readonly needsFocusWordsError = signal('');
  protected readonly needsFocusWordNotice = signal('');
  protected readonly needsFocusWordsApiResponse = signal('');
  protected readonly quizTimeLabel = computed(() => {
    const remaining = Math.max(0, this.quizTimeRemaining());
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  protected readonly quizTypeLabel = computed(() => {
    switch (this.quizType()) {
      case 'confident':
        return 'Confident words quiz';
      case 'needs_focus':
        return 'Needs focus quiz';
      case 'mixed':
      case 'revision':
        return 'Mixed revision quiz';
      default:
        return 'Root quiz';
    }
  });
  protected readonly quizDifficultyLabel = computed(() => `Level ${this.quizDifficulty()}`);
  private inventoryIndex = new Map<string, unknown>();
  private inventoryLoadPromise: Promise<void> | null = null;
  private quizBankLoadPromise: Promise<void> | null = null;
  private rootMasteryQuizBankLoadPromise: Promise<QuizBankFile | null> | null = null;
  private confidentWordsLoadPromise: Promise<void> | null = null;
  private needsFocusWordsLoadPromise: Promise<void> | null = null;
  private quizBankCache = new Map<QuizBankType, QuizBankFile>();
  private rootMasteryQuizBankCache: QuizBankFile | null = null;
  private quizTimerHandle: number | null = null;
  private pendingQuizDraft: QuizDraftState | null = null;
  private readonly profileStorageKey = 'etymobreak-profile';
  private readonly pendingGoogleStorageKey = 'etymobreak-google-identity';
  private readonly quizDraftPrefix = 'etymobreak-quiz-draft';
  private readonly savedWordsCachePrefix = 'etymobreak-saved-words';
  private quizAttemptCounter = 0;
  private confidentWordsLoadedIdentity = '';
  private needsFocusWordsLoadedIdentity = '';
  protected readonly rootInventoryEntries = computed(() => this.getRootInventoryEntries());
  protected readonly rootInventoryCount = computed(() => this.rootInventoryEntries().length);
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
  protected readonly allWordSlides = computed(() => this.getRootInventoryEntries());
  protected readonly rootSuffixSlides = computed(() => this.getRootInventoryEntries());
  protected readonly confidentWordSlides = computed(() =>
    this.getSavedWordAnalyses(this.experimentLetter(), 'confident')
  );
  protected readonly needsFocusWordSlides = computed(() =>
    this.getSavedWordAnalyses(this.experimentLetter(), 'needs_focus')
  );
  protected readonly activeSavedWordAnalyses = computed(() => {
    if (this.activeTab() === 'confident_words') {
      return this.getSavedWordAnalyses('', 'confident');
    }

    if (this.activeTab() === 'needs_focus_words') {
      return this.getSavedWordAnalyses('', 'needs_focus');
    }

    return [];
  });
  protected readonly activeSavedWordEntries = computed(() => {
    if (this.activeTab() === 'confident_words') {
      return this.convertSavedWordsToInventoryEntries(this.confidentWords());
    }

    if (this.activeTab() === 'needs_focus_words') {
      return this.convertSavedWordsToInventoryEntries(this.needsFocusWords());
    }

    return [];
  });
  protected readonly activeWordSlides = computed(() => {
    if (this.query() && this.searchResults().length) {
      return this.searchResults();
    }
    return this.activeTab() === 'root_suffix'
      ? this.rootSuffixSlides()
      : this.activeTab() === 'confident_words' || this.activeTab() === 'needs_focus_words'
        ? this.activeSavedWordEntries()
        : this.allWordSlides();
  });
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
  protected readonly quizSummaryItems = computed<QuizSummaryQuestion[]>(() => {
    const confidentWords = new Set(this.confidentWords().map((w) => w.query.toLowerCase().trim()));
    const needsFocusWords = new Set(this.needsFocusWords().map((w) => w.query.toLowerCase().trim()));
    const questionRoot = (question: QuizQuestion) => (question.sourceRoot || question.sourceTitle || '').toLowerCase().trim();

    return this.quizQuestions().map((question) => {
      const selectedIndex = question.selectedIndex;
      const selectedText = selectedIndex === null ? '' : question.options[selectedIndex] ?? '';
      const correctText = question.options[question.correctIndex] ?? '';
      const isSkipped = question.skipped || selectedIndex === null;
      const userAnswerLabel = isSkipped ? 'Skipped' : selectedText || 'Unanswered';
      const isCorrect = !isSkipped && selectedIndex === question.correctIndex;
      const root = questionRoot(question);

      return {
        ...question,
        userAnswer: selectedText,
        userAnswerLabel,
        correctAnswerLabel: correctText,
        status: isCorrect ? 'correct' : isSkipped ? 'skipped' : 'wrong',
        isConfident: confidentWords.has(root),
        isNeedsFocus: needsFocusWords.has(root),
      };
    });
  });
  protected readonly quizSummaryFilteredItems = computed(() => {
    const filter = this.quizReviewFilter();
    const items = this.quizSummaryItems();
    if (filter === 'all') {
      return items;
    }

    if (filter === 'confident') {
      return items.filter((item) => item.isConfident);
    }

    if (filter === 'needs_focus') {
      return items.filter((item) => item.isNeedsFocus);
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
      confident: items.filter((item) => item.isConfident).length,
      needs_focus: items.filter((item) => item.isNeedsFocus).length,
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
  protected readonly confidentWordsCount = computed(() => this.getSavedWordAnalyses('', 'confident').length);
  protected readonly needsFocusWordsCount = computed(() => this.getSavedWordAnalyses('', 'needs_focus').length);
  protected readonly confidentWordsDisplayCount = computed(() => this.confidentWordsCount());
  protected readonly needsFocusWordsDisplayCount = computed(() => this.needsFocusWordsCount());
  protected readonly selectedQuizHistory = computed(() =>
    this.quizHistory().find((item) => item.id === this.selectedQuizHistoryId()) ?? null
  );
  protected readonly historyReviewFilter = signal<QuizReviewFilter>('all');
  protected readonly historyReviewFilterCounts = computed(() => {
    const questions = this.selectedQuizHistory()?.questions ?? [];
    const result = { all: 0, correct: 0, wrong: 0, skipped: 0, confident: 0, needs_focus: 0 };
    return questions.reduce(
      (counts, question) => {
        const status = this.historyQuestionStatus(question);
        if (status in counts) {
          counts[status as keyof typeof counts] += 1;
        }
        counts.all += 1;
        return counts;
      },
      result
    );
  });
  protected readonly historyReviewFilteredQuestions = computed(() => {
    const filter = this.historyReviewFilter();
    const questions = this.selectedQuizHistory()?.questions ?? [];
    if (filter === 'all') {
      return questions;
    }

    return questions.filter((question) => this.historyQuestionStatus(question) === filter);
  });

  private resolveQuizQuestionTarget(): number {
    const confidentCount = this.confidentWordsDisplayCount();
    const focusCount = this.needsFocusWordsDisplayCount();

    if (confidentCount > 0) {
      return Math.max(5, Math.ceil(confidentCount / 0.8));
    }

    if (focusCount > 0) {
      return Math.max(5, Math.ceil(focusCount / 0.2));
    }

    return 5;
  }

  private buildRootAnalysis(
    root: string,
    meaning = '',
    title = '',
    notes: string[] = []
  ): AnalysisResult | null {
    const normalizedRoot = String(root || '').trim();
    if (!normalizedRoot) {
      return null;
    }

    const normalizedMeaning = String(meaning || '').trim();
    const normalizedTitle = String(title || normalizedRoot).trim() || normalizedRoot;
    const summary = normalizedMeaning ? `${normalizedTitle} = ${normalizedMeaning}` : normalizedTitle;

    return {
      ...EMPTY_ANALYSIS,
      query: normalizedRoot,
      mode: 'root',
      title: normalizedTitle.toUpperCase(),
      summary,
      literalMeaningFormula: '',
      literalMeaningArrow: '',
      literalMeaning: normalizedMeaning,
      actualMeaning: normalizedMeaning || summary,
      breakdown: [],
      wordFamily: [],
      otherWords: [],
      relatedWords: [],
      slideNumber: null,
      rootFamily: {
        root: normalizedRoot,
        meaning: normalizedMeaning,
        origin: '',
      },
      familyMemory: [],
      notes,
    };
  }

  protected rootEntryAnalysis(entry: RootInventoryEntry | null): AnalysisResult | null {
    if (!entry) {
      return null;
    }

    return this.buildRootAnalysis(entry.root, entry.meaning, entry.root, [
      entry.source,
      entry.exampleSentence,
    ].filter(Boolean));
  }

  private findParentRoot(word: string): string {
    // If sourceRoot is explicitly provided, use it as-is (it's already a root)
    // Otherwise, check if the word is an assembled word and find its parent root
    const normalized = word.toLowerCase().trim();
    const entries = this.getRootInventoryEntries();

    // Try to find the word in assembled words
    for (const entry of entries) {
      for (const assembled of entry.assembledWords) {
        if (assembled.word.toLowerCase().trim() === normalized) {
          // Found it as an assembled word, return the parent root
          return entry.root;
        }
      }
    }

    // If not found as assembled word, return as-is (it's a root)
    return word;
  }

  private quizQuestionRootAnalysis(question: QuizQuestion | QuizAttemptQuestion | null): AnalysisResult | null {
    if (!question) {
      return null;
    }

    let root = String((question as { sourceRoot?: string }).sourceRoot || question.sourceTitle || '').trim();
    if (!root) {
      return null;
    }

    // If sourceRoot is not explicitly set, check if sourceTitle is an assembled word
    // and find its parent root instead
    if (!(question as { sourceRoot?: string }).sourceRoot) {
      root = this.findParentRoot(root);
    }

    const meaning = String((question as { sourceRootMeaning?: string }).sourceRootMeaning || '').trim();
    const notes = [question.prompt, question.explanation].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );
    return this.buildRootAnalysis(root, meaning, root, notes);
  }

  protected isRootEntryConfident(entry: RootInventoryEntry | null): boolean {
    return this.isAnalysisConfident(this.rootEntryAnalysis(entry));
  }

  protected isRootEntryNeedsFocus(entry: RootInventoryEntry | null): boolean {
    return this.isAnalysisNeedsFocus(this.rootEntryAnalysis(entry));
  }

  protected async toggleConfidentForRootEntry(entry: RootInventoryEntry | null): Promise<void> {
    await this.toggleConfidentForAnalysis(this.rootEntryAnalysis(entry));
  }

  protected async toggleNeedsFocusForRootEntry(entry: RootInventoryEntry | null): Promise<void> {
    await this.toggleNeedsFocusForAnalysis(this.rootEntryAnalysis(entry));
  }

  protected isQuizQuestionRootConfident(question: QuizQuestion | null): boolean {
    return this.isAnalysisConfident(this.quizQuestionRootAnalysis(question));
  }

  protected isQuizQuestionRootNeedsFocus(question: QuizQuestion | null): boolean {
    return this.isAnalysisNeedsFocus(this.quizQuestionRootAnalysis(question));
  }

  protected async toggleConfidentForQuizQuestion(question: QuizQuestion | null): Promise<void> {
    await this.toggleConfidentForAnalysis(this.quizQuestionRootAnalysis(question));
  }

  protected async toggleNeedsFocusForQuizQuestion(question: QuizQuestion | null): Promise<void> {
    await this.toggleNeedsFocusForAnalysis(this.quizQuestionRootAnalysis(question));
  }

  protected exportActiveSavedWordsAsPdf(): void {
    const entries = this.activeSavedWordEntries();
    if (!entries.length || typeof window === 'undefined') {
      return;
    }

    const title = this.activeTab() === 'confident_words' ? 'My Confident Words' : 'Words need more Focus';
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(this.buildSavedWordsPdfHtml(title, entries));
    popup.document.close();
    popup.focus();

    const runPrint = (): void => {
      popup.focus();
      popup.print();
    };

    const fontsReady = popup.document.fonts?.ready ?? Promise.resolve();
    fontsReady
      .catch(() => undefined)
      .finally(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(runPrint, 300);
          });
        });
      });

    popup.onafterprint = () => {
      popup.close();
    };
  }

  protected downloadSavedWordsAsCSV(): void {
    const entries = this.activeSavedWordEntries();
    if (!entries.length || typeof window === 'undefined') {
      return;
    }

    // Extract just the root words (one per line)
    const rootWords = entries.map((entry) => entry.root).join('\n');

    // Create blob and download
    const blob = new Blob([rootWords], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const filename =
      this.activeTab() === 'confident_words'
        ? 'confident-words.csv'
        : 'needs-focus-words.csv';

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

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
    void this.loadAuthConfig();
    this.loadStoredProfile();
  }

  public ngAfterViewInit(): void {
    this.tryRenderGoogleButton();
  }

  protected setActiveTab(tab: AppTab, preserveIndex: boolean = false): void {
    this.activeTab.set(tab);
    if (!preserveIndex && (tab === 'all_words' || tab === 'confident_words' || tab === 'needs_focus_words')) {
      this.experimentIndex.set(0);
    }
    if (tab === 'history' && !this.selectedQuizHistoryId() && this.quizHistory().length) {
      this.selectedQuizHistoryId.set(this.quizHistory()[0]!.id);
    }
    if (tab === 'confident_words') {
      void this.loadConfidentWordsFromServer();
    }
    if (tab === 'needs_focus_words') {
      void this.loadNeedsFocusWordsFromServer();
    }
    if (tab === 'quiz') {
      this.quizDraftPromptOpen.set(false);
      this.quizDraftPromptMessage.set('');
      this.pendingQuizDraft = null;
      this.clearQuizDraftLocally();
      this.quizFlowStage.set('setup');
      this.quizQuestions.set([]);
      this.quizIndex.set(0);
      this.quizTimeRemaining.set(25 * 60);
      this.quizPreparing.set(false);
      this.quizHistorySaved.set(false);
      this.quizNotice.set('');
      if (this.quizFlowStage() === 'setup' && this.activeTab() === 'quiz') {
        this.quizQuestionTarget.set(this.resolveQuizQuestionTarget());
      }
    }
  }

  protected confirmQuizDraftDecision(keepDraft: boolean): void {
    const draft = this.pendingQuizDraft;
    this.quizDraftPromptOpen.set(false);
    this.quizDraftPromptMessage.set('');

    if (!draft) {
      return;
    }

    if (!keepDraft) {
      this.clearQuizDraftLocally();
      this.pendingQuizDraft = null;
      this.quizFlowStage.set('setup');
      this.quizQuestions.set([]);
      this.quizIndex.set(0);
      this.quizTimeRemaining.set(25 * 60);
      this.quizPreparing.set(false);
      this.quizQuestionTarget.set(this.resolveQuizQuestionTarget());
      this.quizNotice.set('Started a fresh quiz.');
      return;
    }

    this.pendingQuizDraft = null;
    this.applyQuizDraft(draft);
    this.quizNotice.set('Resumed your saved quiz draft on this device.');
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
    this.pendingQuizDraft = null;
    this.quizDraftPromptOpen.set(false);
    this.quizDraftPromptMessage.set('');
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
    this.confidentWordsLoadedIdentity = '';
    this.needsFocusWords.set([]);
    this.needsFocusWordsError.set('');
    this.needsFocusWordNotice.set('');
    this.needsFocusWordsLoadedIdentity = '';
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
    void this.loadConfidentWordsFromServer();
    void this.loadNeedsFocusWordsFromServer();
  }

  protected setProfileMenuView(view: 'profile' | 'history'): void {
    this.profileMenuView.set(view);
  }

  protected selectQuizHistory(id: string): void {
    this.selectedQuizHistoryId.set(id);
    this.historyReviewFilter.set('all');
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

  private savedWordTime(value: string): number {
    const time = new Date(String(value || '').trim()).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private savedWordIdentity(value: AnalysisResult | ConfidentWordEntry | NeedsFocusWordEntry | null | undefined): string {
    if (!value) {
      return '';
    }

    const analysis = 'analysis' in value ? (value.analysis as AnalysisResult | null) : (value as AnalysisResult);
    const rawValue = value as unknown as Record<string, unknown>;
    const rawAnalysis = analysis as AnalysisResult & { root?: string };
    const root = String(
      rawAnalysis?.rootFamily?.root ||
        rawAnalysis?.query ||
        rawAnalysis?.root ||
        String(rawValue['root'] || '') ||
        String(rawValue['query'] || '') ||
        String(rawValue['title'] || '') ||
        ''
    )
      .trim()
      .toLowerCase();
    return root;
  }

  private savedWordCanonicalState(analysis: AnalysisResult | null): 'confident' | 'needs_focus' | null {
    if (!analysis) {
      return null;
    }

    const identity = this.savedWordIdentity(analysis);
    if (!identity) {
      return null;
    }

    const canonical = this.canonicalSavedWordStates().find((item) => item.identity === identity);
    if (!canonical) {
      return null;
    }

    return canonical.state;
  }

  private canonicalSavedWordStates(): Array<{
    identity: string;
    state: 'confident' | 'needs_focus';
    entry: ConfidentWordEntry;
    time: number;
  }> {
    const chosen = new Map<
      string,
      {
        state: 'confident' | 'needs_focus';
        entry: ConfidentWordEntry;
        time: number;
      }
    >();

    const ingest = (entry: ConfidentWordEntry, state: 'confident' | 'needs_focus'): void => {
      const identity = this.savedWordIdentity(entry);
      if (!identity) {
        return;
      }

      const time = this.savedWordTime(entry.time);
      const existing = chosen.get(identity);
      if (
        !existing ||
        state === 'needs_focus' ||
        (state === existing.state && time > existing.time) ||
        (time > existing.time && existing.state !== 'needs_focus')
      ) {
        chosen.set(identity, { state, entry, time });
      }
    };

    for (const entry of this.confidentWords()) {
      ingest(entry, 'confident');
    }

    for (const entry of this.needsFocusWords()) {
      ingest(entry, 'needs_focus');
    }

    return [...chosen.entries()].map(([identity, value]) => ({
      identity,
      state: value.state,
      entry: value.entry,
      time: value.time,
    }));
  }

  private syncSavedWordBuckets(): void {
    const canonical = this.canonicalSavedWordStates();
    const nextConfident = canonical
      .filter((item) => item.state === 'confident')
      .map((item) => item.entry)
      .sort((a, b) => b.time.localeCompare(a.time));

    const nextNeedsFocus = canonical
      .filter((item) => item.state === 'needs_focus')
      .map((item) => item.entry)
      .sort((a, b) => b.time.localeCompare(a.time));

    this.confidentWords.set(nextConfident);
    this.needsFocusWords.set(nextNeedsFocus);
    this.saveSavedWordsCache('confident', nextConfident);
    this.saveSavedWordsCache('needs_focus', nextNeedsFocus);
  }

  protected isAnalysisConfident(analysis: AnalysisResult | null): boolean {
    return this.savedWordCanonicalState(analysis) === 'confident';
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
        const key = this.savedWordIdentity(entry);
        const next = [entry, ...this.confidentWords().filter((item) => this.savedWordIdentity(item) !== key)];
        this.confidentWords.set(next);
        this.saveSavedWordsCache('confident', next);
        this.confidentWordNotice.set(`${analysis.title || analysis.query} was marked as Confident.`);
        await this.removeNeedsFocusForAnalysis(analysis);
      } else {
        const key = this.savedWordIdentity(analysis);
        const next = this.confidentWords().filter((item) => this.savedWordIdentity(item) !== key);
        this.confidentWords.set(next);
        this.saveSavedWordsCache('confident', next);
        this.confidentWordNotice.set(`${analysis.title || analysis.query} was removed from Confident words.`);
      }

      this.syncSavedWordBuckets();
    } catch (error) {
      this.confidentWordsError.set(error instanceof Error ? error.message : 'Your confident word could not be saved.');
    } finally {
      this.confidentWordsSaving.set(false);
    }
  }

  protected isAnalysisNeedsFocus(analysis: AnalysisResult | null): boolean {
    return this.savedWordCanonicalState(analysis) === 'needs_focus';
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
        const key = this.savedWordIdentity(entry);
        const next = [entry, ...this.needsFocusWords().filter((item) => this.savedWordIdentity(item) !== key)];
        this.needsFocusWords.set(next);
        this.saveSavedWordsCache('needs_focus', next);
        this.needsFocusWordNotice.set(`${analysis.title || analysis.query} was marked as Needs Focus.`);
        await this.removeConfidentForAnalysis(analysis);
      } else {
        const key = this.savedWordIdentity(analysis);
        const next = this.needsFocusWords().filter((item) => this.savedWordIdentity(item) !== key);
        this.needsFocusWords.set(next);
        this.saveSavedWordsCache('needs_focus', next);
        this.needsFocusWordNotice.set(`${analysis.title || analysis.query} was removed from Needs Focus words.`);
      }

      this.syncSavedWordBuckets();
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

      const next = this.confidentWords().filter((item) => this.savedWordIdentity(item) !== this.savedWordIdentity(analysis));
      this.confidentWords.set(next);
      this.saveSavedWordsCache('confident', next);
      this.syncSavedWordBuckets();
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

      const next = this.needsFocusWords().filter((item) => this.savedWordIdentity(item) !== this.savedWordIdentity(analysis));
      this.needsFocusWords.set(next);
      this.saveSavedWordsCache('needs_focus', next);
      this.syncSavedWordBuckets();
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

  protected async startQuiz(): Promise<void> {
    if (this.quizDraftPromptOpen()) {
      return;
    }

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
    await this.loadConfidentWordsFromServer();
    await this.loadNeedsFocusWordsFromServer();
    this.quizQuestionTarget.set(this.resolveQuizQuestionTarget());

    const deck = await this.buildQuizDeck(
      this.quizType(),
      this.quizDifficulty(),
      this.quizQuestionTarget()
    );
    if (!deck.length) {
      this.quizFlowStage.set('setup');
      this.quizNotice.set('Your root deck could not be built yet. Please try again in a moment.');
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
    if (!question || question.selectedIndex !== null) {
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

    // Auto-advance after 2 seconds to let kids see the feedback
    setTimeout(() => {
      this.markCurrentQuestionSubmitted();
    }, 2000);
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

  protected markCurrentQuestionSubmitted(): void {
    const questions = this.quizQuestions();
    const currentIndex = this.quizIndex();
    const question = questions[currentIndex];
    if (!question || question.selectedIndex === null) {
      return;
    }

    const isCorrect = question.selectedIndex === question.correctIndex;
    const updated = [...questions];
    updated[currentIndex] = {
      ...question,
      submitted: true,
      isCorrect,
    };
    this.quizQuestions.set(updated);

    // Auto-advance to next question after animation delay
    setTimeout(() => {
      if (this.quizIndex() < this.quizQuestionCount() - 1) {
        this.nextQuizQuestion();
      }
    }, 2000);
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
      sourceQuery: question.sourceRoot || question.sourceTitle,
      sourceMode: 'root',
      root: question.sourceRoot || question.sourceTitle,
      rootMeaning: question.sourceRootMeaning || '',
      explanation: question.explanation,
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

      // Check if this is a new high score
      const currentScore = marks;
      const highestScore = this.quizHighestScore();
      if (currentScore > highestScore) {
        this.quizHighestScore.set(currentScore);
        this.quizIsNewHighScore.set(true);
        // Reset the flag after animation
        setTimeout(() => this.quizIsNewHighScore.set(false), 5000);
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
    this.quizQuestionTarget.set(this.resolveQuizQuestionTarget());
    this.quizNotice.set('');
    this.quizHistorySaved.set(false);
    this.quizHistoryError.set('');
    this.clearQuizDraftLocally();
    this.pendingQuizDraft = null;
    this.quizDraftPromptOpen.set(false);
    this.quizDraftPromptMessage.set('');
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
      const response = await fetch('/aaptprep_root_centric_final.json');
      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      const roots = this.extractRootInventoryEntries(payload);
      if (!roots.length) {
        return;
      }

      this.inventoryIndex.clear();
      const rootTerms = roots.map((item) => item.root.trim().toLowerCase()).filter(Boolean);

      const enrichedRoots = roots.map((item) => this.enrichRootInventoryEntry(item));
      this.inventoryEntries.set(enrichedRoots as unknown[]);

      for (const item of roots) {
        this.inventoryIndex.set(item.root.trim().toLowerCase(), item);
        for (const assembled of item.assembledWords) {
          this.inventoryIndex.set(assembled.word.trim().toLowerCase(), item);
        }
      }

      this.rootAutocomplete.set([...new Set(rootTerms)]);
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

  private getRootInventoryEntries(): RootInventoryEntry[] {
    return this.inventoryEntries()
      .map((item: unknown) => this.normalizeRootInventoryEntry(item))
      .filter((item: RootInventoryEntry | null): item is RootInventoryEntry => item !== null)
      .sort((a, b) => a.root.localeCompare(b.root, undefined, { sensitivity: 'base' }));
  }

  private extractRootInventoryEntries(payload: unknown): RootInventoryEntry[] {
    const data: any = payload && typeof payload === 'object' ? payload : {};
    const entries: unknown[] = Array.isArray(data.roots) ? data.roots : Array.isArray(payload) ? payload : [];
    return entries
      .map((item: unknown) => this.normalizeRootInventoryEntry(item))
      .filter((item: RootInventoryEntry | null): item is RootInventoryEntry => item !== null);
  }

  private normalizeRootInventoryEntry(item: unknown): RootInventoryEntry | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
    const list = <T>(value: unknown, mapper: (entry: unknown) => T | null): T[] =>
      Array.isArray(value) ? value.map(mapper).filter((entry): entry is T => entry !== null) : [];
    const entry: any = item;

    const assembledWords = list(entry.assembledWords, (word) => {
      if (!word || typeof word !== 'object') {
        return null;
      }

      const wordEntry: any = word;
      const wordLabel = text(wordEntry.word);
      const meaning = text(wordEntry.meaning);
      const breakdown = text(wordEntry.breakdown);
      if (!wordLabel || !meaning) {
        return null;
      }

      return {
        word: wordLabel,
        meaning,
        breakdown,
        breakdownParts: this.parseBreakdownParts(breakdown),
        otherRootWords: list(wordEntry.otherRootWords, (part) => {
          if (!part || typeof part !== 'object') {
            return null;
          }

          const partEntry: any = part;
          const root = text(partEntry.root);
          const type = text(partEntry.type);
          const partMeaning = text(partEntry.meaning);
          if (!root || !type || !partMeaning) {
            return null;
          }

          return {
            root,
            type,
            meaning: partMeaning,
          };
        }),
        exampleSentence: text(wordEntry.exampleSentence),
        slideNumber: typeof wordEntry.slideNumber === 'number' ? wordEntry.slideNumber : undefined,
      };
    });

    const familyMemory = list(entry.familyMemory, (item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const familyEntry: any = item;
      const term = text(familyEntry.term);
      const meaning = text(familyEntry.meaning);
      if (!term || !meaning) {
        return null;
      }

      return {
        term,
        meaning,
        exampleSentence: text(familyEntry.exampleSentence),
      };
    });

    return {
      root: text(entry.root),
      alternateForms: list(entry.alternateForms, (value) => text(value)).filter(Boolean),
      type: text(entry.type),
      meaning: text(entry.meaning),
      origin: text(entry.origin),
      source: text(entry.source),
      exampleSentence: text(entry.exampleSentence),
      assembledWords,
      familyMemory,
      slideNumbers: list(entry.slideNumbers, (value) => (typeof value === 'number' ? value : Number.NaN)).filter(
        (value): value is number => Number.isFinite(value)
      ),
    };
  }

  private enrichRootInventoryEntry(entry: RootInventoryEntry): RootInventoryEntry {
    return {
      ...entry,
      assembledWords: entry.assembledWords.map((word) => this.enrichRootAssembledWord(word)),
    };
  }

  private enrichRootAssembledWord(word: RootAssembledWord): RootAssembledWord {
    return {
      ...word,
      breakdownParts: this.parseBreakdownParts(word.breakdown),
      otherRootWords: word.otherRootWords.map((part) => ({
        ...part,
        examples: this.lookupRootExamples(part.root, word.word),
      })),
    };
  }

  private parseBreakdownParts(breakdown: string): string[] {
    return this.uniqueStrings(
      String(breakdown || '')
        .split('+')
        .map((part) => part.replace(/[-–—]/g, ' ').trim())
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }

  private lookupRootExamples(root: string, excludeWord = ''): Array<{ word: string; meaning: string }> {
    const normalizedRoot = root.trim().toLowerCase();
    if (!normalizedRoot) {
      return [];
    }

    const entry = this.inventoryIndex.get(normalizedRoot);
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const rootEntry = entry as RootInventoryEntry;
    const excluded = excludeWord.trim().toLowerCase();
    const words = rootEntry.assembledWords
      .map((item) => ({
        word: item.word.trim(),
        meaning: item.meaning.trim(),
      }))
      .filter((item) => item.word && item.meaning)
      .filter((item) => item.word.toLowerCase() !== excluded);

    const familyFallback = rootEntry.familyMemory
      .map((item) => ({
        word: item.term.trim(),
        meaning: item.meaning.trim(),
      }))
      .filter((item) => item.word && item.meaning)
      .filter((item) => item.word.toLowerCase() !== excluded);

    return this.uniqueWordMeaningPairs([...words, ...familyFallback]).slice(0, 3);
  }

  private uniqueWordMeaningPairs(items: Array<{ word: string; meaning: string }>): Array<{ word: string; meaning: string }> {
    const seen = new Set<string>();
    const result: Array<{ word: string; meaning: string }> = [];

    for (const item of items) {
      const key = `${item.word.trim().toLowerCase()}|${item.meaning.trim().toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(item);
    }

    return result;
  }

  private getSavedWordAnalyses(letter = '', source: 'confident' | 'needs_focus'): AnalysisResult[] {
    const normalizedLetter = letter.trim().toLowerCase();
    const entries = this.canonicalSavedWordStates().filter((item) => item.state === source);

    return entries
      .filter((item) => {
        if (!item.identity) {
          return false;
        }

        return !normalizedLetter || item.identity.startsWith(normalizedLetter);
      })
      .map((item) => item.entry.analysis)
      .filter((analysis) => !this.isEmptyAnalysis(analysis))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }

  private collectAutocompleteTerms(entry: RootInventoryEntry): string[] {
    const terms = [
      entry.root,
      ...entry.alternateForms,
      entry.type,
      entry.meaning,
      entry.origin,
      entry.source,
      entry.exampleSentence,
      ...entry.familyMemory.flatMap((item) => [item.term, item.meaning, item.exampleSentence || '']),
      ...entry.assembledWords.flatMap((word) => [
        word.word,
        word.meaning,
        word.breakdown,
        word.exampleSentence || '',
        ...word.breakdownParts,
        ...word.otherRootWords.flatMap((part) => [
          part.root,
          part.type,
          part.meaning,
          ...(part.examples || []).flatMap((example) => [example.word, example.meaning]),
        ]),
      ]),
    ];

    return this.uniqueStrings(terms);
  }

  private collectAnalysisTerms(analysis: AnalysisResult | null): string[] {
    if (!analysis) {
      return [];
    }

    return this.uniqueStrings([
      analysis.query,
      analysis.title,
      analysis.summary,
      analysis.literalMeaningFormula,
      analysis.literalMeaningArrow,
      analysis.literalMeaning,
      analysis.actualMeaning,
      analysis.rootFamily.root,
      analysis.rootFamily.meaning,
      analysis.rootFamily.origin,
      ...analysis.breakdown.flatMap((part) => [part.label, part.type, part.meaning, part.source || '']),
      ...analysis.wordFamily.flatMap((item) => [
        item.word,
        item.meaning,
        item.exampleSentence || '',
        ...(item.breakdown || []).flatMap((part) => [part.label, part.type, part.meaning, part.source || '']),
      ]),
      ...analysis.otherWords.flatMap((group) => [
        group.title,
        group.focus,
        ...group.words.flatMap((word) => [word.word, word.meaning]),
      ]),
      ...analysis.relatedWords.flatMap((item) => [
        item.word,
        item.breakdown || '',
        item.meaning,
        item.explanation || '',
        item.exampleSentence || '',
      ]),
      ...analysis.familyMemory.flatMap((item) => [item.term, item.meaning, item.exampleSentence || '']),
      ...analysis.notes,
    ]);
  }

  private collectRevisionFallbackTerms(): string[] {
    const inventoryTerms = this.getRootInventoryEntries().flatMap((entry) => this.collectAutocompleteTerms(entry));
    const savedTerms = [
      ...this.getSavedWordAnalyses('', 'confident').flatMap((analysis) => this.collectAnalysisTerms(analysis)),
      ...this.getSavedWordAnalyses('', 'needs_focus').flatMap((analysis) => this.collectAnalysisTerms(analysis)),
    ];

    return this.uniqueStrings([...inventoryTerms, ...savedTerms]);
  }

  private searchRootInventoryEntries(query: string): RootInventoryEntry[] {
    const normalizedQuery = this.normalizeForMatch(query);
    if (!normalizedQuery) {
      return [];
    }

    const ranked = this.getRootInventoryEntries().map((entry) => {
      const root = this.normalizeForMatch(entry.root);
      const exactRoot = root === normalizedQuery ? 0 : 1;
      const prefixHit = root.startsWith(normalizedQuery) ? 0 : 1;
      return {
        entry,
        score: exactRoot + prefixHit,
      };
    });

    return ranked
      .filter((item) => item.score < 2)
      .sort((a, b) =>
        a.score - b.score || a.entry.root.localeCompare(b.entry.root, undefined, { sensitivity: 'base' })
      )
      .map((item) => item.entry);
  }

  private convertSavedWordsToInventoryEntries(words: ConfidentWordEntry[]): RootInventoryEntry[] {
    const allEntries = this.getRootInventoryEntries();

    return words
      .map((word) => {
        const rootQuery = word.query.toLowerCase().trim();

        // Try to find the root in the full inventory
        const inventoryEntry = allEntries.find(
          (entry) => entry.root.toLowerCase().trim() === rootQuery
        );

        // If found in inventory, return the full entry (with all assembled words, examples, etc.)
        if (inventoryEntry) {
          return inventoryEntry;
        }

        // Fallback: create a minimal entry from saved word data
        const analysis = word.analysis || {};
        const rootFamily = (analysis as any)?.rootFamily || {};

        return {
          root: word.query,
          type: 'root',
          meaning: (analysis as any)?.actualMeaning || (analysis as any)?.summary || word.title || rootFamily.meaning || '',
          origin: rootFamily.origin || '',
          source: 'saved',
          exampleSentence: (analysis as any)?.exampleSentence || '',
          slideNumbers: [],
          alternateForms: [],
          assembledWords: [],
          familyMemory: [],
        };
      })
      .sort((a, b) => a.root.localeCompare(b.root, undefined, { sensitivity: 'base' }));
  }

  private getSavedWordInventoryEntries(letter = '', source: 'confident' | 'needs_focus'): RootInventoryEntry[] {
    const normalizedLetter = letter.trim().toLowerCase();
    const analyses = this.getSavedWordAnalyses(normalizedLetter, source);
    const entries = analyses
      .map((analysis) => this.findRootInventoryEntryForAnalysis(analysis))
      .filter((entry): entry is RootInventoryEntry => entry !== null);

    return this.uniqueRootInventoryEntries(entries).sort((a, b) =>
      a.root.localeCompare(b.root, undefined, { sensitivity: 'base' })
    );
  }

  private findRootInventoryEntryForAnalysis(analysis: AnalysisResult | null): RootInventoryEntry | null {
    if (!analysis) {
      return null;
    }

    const candidates = [
      analysis.rootFamily?.root,
      analysis.query,
      analysis.title,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (!candidates.length) {
      return null;
    }

    const entries = this.getRootInventoryEntries();
    for (const candidate of candidates) {
      const indexed = this.inventoryIndex.get(candidate);
      if (indexed && typeof indexed === 'object') {
        const indexedEntry = indexed as RootInventoryEntry;
        const root = String(indexedEntry.root || '').trim().toLowerCase();
        if (root) {
          const match = entries.find((entry: RootInventoryEntry) => entry.root.trim().toLowerCase() === root);
          if (match) {
            return match;
          }
        }
      }

      const direct = entries.find((entry: RootInventoryEntry) => entry.root.trim().toLowerCase() === candidate);
      if (direct) {
        return direct;
      }
    }

    return null;
  }

  private uniqueRootInventoryEntries(items: RootInventoryEntry[]): RootInventoryEntry[] {
    const seen = new Set<string>();
    const result: RootInventoryEntry[] = [];

    for (const item of items) {
      const key = item.root.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(item);
    }

    return result;
  }

  private buildSavedWordsPdfHtml(title: string, entries: RootInventoryEntry[]): string {
    const cards = entries.map((entry) => this.buildSavedWordPdfCardHtml(entry)).join('');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 28px;
        font-family: Arial, Helvetica, sans-serif;
        color: #264653;
        background: #fff;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      .subhead {
        margin: 0 0 18px;
        color: #60748d;
        font-size: 13px;
      }
      .list {
        display: grid;
        gap: 14px;
      }
      .card {
        border: 1px solid rgba(158, 177, 184, 0.32);
        border-radius: 16px;
        padding: 14px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .card-head h2 {
        margin: 4px 0 0;
        font-size: 22px;
      }
      .tag {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(96, 116, 141, 0.1);
        color: #60748d;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .meaning {
        margin: 0 0 10px;
        font-size: 16px;
        line-height: 1.5;
      }
      .meta,
      .example,
      .assembled,
      .root-list {
        margin-top: 10px;
      }
      .muted {
        color: #60748d;
        font-size: 13px;
        line-height: 1.5;
      }
      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(244, 247, 243, 0.95);
        color: #526372;
        font-size: 13px;
      }
      .assembled-card {
        margin-top: 10px;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(158, 177, 184, 0.18);
        background: rgba(250, 252, 249, 0.92);
      }
      .assembled-card strong {
        display: block;
        margin-bottom: 4px;
        font-size: 15px;
      }
      .assembled-card p,
      .assembled-card em {
        display: block;
        margin: 0;
        color: #516576;
        font-size: 13px;
        line-height: 1.5;
      }
      @media print {
        body { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <h1>${this.escapeHtml(title)}</h1>
    <p class="subhead">Exported from EtymoBreak AI</p>
    <div class="list">${cards}</div>
  </body>
</html>`;
  }

  private buildSavedWordPdfCardHtml(entry: RootInventoryEntry): string {
    const alternateForms = entry.alternateForms.length
      ? `<div class="pill-row" aria-label="Alternate forms">${entry.alternateForms
          .map((form) => `<span class="pill">${this.escapeHtml(form)}</span>`)
          .join('')}</div>`
      : '';

    const assembledWords = entry.assembledWords.length
      ? `<div class="assembled" aria-label="Assembled words">${entry.assembledWords
          .map((word) => this.buildSavedWordPdfAssembledWordHtml(word))
          .join('')}</div>`
      : '';

    return `<article class="card">
      <div class="card-head">
        <div>
          <span class="tag">${this.escapeHtml(entry.type)}</span>
          <h2>${this.escapeHtml(entry.root)}</h2>
        </div>
        <span class="tag">${entry.assembledWords.length} examples</span>
      </div>
      <p class="meaning">${this.escapeHtml(entry.meaning)}</p>
      ${entry.source ? `<p class="muted">${this.escapeHtml(entry.source)}</p>` : ''}
      ${entry.exampleSentence ? `<p class="muted example"><em>${this.escapeHtml(entry.exampleSentence)}</em></p>` : ''}
      ${alternateForms}
      ${assembledWords}
    </article>`;
  }

  private buildSavedWordPdfAssembledWordHtml(word: RootAssembledWord): string {
    const breakdown = word.breakdownParts.length
      ? `<div class="pill-row" aria-label="Breakdown parts">${word.breakdownParts
          .map((part) => `<span class="pill">${this.escapeHtml(part)}</span>`)
          .join('')}</div>`
      : '';

    const roots = word.otherRootWords.length
      ? `<div class="root-list" aria-label="Other root words">${word.otherRootWords
          .map((part) => {
            const examples = part.examples?.length
              ? `<div class="pill-row" aria-label="Examples from root inventory">${part.examples
                  .map((example) => `<span class="pill">${this.escapeHtml(example.word)} • ${this.escapeHtml(example.meaning)}</span>`)
                  .join('')}</div>`
              : '';

            return `<div class="assembled-card">
              <strong>${this.escapeHtml(part.root)}</strong>
              <p>${this.escapeHtml(part.meaning)}</p>
              ${examples}
            </div>`;
          })
          .join('')}</div>`
      : '';

    return `<div class="assembled-card">
      <strong>${this.escapeHtml(word.word)}</strong>
      <p>${this.escapeHtml(word.meaning)}</p>
      ${breakdown}
      ${roots}
      ${word.exampleSentence ? `<em>${this.escapeHtml(word.exampleSentence)}</em>` : ''}
    </div>`;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  private uniqueAnalyses(items: AnalysisResult[], exclude: AnalysisResult[] = []): AnalysisResult[] {
    const used = new Set(exclude.map((item) => this.analysisKey(item)));
    const unique: AnalysisResult[] = [];

    for (const item of items) {
      const key = this.analysisKey(item);
      if (!key || used.has(key)) {
        continue;
      }

      used.add(key);
      unique.push(item);
    }

    return unique;
  }

  private analysisKey(analysis: AnalysisResult | null): string {
    if (!analysis) {
      return '';
    }

    return this.confidentKey(analysis.query || analysis.title, analysis.mode || 'word');
  }

  private revisionQuestionKey(question: QuizQuestion): string {
    return [
      this.normalizeForMatch(question.sourceTitle),
      this.normalizeForMatch(question.prompt),
      this.normalizeForMatch(question.explanation),
      String(question.correctIndex),
      String(question.type),
    ].join('|');
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
    if (bankType === 'root' || bankType === 'revision') {
      return null;
    }
    if (bankType === 'confident' || bankType === 'needs_focus') {
      return null;
    }

    const cached = this.quizBankCache.get(bankType);
    if (cached) {
      return cached;
    }

    const fileMap: Record<Exclude<QuizBankType, 'root' | 'confident' | 'needs_focus'>, string> = {
      word: '/question_bank_words.json',
      root_prefix_suffix: '/question_bank_roots_prefixes_suffixes.json',
      mixed: '/aaptprep_quiz_master_norman_level5.json',
      revision: '/question_bank_roots_prefixes_suffixes.json',
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

  private async loadRootMasteryQuestionBank(): Promise<QuizBankFile | null> {
    if (this.rootMasteryQuizBankCache) {
      return this.rootMasteryQuizBankCache;
    }

    if (this.rootMasteryQuizBankLoadPromise) {
      return this.rootMasteryQuizBankLoadPromise;
    }

    this.rootMasteryQuizBankLoadPromise = (async () => {
      try {
        const response = await fetch('/aaptprep_root_mastery_question_bank.json');
        if (!response.ok) {
          return null;
        }

        const payload = (await response.json().catch(() => null)) as QuizBankFile | null;
        if (!payload || !Array.isArray(payload.questions)) {
          return null;
        }

        this.rootMasteryQuizBankCache = payload;
        return payload;
      } catch {
        return null;
      }
    })();

    try {
      return await this.rootMasteryQuizBankLoadPromise;
    } finally {
      this.rootMasteryQuizBankLoadPromise = null;
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
      metadata['root'] || metadata['exampleWord'] || metadata['word'] || metadata['part'] || record.questionType || record.id
    ).trim();
    const sourceRoot = String(metadata['root'] || '').trim();
    const sourceRootMeaning = String(metadata['rootMeaning'] || metadata['meaning'] || '').trim();

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
      sourceRoot,
      sourceRootMeaning,
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
    if (type === 'revision' || type === 'mixed' || type === 'confident' || type === 'needs_focus') {
      return this.buildRevisionQuizDeck(difficulty, targetCount, type);
    }

    if (type === 'root') {
      return this.buildRootQuizDeck(difficulty, targetCount);
    }

    const bank = await this.loadQuizBank(type);
    if (!bank) {
      return [];
    }

    const target = Math.max(1, Math.floor(Number(targetCount || 0)) || 1);

    // Check if this quiz bank uses equal-weightage strategy for patterns
    const useEqualWeightage = (bank as any).metadata?.quizStrategy === 'equal_weightage_patterns' &&
                              (bank as any).metadata?.patterns?.length > 0;

    let selected: QuizQuestion[] = [];

    if (useEqualWeightage) {
      // Equal weightage: select equal number of questions from each pattern
      const patterns = (bank as any).metadata.patterns as string[];
      const questionsPerPattern = Math.floor(target / patterns.length);
      const remainder = target % patterns.length;

      // Group questions by pattern and difficulty
      const questionsByPattern: Record<string, QuizBankQuestion[]> = {};
      for (const pattern of patterns) {
        questionsByPattern[pattern] = bank.questions.filter((question) => {
          const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(Number(question.difficulty || question.level || 1))));
          const questionPattern = (question as any).metadata?.pattern || 'unknown';
          return normalizedDifficulty === difficulty && questionPattern === pattern;
        });
      }

      // Select equal number from each pattern
      const allSelected: QuizBankQuestion[] = [];
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const count = questionsPerPattern + (i < remainder ? 1 : 0);
        const patternQuestions = questionsByPattern[pattern] || [];
        const shuffled = this.shuffle(patternQuestions);
        allSelected.push(...shuffled.slice(0, count));
      }

      selected = this.shuffle(allSelected)
        .map((record, index) => this.normalizeQuizQuestion(record, index))
        .filter((question): question is QuizQuestion => question !== null)
        .slice(0, target);
    } else {
      // Original logic: random selection by difficulty
      const eligible = bank.questions.filter((question) => {
        const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(Number(question.difficulty || question.level || 1))));
        return normalizedDifficulty === difficulty;
      });
      const source = eligible.length >= target ? eligible : bank.questions;
      selected = this.shuffle(source)
        .slice(0, target)
        .map((record, index) => this.normalizeQuizQuestion(record, index))
        .filter((question): question is QuizQuestion => question !== null);
    }

    return selected;
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

  private async buildRootQuizDeck(difficulty: number, targetCount: number): Promise<QuizQuestion[]> {
    const bank = await this.loadRootMasteryQuestionBank();
    if (!bank || !Array.isArray(bank.questions) || !bank.questions.length) {
      return [];
    }

    const totalTarget = Math.max(1, Math.floor(Number(targetCount || 0)) || 1);
    const eligible = bank.questions.filter((question) => {
      const normalizedDifficulty = Math.min(
        5,
        Math.max(1, Math.floor(Number(question.difficulty || question.level || 1)))
      );
      return normalizedDifficulty === difficulty;
    });
    const source = eligible.length >= totalTarget ? eligible : bank.questions;
    const selected = this.shuffle(source).slice(0, totalTarget);

    return selected
      .map((record, index) => this.normalizeQuizQuestion(record, index))
      .filter((question): question is QuizQuestion => question !== null)
      .slice(0, totalTarget);
  }

  private createRevisionQuestion(
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
      id: `revision-${this.quizAttemptCounter}-${this.quizQuestions().length}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      prompt: prompt.trim(),
      options: options.options,
      correctIndex: options.correctIndex,
      selectedIndex: null,
      skipped: false,
      submitted: false,
      isCorrect: null,
      sourceTitle: sourceTitle || 'Revision word',
      explanation: explanation.trim() || 'Review the answer from your saved words.',
    };
  }

  private async buildRevisionQuizDeck(
    difficulty: number,
    targetCount: number,
    mode: QuizBankType = 'mixed'
  ): Promise<QuizQuestion[]> {
    if (this.inventoryLoadPromise) {
      await this.inventoryLoadPromise;
    }
    if (!this.inventoryEntries().length) {
      await this.loadRootAutocomplete();
    }

    await this.loadConfidentWordsFromServer();
    await this.loadNeedsFocusWordsFromServer();

    const bank = await this.loadQuizBank('mixed');
    if (!bank || !bank.questions.length) {
      return [];
    }

    const confidentAnalyses = this.getSavedWordAnalyses('', 'confident');
    const focusAnalyses = this.getSavedWordAnalyses('', 'needs_focus');

    const extractRootsFromAnalysis = (analysis: AnalysisResult): string[] => {
      const roots: string[] = [];

      if (analysis.rootFamily?.root) {
        roots.push(analysis.rootFamily.root.trim().toLowerCase());
      }

      if (analysis.breakdown && analysis.breakdown.length > 0) {
        for (const part of analysis.breakdown) {
          if (part.root) {
            roots.push(part.root.trim().toLowerCase());
          }
        }
      }

      if (roots.length === 0) {
        const fallback = analysis.query || analysis.title || '';
        if (fallback) {
          roots.push(fallback.trim().toLowerCase());
        }
      }

      return roots;
    };

    const confidentRootNames = Array.from(
      new Set(confidentAnalyses.flatMap(extractRootsFromAnalysis).filter(Boolean))
    );
    const focusRootSet = new Set(focusAnalyses.flatMap(extractRootsFromAnalysis).filter(Boolean));
    confidentRootNames.forEach((r) => focusRootSet.delete(r));
    const focusRootNames = Array.from(focusRootSet);

    const allRootEntries = this.getRootInventoryEntries();
    const savedRootKeys = new Set([...confidentRootNames, ...focusRootNames]);
    const newEntries = allRootEntries.filter((entry) => !savedRootKeys.has(entry.root.trim().toLowerCase()));
    const newRootNames = newEntries.map((e) => e.root.trim().toLowerCase()).filter(Boolean);

    const target = Math.max(1, Math.floor(Number(targetCount || 0)) || 1);

    if (mode === 'confident') {
      if (!confidentRootNames.length) return [];
      return this.selectQuestionsFromBank(bank, confidentRootNames, difficulty, target);
    }

    if (mode === 'needs_focus') {
      if (!focusRootNames.length) return [];
      return this.selectQuestionsFromBank(bank, focusRootNames, difficulty, target);
    }

    if (!confidentRootNames.length && !focusRootNames.length && !newRootNames.length) {
      return [];
    }

    const confidentTarget = Math.min(Math.floor(target * 0.8), confidentRootNames.length);
    const focusTarget = Math.min(Math.floor(target * 0.1), focusRootNames.length);
    const newTarget = Math.min(target - confidentTarget - focusTarget, newRootNames.length);

    const confidentQuestions = confidentTarget > 0 ?
      this.selectQuestionsFromBank(bank, confidentRootNames, difficulty, confidentTarget) : [];
    const focusQuestions = focusTarget > 0 ?
      this.selectQuestionsFromBank(bank, focusRootNames, difficulty, focusTarget) : [];
    const newQuestions = newTarget > 0 ?
      this.selectQuestionsFromBank(bank, newRootNames, difficulty, newTarget) : [];

    const allSelected = [...confidentQuestions, ...focusQuestions, ...newQuestions];
    return this.shuffle(allSelected).slice(0, target);
  }

  private selectQuestionsFromBank(
    bank: QuizBankFile,
    rootNames: string[],
    difficulty: number,
    targetCount: number
  ): QuizQuestion[] {
    if (!rootNames.length || !bank.questions.length) {
      return [];
    }

    const rootSet = new Set(rootNames.map((r) => r.toLowerCase()));

    const filteredQuestions = bank.questions.filter((question) => {
      const questionRoot = (question.parentRoot || '').trim().toLowerCase();
      const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(Number(question.difficulty || question.level || 1))));
      return rootSet.has(questionRoot) && normalizedDifficulty === difficulty;
    });

    if (!filteredQuestions.length) {
      return [];
    }

    const patterns = (bank as any).metadata?.patterns as string[] | undefined;
    const target = Math.max(1, Math.floor(targetCount || 0));

    let selected: QuizBankQuestion[] = [];
    const usedRoots = new Set<string>();

    if (patterns && patterns.length > 0) {
      const questionsPerPattern = Math.floor(target / patterns.length);
      const remainder = target % patterns.length;

      const questionsByPattern: Record<string, QuizBankQuestion[]> = {};
      for (const pattern of patterns) {
        questionsByPattern[pattern] = filteredQuestions.filter((q) => {
          const qPattern = (q as any).metadata?.pattern || 'unknown';
          return qPattern === pattern;
        });
      }

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const count = questionsPerPattern + (i < remainder ? 1 : 0);
        const patternQuestions = questionsByPattern[pattern] || [];

        const filtered = patternQuestions.filter((q) => {
          const qRoot = (q.parentRoot || '').trim().toLowerCase();
          return !usedRoots.has(qRoot);
        });

        const shuffled = this.shuffle(filtered);
        for (const question of shuffled.slice(0, count)) {
          const qRoot = (question.parentRoot || '').trim().toLowerCase();
          usedRoots.add(qRoot);
          selected.push(question);
          if (selected.length >= target) break;
        }

        if (selected.length >= target) break;
      }
    } else {
      const shuffled = this.shuffle(filteredQuestions);
      for (const question of shuffled) {
        const qRoot = (question.parentRoot || '').trim().toLowerCase();
        if (!usedRoots.has(qRoot)) {
          usedRoots.add(qRoot);
          selected.push(question);
          if (selected.length >= target) break;
        }
      }
    }

    return this.shuffle(selected)
      .map((record, index) => this.normalizeQuizQuestion(record, index))
      .filter((question): question is QuizQuestion => question !== null)
      .slice(0, target);
  }

  private buildRevisionCandidates(
    analyses: AnalysisResult[],
    difficulty: number,
    distractorAnalyses: AnalysisResult[] = analyses
  ): QuizQuestion[] {
    if (!analyses.length) {
      return [];
    }

    const titles = this.uniqueStrings(
      distractorAnalyses.map((analysis) => analysis.title || analysis.query).filter((value): value is string => Boolean(value))
    );
    const meanings = this.uniqueStrings(
      distractorAnalyses
        .map((analysis) => analysis.actualMeaning || analysis.summary || analysis.literalMeaning)
        .filter((value): value is string => Boolean(value))
    );
    const formulas = this.uniqueStrings(
      distractorAnalyses
        .map((analysis) => analysis.literalMeaningFormula || analysis.literalMeaning)
        .filter((value): value is string => Boolean(value))
    );
    const breakdownMeanings = this.uniqueStrings(
      distractorAnalyses.flatMap((analysis) => analysis.breakdown.map((part) => part.meaning).filter(Boolean))
    );
    const familyTerms = this.uniqueStrings(
      distractorAnalyses.flatMap((analysis) => analysis.familyMemory.map((item) => item.term).filter(Boolean))
    );
    const rootMeanings = this.uniqueStrings(
      distractorAnalyses
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
      ...this.collectRevisionFallbackTerms(),
    ]);

    const candidates: QuizQuestion[] = [];
    for (const analysis of analyses) {
      const sourceTitle = analysis.title || analysis.query || 'Revision word';
      const explanation = analysis.actualMeaning || analysis.summary || analysis.literalMeaning || sourceTitle;

      if (difficulty >= 1) {
        const correctMeaning = analysis.actualMeaning || analysis.summary || analysis.literalMeaning;
        if (correctMeaning) {
          const distractors = fallbackPool.filter((item) => item !== correctMeaning);
          const question = this.createRevisionQuestion(
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
          const question = this.createRevisionQuestion(
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
          const question = this.createRevisionQuestion(
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
          const question = this.createRevisionQuestion(
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
        const question = this.createRevisionQuestion(
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

    return candidates;
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
      this.pendingQuizDraft = null;
      this.quizDraftPromptOpen.set(false);
      this.quizDraftPromptMessage.set('');
      const raw = localStorage.getItem(this.quizDraftStorageKey(profile));
      if (!raw) {
        return;
      }

      const draft = JSON.parse(raw) as Partial<QuizDraftState> | null;
      if (!draft || !Array.isArray(draft.questions) || !draft.questions.length) {
        this.clearQuizDraftLocally();
        return;
      }

      if (draft.quizFlowStage !== 'taking' || !Array.isArray(draft.questions)) {
        this.clearQuizDraftLocally();
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
        this.clearQuizDraftLocally();
        return;
      }

      this.pendingQuizDraft = {
        quizType: draft.quizType || 'root',
        quizDifficulty: Math.min(5, Math.max(1, Math.floor(Number(draft.quizDifficulty || 1)))),
        quizQuestionTarget: Math.max(1, Math.floor(Number(draft.quizQuestionTarget || 5)) || 1),
        quizIndex: Math.min(
          Math.max(0, Math.floor(Number(draft.quizIndex || 0))),
          Math.max(0, questions.length - 1)
        ),
        quizTimeRemaining: Math.max(0, Math.floor(Number(draft.quizTimeRemaining || 0))),
        quizFlowStage: 'taking',
        questions,
        savedAt: String(draft.savedAt || new Date().toISOString()),
      };
      this.quizFlowStage.set('setup');
      this.quizQuestions.set([]);
      this.quizIndex.set(0);
      this.quizTimeRemaining.set(25 * 60);
      this.quizPreparing.set(false);
      this.quizQuestionTarget.set(this.pendingQuizDraft.quizQuestionTarget);
      this.quizDraftPromptMessage.set(
        'You have an unfinished quiz saved on this device. Do you want to discard it and start a new quiz?'
      );
      this.quizDraftPromptOpen.set(true);
      this.quizNotice.set('You have an unfinished quiz on this device.');
      this.stopQuizTimer();
    } catch {
      return;
    }
  }

  private applyQuizDraft(draft: QuizDraftState): void {
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
      this.quizFlowStage.set('setup');
      this.quizQuestions.set([]);
      this.quizIndex.set(0);
      this.quizTimeRemaining.set(25 * 60);
      this.quizPreparing.set(false);
      this.quizQuestionTarget.set(this.resolveQuizQuestionTarget());
      return;
    }

    this.quizType.set(draft.quizType || 'root');
    this.quizDifficulty.set(Math.min(5, Math.max(1, Math.floor(Number(draft.quizDifficulty || 1)))));
      this.quizQuestionTarget.set(Math.max(1, Math.floor(Number(draft.quizQuestionTarget || 5)) || 1));
    this.quizIndex.set(Math.min(Math.max(0, Math.floor(Number(draft.quizIndex || 0))), Math.max(0, questions.length - 1)));
    this.quizTimeRemaining.set(Math.max(0, Math.floor(Number(draft.quizTimeRemaining || 0))));
    this.quizQuestions.set(questions);
    this.quizFlowStage.set('taking');
    this.stopQuizTimer();
    this.startQuizTimer();
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

      // Calculate highest score
      if (history.length) {
        const highestScore = Math.max(...history.map((entry) => entry.marks || 0));
        this.quizHighestScore.set(highestScore);

        if (!history.some((item) => item.id === this.selectedQuizHistoryId())) {
          this.selectedQuizHistoryId.set(history[0]!.id);
        }
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
    const query = String(
      entry['query'] ||
        rawAnalysisRecord['query'] ||
        rawAnalysisRecord['root'] ||
        rawAnalysisRecord['title'] ||
        entry['root'] ||
        entry['title'] ||
        ''
    ).trim();
    const mode = String(entry['mode'] || rawAnalysisRecord['mode'] || rawAnalysisRecord['type'] || 'word').trim() || 'word';
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

  private rawSavedWordEntry(item: unknown): ConfidentWordEntry | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const entry = item as { [key: string]: unknown };
    const rawAnalysis =
      entry['analysis'] && typeof entry['analysis'] === 'object' ? (entry['analysis'] as unknown) : entry;
    const rawAnalysisRecord = rawAnalysis as { [key: string]: unknown };
    const query = String(
      entry['query'] ||
        rawAnalysisRecord['query'] ||
        rawAnalysisRecord['root'] ||
        rawAnalysisRecord['title'] ||
        entry['root'] ||
        entry['title'] ||
        ''
    ).trim();

    if (!query) {
      return null;
    }

    const mode = String(entry['mode'] || rawAnalysisRecord['mode'] || rawAnalysisRecord['type'] || 'word').trim() || 'word';
    const analysis = this.normalizeAnalysisResult(rawAnalysis, query);
    const player = entry['player'] && typeof entry['player'] === 'object' ? (entry['player'] as { [key: string]: unknown }) : {};

    return {
      id: String(entry['id'] || `${query}-${mode}`).trim(),
      time: String(entry['time'] || entry['updatedAt'] || entry['createdAt'] || '').trim(),
      query,
      mode,
      title: String(entry['title'] || rawAnalysisRecord['title'] || analysis.title || query).trim(),
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

    const identity = this.savedWordsIdentity(profile);
    if (this.confidentWordsLoadedIdentity === identity) {
      return;
    }

    this.loadSavedWordsCache('confident');

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
          this.confidentWordsError.set('Confident words could not be refreshed right now.');
          return;
        }

        const payload = (await response.json().catch(() => null)) as { items?: unknown[] } | null;
        const entries = (payload?.items ?? [])
          .map((item) => this.rawSavedWordEntry(item))
          .filter((item): item is ConfidentWordEntry => item !== null)
          .sort((a, b) => b.time.localeCompare(a.time));

        this.confidentWords.set(entries);
        this.saveSavedWordsCache('confident', entries);
        this.syncSavedWordBuckets();
        this.confidentWordsLoadedIdentity = identity;
      } catch {
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
    const root = String(question.root || '').trim();
    const rootMeaning = String(question.rootMeaning || '').trim();

    if (root) {
      const rootAnalysis = this.buildRootAnalysis(root, rootMeaning, root, [prompt, correctText].filter(Boolean));
      if (rootAnalysis) {
        return rootAnalysis;
      }
    }

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

  private historyQuestionStatus(question: QuizAttemptQuestion): QuizReviewFilter {
    if (question.skipped || question.selectedIndex === null) {
      return 'skipped';
    }

    return question.isCorrect ? 'correct' : 'wrong';
  }

  private async loadNeedsFocusWordsFromServer(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      this.needsFocusWords.set([]);
      return;
    }

    const identity = this.savedWordsIdentity(profile);
    if (this.needsFocusWordsLoadedIdentity === identity) {
      return;
    }

    this.loadSavedWordsCache('needs_focus');

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
          this.needsFocusWordsError.set('Needs Focus words could not be refreshed right now.');
          return;
        }

        const payload = (await response.json().catch(() => null)) as { items?: unknown[] } | null;
        const entries = (payload?.items ?? [])
          .map((item) => this.rawSavedWordEntry(item))
          .filter((item): item is NeedsFocusWordEntry => item !== null)
          .sort((a, b) => b.time.localeCompare(a.time));

        this.needsFocusWords.set(entries);
        this.saveSavedWordsCache('needs_focus', entries);
        this.syncSavedWordBuckets();
        this.needsFocusWordsLoadedIdentity = identity;
      } catch {
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

  private savedWordsCacheKey(source: 'confident' | 'needs_focus', profile = this.profile()): string {
    const identity =
      profile?.google.sub ||
      profile?.google.email ||
      this.googleIdentity()?.sub ||
      this.googleIdentity()?.email ||
      'anonymous';
    return `${this.savedWordsCachePrefix}:${source}:${identity}`;
  }

  private savedWordsIdentity(profile = this.profile()): string {
    return (
      profile?.google.sub ||
      profile?.google.email ||
      this.googleIdentity()?.sub ||
      this.googleIdentity()?.email ||
      'anonymous'
    );
  }

  private loadSavedWordsCache(source: 'confident' | 'needs_focus'): boolean {
    const profile = this.profile();
    if (!profile) {
      return false;
    }

    try {
      const raw = localStorage.getItem(this.savedWordsCacheKey(source, profile));
      if (!raw) {
        return false;
      }

      const payload = JSON.parse(raw) as { items?: unknown[] } | null;
      const entries = (payload?.items ?? [])
        .map((item) => (source === 'confident' ? this.normalizeConfidentEntry(item) : this.normalizeNeedsFocusEntry(item)))
        .filter((item): item is ConfidentWordEntry => item !== null)
        .sort((a, b) => b.time.localeCompare(a.time));

      if (source === 'confident') {
        this.confidentWords.set(entries);
      } else {
        this.needsFocusWords.set(entries);
      }
      return true;
    } catch {
      return false;
    }
  }

  private saveSavedWordsCache(source: 'confident' | 'needs_focus', entries: ConfidentWordEntry[]): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    try {
      localStorage.setItem(this.savedWordsCacheKey(source, profile), JSON.stringify({ items: entries }));
    } catch {
      return;
    }
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
      this.searchResults.set([]);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    this.confidentWordNotice.set('');
    this.searchResults.set([]);

    try {
      if (this.inventoryLoadPromise) {
        await this.inventoryLoadPromise;
      }

      const localMatches = this.searchRootInventoryEntries(normalized);
      if (localMatches.length) {
        this.searchResults.set(localMatches);
        this.result.set(null);
        this.notice.set(
          `Showing ${localMatches.length} match${localMatches.length === 1 ? '' : 'es'} from the word inventory.`
        );
        return;
      }
      this.result.set(null);
      this.searchResults.set([]);
      this.notice.set(`I’m not aware of "${normalized}" in the inventory yet. Try another word or root.`);
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Unable to load the inventory.';
      this.result.set(null);
      this.searchResults.set([]);
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

  protected navigateToRoot(rootName: string): void {
    const entries = this.getRootInventoryEntries();
    const normalizedSearch = rootName.trim().toLowerCase();
    const index = entries.findIndex(
      (entry) => entry.root.trim().toLowerCase() === normalizedSearch
    );
    if (index >= 0) {
      this.experimentIndex.set(index);
      this.setActiveTab('all_words', true);
      this.closeAutocomplete();
    }
  }

  protected openAutocomplete(): void {
    this.autocompleteOpen.set(true);
  }

  protected closeAutocomplete(): void {
    this.autocompleteOpen.set(false);
  }
}
