import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
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
export class App implements OnInit {
  private static readonly autocompleteStorageKey = 'etymobreak.recentQueries';
  private static readonly autocompleteLimit = 8;

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly rootAutocomplete = signal<string[]>([]);
  protected readonly recentQueries = signal<string[]>(this.loadRecentQueries());
  protected readonly autocompleteOptions = computed(() => {
    const current = this.query().trim().toLowerCase();
    const merged = [...this.rootAutocomplete(), ...this.recentQueries()];
    const unique: string[] = [];
    for (const item of merged) {
      const value = item.trim().toLowerCase();
      if (value && !unique.includes(value)) {
        unique.push(value);
      }
    }

    if (!current) {
      return unique;
    }

    const filtered = unique.filter((item) => item.includes(current));
    return filtered.length ? filtered : unique;
  });

  protected readonly autocompleteId = 'query-autocomplete';

  public ngOnInit(): void {
    void this.loadRootAutocomplete();
  }

  private async loadRootAutocomplete(): Promise<void> {
    try {
      const response = await fetch('/root-autocomplete.json');
      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!Array.isArray(payload)) {
        return;
      }

      const roots = payload
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean);

      this.rootAutocomplete.set(roots);
    } catch {
      return;
    }
  }

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
