import * as SecureStore from 'expo-secure-store';
import { API_URL } from '@/services/api/base-http.service';

const AUTH_BASE_URL = `${API_URL.replace(/\/$/, '').replace(/\/v1$/, '')}/v1/auth`;
const SESSION_COOKIE_KEY = 'genfeed.better-auth.session-cookie';
const USER_KEY = 'genfeed.better-auth.user';

export interface MobileAuthUser {
  email: string | null;
  id: string;
  image: string | null;
  name: string | null;
  organizationId: string | null;
}

interface BetterAuthUserResponse {
  email?: string | null;
  id?: string;
  image?: string | null;
  name?: string | null;
}

interface BetterAuthSessionResponse {
  session?: {
    activeOrganizationId?: string | null;
  } | null;
  user?: BetterAuthUserResponse | null;
}

interface BetterAuthSignInResponse {
  user?: BetterAuthUserResponse | null;
}

function normalizeUser(
  data: BetterAuthUserResponse | null | undefined,
  organizationId: string | null = null,
): MobileAuthUser | null {
  if (!data?.id) {
    return null;
  }

  return {
    email: data.email ?? null,
    id: data.id,
    image: data.image ?? null,
    name: data.name ?? null,
    organizationId,
  };
}

function splitSetCookieHeader(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=]+=[^;,]+)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function getSetCookieValues(headers: Headers): string[] {
  const headerWithHelpers = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[] | undefined>;
  };
  const getSetCookie = headerWithHelpers.getSetCookie?.();
  if (getSetCookie?.length) {
    return getSetCookie;
  }

  const rawSetCookie = headerWithHelpers.raw?.()['set-cookie'];
  if (rawSetCookie?.length) {
    return rawSetCookie;
  }

  const header = headers.get('set-cookie') ?? headers.get('Set-Cookie');
  return header ? splitSetCookieHeader(header) : [];
}

function toCookieHeader(headers: Headers): string | null {
  const cookies = getSetCookieValues(headers)
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => {
      return Boolean(cookie && cookie.includes('better-auth.'));
    });

  return cookies.length > 0 ? cookies.join('; ') : null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.error === 'string') {
      return record.error;
    }
  }
  return fallback;
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

async function authFetch<T>(
  path: string,
  options: RequestInit & { cookieHeader?: string } = {},
): Promise<{ cookieHeader: string | null; data: T | null }> {
  const { cookieHeader, headers, ...requestOptions } = options;
  const response = await fetch(`${AUTH_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...headers,
    },
  });
  const data = await parseResponse<T>(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `Auth request failed: ${response.status}`),
    );
  }

  return {
    cookieHeader: toCookieHeader(response.headers),
    data,
  };
}

export const mobileAuthService = {
  async clearStoredSession(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_COOKIE_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  },

  async getJwt(cookieHeader: string): Promise<string | null> {
    const { data } = await authFetch<{ token?: string }>('/token', {
      cookieHeader,
      method: 'GET',
    });
    return data?.token ?? null;
  },

  async getStoredSession(): Promise<{
    cookieHeader: string | null;
    user: MobileAuthUser | null;
  }> {
    const [cookieHeader, storedUser] = await Promise.all([
      SecureStore.getItemAsync(SESSION_COOKIE_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);

    return {
      cookieHeader,
      user: storedUser ? (JSON.parse(storedUser) as MobileAuthUser) : null,
    };
  },

  async refreshSession(cookieHeader: string): Promise<MobileAuthUser | null> {
    const { data } = await authFetch<BetterAuthSessionResponse>(
      '/get-session',
      {
        cookieHeader,
        method: 'GET',
      },
    );
    const user = normalizeUser(
      data?.user,
      data?.session?.activeOrganizationId ?? null,
    );

    if (user) {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    return user;
  },

  async signInWithEmail(input: {
    email: string;
    password: string;
  }): Promise<{ cookieHeader: string; user: MobileAuthUser }> {
    const { cookieHeader, data } = await authFetch<BetterAuthSignInResponse>(
      '/sign-in/email',
      {
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          rememberMe: true,
        }),
        method: 'POST',
      },
    );
    const user = normalizeUser(data?.user);

    if (!cookieHeader || !user) {
      throw new Error('Sign in did not return a usable Better Auth session.');
    }

    await Promise.all([
      SecureStore.setItemAsync(SESSION_COOKIE_KEY, cookieHeader),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);

    return { cookieHeader, user };
  },

  async signOut(cookieHeader: string | null): Promise<void> {
    if (cookieHeader) {
      await authFetch('/sign-out', {
        cookieHeader,
        method: 'POST',
      }).catch(() => null);
    }

    await this.clearStoredSession();
  },
};
