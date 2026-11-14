import type { WorkspaceMode, WorkspaceState } from '../types';

export async function apiRequest<T = WorkspaceState>(
  url: string,
  mode: WorkspaceMode,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('x-workspace-mode', mode);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === 'object' && data?.error ? data.error : `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  if (url.startsWith('/api/') && !isJson) {
    throw new Error('Studio API is temporarily reloading. Please try again in a moment.');
  }

  return data as T;
}

export function formatCurrency(usd: number): string {
  return `$${Number(usd || 0).toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
