import type { WorkspaceMode, WorkspaceState } from '../types';

const SESSION_STORAGE_KEY = 'twinforge_tester_session_id';
const OWNER_TOKEN_STORAGE_KEY = 'twinforge_owner_unlock_token';

export function getTesterSessionId(): string {
  if (typeof window === 'undefined') return 'server_local';
  try {
    let existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!existing || !/^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      existing = `sess_${rand}`;
      window.localStorage.setItem(SESSION_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return 'sess_browser_tmp';
  }
}

export function getOwnerUnlockToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(OWNER_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setOwnerUnlockToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = token.trim();
    if (clean) {
      window.sessionStorage.setItem(OWNER_TOKEN_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function apiRequest<T = WorkspaceState>(
  url: string,
  mode: WorkspaceMode,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('x-workspace-mode', mode);
  headers.set('x-workspace-session', getTesterSessionId());
  const ownerToken = getOwnerUnlockToken();
  if (ownerToken) {
    headers.set('x-owner-unlock-token', ownerToken);
  }
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
