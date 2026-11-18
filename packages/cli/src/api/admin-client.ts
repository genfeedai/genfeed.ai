import { getAdminSession, getApiUrl } from '@/config/store';
import { ApiError, GenfeedError } from '@/utils/errors';

/** Refresh a minted JWT this long before it expires. */
const TOKEN_REFRESH_SKEW_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;

interface CachedAdminToken {
  expiresAtMs: number;
  sessionCookieValue: string;
  token: string;
}

interface AdminErrorBody {
  /** The marketplace API answers guard refusals as a bare `{ detail, title }`. */
  detail?: string;
  errors?: Array<{ detail?: string; title?: string }>;
  message?: string | string[];
  title?: string;
}

let cachedToken: CachedAdminToken | null = null;

export function clearAdminTokenCache(): void {
  cachedToken = null;
}

function loginHint(): string {
  return 'Run `genfeed admin login` to sign in as a super admin';
}

function readJwtExpiryMs(token: string): number {
  try {
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    if (typeof claims.exp === 'number') return claims.exp * 1000;
  } catch {
    // Fall through to the conservative default below.
  }
  return Date.now() + 5 * 60_000;
}

function readErrorMessage(body: AdminErrorBody | undefined, fallback: string): string {
  if (Array.isArray(body?.message)) return body.message.join(', ');
  if (body?.message) return body.message;
  const [first] = body?.errors ?? [];
  return first?.detail ?? first?.title ?? body?.detail ?? body?.title ?? fallback;
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/**
 * Swap the stored Better Auth session for a short-lived JWT. The session cookie
 * is never sent to an admin route; only the minted bearer token is.
 */
async function mintAdminToken(apiUrl: string): Promise<string> {
  const session = await getAdminSession();
  if (!session) {
    throw new GenfeedError('Not signed in as an admin', loginHint());
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new GenfeedError('Admin session expired', loginHint());
  }

  if (
    cachedToken &&
    cachedToken.sessionCookieValue === session.cookieValue &&
    cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return cachedToken.token;
  }

  const response = await fetch(`${apiUrl}/auth/token`, {
    headers: { Cookie: `${session.cookieName}=${session.cookieValue}` },
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GenfeedError('Admin session is no longer valid', loginHint());
  }
  if (!response.ok) {
    throw new ApiError(`Could not mint an admin token (HTTP ${response.status})`, response.status);
  }

  const body = await readJson<{ token?: unknown }>(response);
  if (typeof body?.token !== 'string' || !body.token) {
    throw new GenfeedError('The API returned no admin token');
  }

  cachedToken = {
    expiresAtMs: readJwtExpiryMs(body.token),
    sessionCookieValue: session.cookieValue,
    token: body.token,
  };
  return body.token;
}

/** Confirms the stored session still mints a token, without calling an admin route. */
export async function verifyAdminSession(): Promise<void> {
  await mintAdminToken(await getApiUrl());
}

/**
 * `baseUrl` sends the request to another Genfeed service that trusts the same
 * super admin token (the marketplace API). The token is always minted by the
 * Genfeed API of the active profile.
 */
export async function adminRequest<T>(
  method: 'GET' | 'PATCH' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  baseUrl?: string
): Promise<T> {
  const apiUrl = await getApiUrl();
  const token = await mintAdminToken(apiUrl);

  const response = await fetch(`${baseUrl ?? apiUrl}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await readJson<AdminErrorBody>(response);
    const message = readErrorMessage(errorBody, `Request failed with status ${response.status}`);

    if (response.status === 401) {
      throw new GenfeedError(message, loginHint());
    }
    if (response.status === 403) {
      throw new ApiError(
        message,
        response.status,
        baseUrl
          ? 'This route needs a super admin account'
          : 'Admin routes need a super admin account on an allowlisted IP (ADMIN_ALLOWED_IPS)'
      );
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export function adminGet<T>(path: string, baseUrl?: string): Promise<T> {
  return adminRequest<T>('GET', path, undefined, baseUrl);
}

export function adminPost<T>(path: string, body?: unknown, baseUrl?: string): Promise<T> {
  return adminRequest<T>('POST', path, body ?? {}, baseUrl);
}

export function adminPatch<T>(path: string, body: unknown): Promise<T> {
  return adminRequest<T>('PATCH', path, body);
}

/** Best-effort server-side revoke of the stored session. */
export async function revokeAdminSession(apiUrl: string, cookie: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/auth/sign-out`, {
      body: '{}',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
