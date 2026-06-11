import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
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
  familyMemory: Array<{
    term: string;
    meaning: string;
  }>;
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
export class App implements OnInit {
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly rootAutocomplete = signal<string[]>([]);
  protected readonly autocompleteOpen = signal(false);
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

    const filtered = unique.filter((item) => item.includes(current));
    return filtered.slice(0, 8);
  });
  protected readonly showAutocomplete = computed(
    () =>
      this.autocompleteOpen() &&
      this.query().trim().length > 0 &&
      this.autocompleteOptions().length > 0
  );

  public ngOnInit(): void {
    void this.loadRootAutocomplete();
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

      const inventoryTerms = payload
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }

          const entry: any = item;
          return String(entry.query || '').trim().toLowerCase();
        })
        .filter(Boolean);

      this.rootAutocomplete.set([...new Set(inventoryTerms)]);
    } catch {
      return;
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

  protected async analyze(): Promise<void> {
    const normalized = this.query().trim().toLowerCase();

    if (!normalized) {
      this.error.set('Enter a word or root to continue.');
      this.result.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
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
      this.result.set(this.normalizeAnalysisResult(payload, normalized));
      return;
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Unable to reach the backend.';
      this.result.set(null);
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
