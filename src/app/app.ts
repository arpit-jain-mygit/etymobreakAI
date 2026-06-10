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

const SEARCH_MODES: Array<{ value: SearchMode; label: string; helper: string }> = [
  { value: 'word', label: 'Word', helper: 'Break down a full word' },
  { value: 'root', label: 'Root', helper: 'Find the family of a root' },
  { value: 'prefix', label: 'Prefix', helper: 'Explore the front of words' },
  { value: 'suffix', label: 'Suffix', helper: 'Explore the ending of words' },
];

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly query = signal('');
  protected readonly searchMode = signal<SearchMode>('word');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);

  protected readonly modes = SEARCH_MODES;
  protected readonly activeModeLabel = computed(
    () => this.modes.find((mode) => mode.value === this.searchMode())?.label ?? 'Word'
  );

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
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: string }
          | null;
        throw new Error(
          payload?.details || payload?.error || `Request failed with status ${response.status}`
        );
      }

      const data = (await response.json()) as AnalysisResult;
      this.result.set(data);
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
}
