export function getApiBaseUrl(): string {
  const globalUrl = (globalThis as typeof globalThis & {
    __ETYMOBREAK_API_BASE_URL__?: string;
  }).__ETYMOBREAK_API_BASE_URL__;

  if (globalUrl) {
    return globalUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000';
  }

  return 'https://etymobreak-ai-api.onrender.com';
}
