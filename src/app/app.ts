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

type BreakdownRow = AnalysisPart[];
type AppTab = 'search' | 'experiment' | 'quiz';
type AuthStage = 'home' | 'profile' | 'app';
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
  protected readonly quizLetter = signal('');
  protected readonly quizIndex = signal(0);
  protected readonly quizQuestions = signal<QuizQuestion[]>([]);
  protected readonly quizNotice = signal('');
  protected readonly googleIdentity = signal<GoogleIdentity | null>(null);
  protected readonly profile = signal<StoredProfile | null>(null);
  protected readonly profileFirstName = signal('');
  protected readonly profileLastName = signal('');
  protected readonly profileCountry = signal('');
  protected readonly authMessage = signal('');
  protected readonly authError = signal('');
  protected readonly googleClientId = signal('');
  protected readonly googleButtonRendered = signal(false);
  protected readonly inventoryEntries = signal<unknown[]>([]);
  private inventoryIndex = new Map<string, unknown>();
  private inventoryLoadPromise: Promise<void> | null = null;
  private readonly profileStorageKey = 'etymobreak-profile';
  private readonly pendingGoogleStorageKey = 'etymobreak-google-identity';
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
  protected readonly quizSlides = computed(() => {
    const letter = this.quizLetter().trim().toLowerCase();
    const slides = this.getInventoryAnalyses(letter);
    return slides.length ? slides.slice(0, 10) : [];
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
  protected readonly quizCurrentQuestionSubmitted = computed(() => this.quizQuestion()?.submitted ?? false);
  protected readonly profileComplete = computed(() => {
    const profile = this.profile();
    return !!profile?.firstName && !!profile?.lastName && !!profile?.country;
  });
  protected readonly authStage = computed<AuthStage>(() => {
    if (this.profileComplete()) {
      return 'app';
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

  protected setActiveTab(tab: AppTab): void {
    this.activeTab.set(tab);
    if (tab === 'quiz') {
      void this.ensureQuizDeck();
    }
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
    this.profile.set(null);
    this.googleIdentity.set(null);
    this.profileFirstName.set('');
    this.profileLastName.set('');
    this.profileCountry.set('');
    this.authMessage.set('Signed out.');
    this.authError.set('');
    this.googleButtonRendered.set(false);
    try {
      localStorage.removeItem(this.profileStorageKey);
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
    } catch {
      return;
    }
    setTimeout(() => this.tryRenderGoogleButton(), 0);
  }

  protected chooseExperimentLetter(letter: string): void {
    this.experimentLetter.set(letter);
    this.experimentIndex.set(0);
    this.activeTab.set('experiment');
  }

  protected chooseQuizLetter(letter: string): void {
    this.quizLetter.set(letter);
    this.activeTab.set('quiz');
    void this.ensureQuizDeck(letter);
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

  protected submitCurrentQuizQuestion(): void {
    if (this.quizCurrentQuestionSubmitted()) {
      return;
    }

    const questions = this.quizQuestions();
    const currentIndex = this.quizIndex();
    const question = questions[currentIndex];
    if (!question || question.selectedIndex === null) {
      this.quizNotice.set('Pick one answer before submitting this question.');
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

    const correctAnswer = question.options[question.correctIndex] ?? '';
    this.quizNotice.set(
      isCorrect
        ? `Correct! +3 marks.`
        : `Wrong. -1 mark. Correct answer: ${correctAnswer}.`
    );
  }

  protected resetQuiz(): void {
    const letter = this.quizLetter();
    this.buildQuizDeck(letter);
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
      this.authMessage.set('Google account connected. Finish your profile and continue.');
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
      const params = new URLSearchParams();
      if (identity.sub) {
        params.set('sub', identity.sub);
      }
      if (identity.email) {
        params.set('email', identity.email);
      }

      const response = await fetch(`${getApiBaseUrl()}/profile?${params.toString()}`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as Partial<CreatedProfileResponse> | null;
      const firstName = String(payload?.firstName || '').trim();
      const lastName = String(payload?.lastName || '').trim();
      const country = String(payload?.country || '').trim();
      const google = payload?.google || identity;
      if (!firstName || !lastName || !country) {
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
      localStorage.setItem(this.profileStorageKey, JSON.stringify(normalizedProfile));
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
      this.authMessage.set('Welcome back. Your profile is ready.');
      this.authError.set('');
    } catch {
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

      localStorage.setItem(this.profileStorageKey, JSON.stringify(normalizedProfile));
      sessionStorage.removeItem(this.pendingGoogleStorageKey);
    } catch (error) {
      const fallbackProfile: StoredProfile = {
        ...profile,
      };

      this.profile.set(fallbackProfile);
      this.authMessage.set('Profile saved locally. Welcome to EtymoBreak.');
      this.authError.set(error instanceof Error ? error.message : 'Your profile could not be created.');

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
    this.authMessage.set('Google account connected. Finish your profile and continue.');
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

  private getQuizAnswerPool(entries: AnalysisResult[], type: QuizQuestionType): string[] {
    const answers = entries.flatMap((entry) => {
      switch (type) {
        case 'meaning':
          return [entry.actualMeaning, entry.summary, entry.literalMeaning]
            .map((value) => value.trim())
            .filter(Boolean);
        case 'root':
          return [
            entry.rootFamily.meaning,
            ...(entry.breakdown ?? []).filter((part) => part.type === 'root').map((part) => part.meaning),
          ]
            .map((value) => value.trim())
            .filter(Boolean);
        case 'family':
          return [
            ...(entry.familyMemory ?? []).map((item) => item.term),
            ...(entry.wordFamily ?? []).map((item) => item.word),
          ]
            .map((value) => value.trim())
            .filter(Boolean);
        case 'literal':
          return [entry.literalMeaningArrow, entry.literalMeaningFormula, entry.literalMeaning]
            .map((value) => value.trim())
            .filter(Boolean);
        default:
          return [];
      }
    });

    return this.uniqueStrings(answers);
  }

  private createQuizQuestion(
    entry: AnalysisResult,
    index: number,
    type: QuizQuestionType,
    pool: AnalysisResult[]
  ): QuizQuestion | null {
    const meaningFallback = entry.actualMeaning || entry.summary || entry.literalMeaning;
    const rootPart = entry.breakdown.find((part) => part.type === 'root') ?? entry.breakdown[0];
    const rootLabel = entry.rootFamily.root || rootPart?.label || entry.query;
    const rootMeaning = entry.rootFamily.meaning || rootPart?.meaning || meaningFallback;
    const familyWord =
      entry.familyMemory[0]?.term || entry.wordFamily[0]?.word || entry.title || entry.query;
    const literalAnswer =
      entry.literalMeaningArrow || entry.literalMeaningFormula || entry.literalMeaning || meaningFallback;

    let prompt = '';
    let correctAnswer = '';
    let explanation = '';

    switch (type) {
      case 'meaning':
        prompt = `What is the best meaning of "${entry.title}"?`;
        correctAnswer = meaningFallback;
        explanation = entry.summary || entry.actualMeaning || meaningFallback;
        break;
      case 'root':
        prompt = `What does the root "${rootLabel}" mean?`;
        correctAnswer = rootMeaning;
        explanation = `${rootLabel} means ${rootMeaning}.`;
        break;
      case 'family':
        prompt = `Which word belongs to the "${rootLabel}" family?`;
        correctAnswer = familyWord;
        explanation = `${familyWord} belongs to the ${rootLabel} family.`;
        break;
      case 'literal':
        prompt = `What is the literal breakdown of "${entry.title}"?`;
        correctAnswer = literalAnswer;
        explanation = entry.literalMeaningFormula || entry.literalMeaningArrow || entry.literalMeaning || meaningFallback;
        break;
    }

    if (!prompt || !correctAnswer) {
      return null;
    }

    const distractors = this.shuffle(
      this.getQuizAnswerPool(pool, type).filter(
        (option) => option.toLowerCase() !== correctAnswer.trim().toLowerCase()
      )
    ).slice(0, 3);

    const options = this.shuffle(this.uniqueStrings([correctAnswer, ...distractors]));
    while (options.length < 4) {
      const filler = this.uniqueStrings(pool.map((item) => item.title).filter(Boolean)).find(
        (option) => !options.includes(option)
      );
      if (!filler) {
        break;
      }
      options.push(filler);
    }

    const correctIndex = options.findIndex(
      (option) => option.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
    );

    if (correctIndex < 0 || options.length < 4) {
      return null;
    }

    return {
      id: `${entry.query}-${index}-${type}`,
      type,
      prompt,
      options: options.slice(0, 4),
      correctIndex,
      selectedIndex: null,
      submitted: false,
      isCorrect: null,
      sourceTitle: entry.title,
      explanation,
    };
  }

  private async ensureQuizDeck(letter = this.quizLetter()): Promise<void> {
    if (this.inventoryLoadPromise) {
      await this.inventoryLoadPromise;
    }

    if (!this.inventoryEntries().length) {
      this.quizQuestions.set([]);
      this.quizNotice.set('');
      return;
    }

    this.buildQuizDeck(letter);
  }

  private buildQuizDeck(letter = ''): void {
    const allEntries = this.getInventoryAnalyses();
    const filteredEntries = letter.trim() ? this.getInventoryAnalyses(letter) : allEntries;
    const sourceEntries = filteredEntries.length >= 10 ? filteredEntries : allEntries;
    const selectedEntries = sourceEntries.slice(0, 10);

    const types: QuizQuestionType[] = ['meaning', 'root', 'family', 'literal'];
    const questions = selectedEntries
      .map((entry, index) => this.createQuizQuestion(entry, index, types[index % types.length], sourceEntries))
      .filter((question): question is QuizQuestion => question !== null)
      .slice(0, 10);

    this.quizQuestions.set(questions);
    this.quizIndex.set(0);
    this.quizNotice.set('');
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
