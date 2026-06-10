import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getApiBaseUrl } from './api-base';

type SearchMode = 'word' | 'root' | 'prefix' | 'suffix';

interface AnalysisPart {
  label: string;
  type: string;
  meaning: string;
  source?: string;
}

interface RelatedWord {
  word: string;
  meaning: string;
}

interface AnalysisResult {
  query: string;
  mode: SearchMode;
  title: string;
  summary: string;
  literalMeaning: string;
  actualMeaning: string;
  parts: AnalysisPart[];
  relatedWords: RelatedWord[];
  notes: string[];
}

const DEFAULT_QUERY = 'cardiology';
const SEARCH_MODES: Array<{ value: SearchMode; label: string; helper: string }> = [
  { value: 'word', label: 'Word', helper: 'Break down a full word' },
  { value: 'root', label: 'Root', helper: 'Find the family of a root' },
  { value: 'prefix', label: 'Prefix', helper: 'Explore the front of words' },
  { value: 'suffix', label: 'Suffix', helper: 'Explore the ending of words' },
];

const DEMO_ANALYSES: Record<string, AnalysisResult> = {
  'cardiology|word': {
    query: 'cardiology',
    mode: 'word',
    title: 'CARDIOLOGY',
    summary: 'A medical term built from the root cardio and the suffix -logy.',
    literalMeaning: 'cardio + logy',
    actualMeaning: 'The branch of medicine that deals with the heart and blood vessels.',
    parts: [
      { label: 'cardio', type: 'root', meaning: 'heart', source: 'Greek kardia' },
      { label: '-logy', type: 'suffix', meaning: 'study of, science of', source: 'Greek logia' },
    ],
    relatedWords: [
      { word: 'Cardiology', meaning: 'study of the heart' },
      { word: 'Cardiologist', meaning: 'heart specialist' },
      { word: 'Cardiac', meaning: 'relating to the heart' },
      { word: 'Cardiovascular', meaning: 'heart and blood vessels' },
      { word: 'Electrocardiogram', meaning: 'recording of heart activity' },
    ],
    notes: ['This is a demo analysis that can be replaced by Gemini output.'],
  },
  'arch|root': {
    query: 'arch',
    mode: 'root',
    title: 'ARCH',
    summary: 'A root tied to leadership, rule, and chief authority.',
    literalMeaning: 'chief, ruler',
    actualMeaning: 'A root that appears in words meaning leader, first, or principal.',
    parts: [{ label: 'arch', type: 'root', meaning: 'chief; ruler', source: 'Greek archon' }],
    relatedWords: [
      { word: 'Monarch', meaning: 'one ruler' },
      { word: 'Patriarch', meaning: 'father ruler' },
      { word: 'Matriarch', meaning: 'mother ruler' },
      { word: 'Archangel', meaning: 'chief angel' },
      { word: 'Architect', meaning: 'chief builder' },
    ],
    notes: ['Search by a root to discover a full word family.'],
  },
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly query = signal(DEFAULT_QUERY);
  protected readonly searchMode = signal<SearchMode>('word');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(DEMO_ANALYSES['cardiology|word']);

  protected readonly modes = SEARCH_MODES;
  protected readonly activeModeLabel = computed(
    () => this.modes.find((mode) => mode.value === this.searchMode())?.label ?? 'Word'
  );

  protected readonly examplePills = [
    { label: 'cardiology', mode: 'word' as SearchMode },
    { label: 'arch', mode: 'root' as SearchMode },
    { label: 'bio', mode: 'prefix' as SearchMode },
    { label: 'logy', mode: 'suffix' as SearchMode },
  ];

  protected async analyze(): Promise<void> {
    const normalized = this.query().trim().toLowerCase();

    if (!normalized) {
      this.error.set('Enter a word, root, prefix, or suffix to continue.');
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
          mode: this.searchMode(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as AnalysisResult;
      this.result.set(data);
      return;
    } catch {
      this.result.set(this.localFallback(normalized, this.searchMode()));
      this.error.set(
        `Live API unavailable for "${normalized}". Showing a local fallback instead.`
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected selectExample(label: string, mode: SearchMode): void {
    this.query.set(label);
    this.searchMode.set(mode);
    void this.analyze();
  }

  private localFallback(query: string, mode: SearchMode): AnalysisResult {
    const key = `${query}|${mode}` as const;
    const demo = DEMO_ANALYSES[key];
    if (demo) {
      return demo;
    }

    const fallbackTitle = query.toUpperCase();
    const modeLabel = this.modes.find((item) => item.value === mode)?.label ?? 'Word';

    return {
      query,
      mode,
      title: fallbackTitle,
      summary: `Waiting for live ${modeLabel.toLowerCase()} analysis from the backend.`,
      literalMeaning: 'Pending live analysis',
      actualMeaning: `This placeholder will be replaced when the API returns a ${modeLabel.toLowerCase()} result.`,
      parts: [
        {
          label: query,
          type: mode,
          meaning: 'Live analysis unavailable right now',
          source: 'Local fallback',
        },
      ],
      relatedWords: [],
      notes: [
        'The backend call failed or was unreachable.',
        'Once the API is available, this section will show Gemini output.',
      ],
    };
  }
}
