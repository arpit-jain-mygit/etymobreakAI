import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getApiBaseUrl } from './api-base';

interface AnalysisPart {
  label: string;
  type: string;
  meaning: string;
  source?: string;
}

interface RelatedWord {
  word: string;
  meaning: string;
  explanation?: string;
  exampleSentence?: string;
}

interface AnalysisResult {
  query: string;
  mode: string;
  title: string;
  summary: string;
  literalMeaning: string;
  actualMeaning: string;
  parts: AnalysisPart[];
  relatedWords: RelatedWord[];
  notes: string[];
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private static readonly autocompleteStorageKey = 'etymobreak.recentQueries';
  private static readonly autocompleteLimit = 8;

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly recentQueries = signal<string[]>(this.loadRecentQueries());
  protected readonly autocompleteOptions = computed(() => {
    const current = this.query().trim().toLowerCase();
    const recent = this.recentQueries();

    if (!current) {
      return recent;
    }

    const filtered = recent.filter((item) => item.toLowerCase().includes(current));
    return filtered.length ? filtered : recent;
  });

  protected readonly autocompleteId = 'query-autocomplete';

  private loadRecentQueries(): string[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(App.autocompleteStorageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, App.autocompleteLimit);
    } catch {
      return [];
    }
  }

  private saveRecentQueries(values: string[]): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(App.autocompleteStorageKey, JSON.stringify(values));
    } catch {
      return;
    }
  }

  private rememberQuery(query: string): void {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const next = [normalized, ...this.recentQueries().filter((item) => item !== normalized)].slice(
      0,
      App.autocompleteLimit
    );
    this.recentQueries.set(next);
    this.saveRecentQueries(next);
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

      const data = (await response.json()) as AnalysisResult;
      this.result.set(data);
      this.rememberQuery(normalized);
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
