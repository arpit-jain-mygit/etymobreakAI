import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
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
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AnalysisResult | null>(null);

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
