import { Storage } from '@plasmohq/storage';
import { apiEndpoint, authCookieOrigins } from '~services/environment.service';
import { logger } from '~utils/logger.util';

const storage = new Storage();
const TOKEN_STORAGE_KEY = 'genfeed_token';
const AUTH_CONTEXT_STORAGE_KEY = 'genfeed_auth_context';
const AUTH_CONTEXT_TTL_MS = 30_000;

export async function getJWTToken(
  getToken: (options?: { template?: string }) => Promise<string | null>,
): Promise<string | null> {
  try {
    return await getToken({ template: 'genfeed-jwt' });
  } catch {
    return null;
  }
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  error?: string;
}

export interface TokenInfo {
  token: string;
  expiresAt?: number;
}

interface AuthIdentity {
  id: string;
  email?: string;
  name?: string;
}

interface AuthOrganization {
  id: string;
  name?: string;
}

export interface AuthContext {
  user: AuthIdentity;
  organization: AuthOrganization;
  scopes: string[];
  isApiKey: boolean;
}

interface AuthContextResponse {
  data?: AuthContext;
}

export type AuthenticatedRequestGuard = (
  verifiedContext: AuthContext,
) => void | Promise<void>;

class AuthIdentityRequestError extends Error {
  constructor(public readonly status: number) {
    super(
      'Your refreshed credential no longer has access. Open Genfeed, then retry.',
    );
  }
}

class AuthService {
  private static instance: AuthService;
  private tokenCache: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private authContextCache: AuthContext | null = null;
  private authContextCheckedAt = 0;
  // Identity verified for one exact credential. Keying by the token string
  // keeps the guard's guarantee while sparing a /auth/whoami round trip on
  // every scoped request (for example each chat poll).
  private verifiedByToken: {
    token: string;
    context: AuthContext;
    checkedAt: number;
  } | null = null;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshToken(): Promise<string | null> {
    // Popup, panel and service worker have separate instances. Storage is the
    // shared credential source so another surface's refresh/logout takes effect.
    const storedToken = (await storage.get<string>(TOKEN_STORAGE_KEY)) ?? null;
    if (storedToken !== this.tokenCache) {
      this.tokenCache = storedToken;
      this.authContextCache = null;
      this.verifiedByToken = null;
    }
    if (storedToken && !this.isExpiringJwt(storedToken)) return storedToken;
    return (await this.exchangeSessionToken()) ?? storedToken;
  }

  private isExpiringJwt(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(payload)) as { exp?: unknown };
      // This is only a refresh hint. Identity and workspace always come from
      // the authenticated API, never from locally decoded JWT claims.
      return (
        typeof claims.exp === 'number' &&
        claims.exp * 1000 <= Date.now() + 5_000
      );
    } catch {
      return false;
    }
  }

  private async exchangeSessionToken(
    signal?: AbortSignal,
  ): Promise<string | null> {
    // Better Auth's opaque session cookie is not an API Bearer credential.
    // The browser sends the HttpOnly API cookie; /token mints the verified JWT.
    const response = await fetch(`${apiEndpoint}/auth/token`, {
      credentials: 'include',
      method: 'GET',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok)
      throw new Error(
        `Could not refresh your Genfeed session (HTTP ${response.status}). Retry in a moment.`,
      );
    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      throw new Error(
        'Genfeed did not return an API token. Retry in a moment.',
      );
    }
    await this.setToken(body.token);
    return body.token;
  }

  invalidateAuthContext(): void {
    this.authContextCache = null;
    this.authContextCheckedAt = 0;
    this.verifiedByToken = null;
  }

  async refreshSessionToken(signal?: AbortSignal): Promise<string | null> {
    const stored = await storage.get<string>(TOKEN_STORAGE_KEY);
    if (stored?.startsWith('gf_')) return stored;
    const token = await this.exchangeSessionToken(signal);
    if (!token) await this.clearToken();
    this.invalidateAuthContext();
    return token;
  }

  async setToken(token: string): Promise<void> {
    try {
      await storage.set(TOKEN_STORAGE_KEY, token);
      this.tokenCache = token;
      this.authContextCache = null;
      this.verifiedByToken = null;
      await storage.remove(AUTH_CONTEXT_STORAGE_KEY);
    } catch (error) {
      logger.error('Error storing token', error);
    }
  }

  async clearToken(): Promise<void> {
    try {
      await storage.remove(TOKEN_STORAGE_KEY);
      await storage.remove(AUTH_CONTEXT_STORAGE_KEY);
      this.tokenCache = null;
      this.authContextCache = null;
      this.verifiedByToken = null;
    } catch (error) {
      logger.error('Error clearing token', error);
    }
  }

  async isAuthenticated(): Promise<AuthState> {
    try {
      const token = await this.getToken();
      return {
        isAuthenticated: !!token,
        token,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        isAuthenticated: false,
        token: null,
      };
    }
  }

  async makeAuthenticatedRequest(
    url: string,
    options: RequestInit = {},
    beforeAuthenticatedSend?: AuthenticatedRequestGuard,
  ): Promise<Response> {
    let token = await this.getToken();
    let isRefreshConsumed = false;
    if (!token)
      throw new Error('Sign in to Genfeed in the web app, then retry.');
    if (beforeAuthenticatedSend) {
      let context: AuthContext;
      try {
        context = await this.verifiedContext(
          token,
          options.signal ?? undefined,
        );
      } catch (error) {
        if (
          !(error instanceof AuthIdentityRequestError) ||
          error.status !== 401 ||
          token.startsWith('gf_')
        )
          throw error;
        isRefreshConsumed = true;
        const renewed = await this.exchangeSessionToken(
          options.signal ?? undefined,
        );
        if (!renewed) {
          await this.clearToken();
          throw new Error(
            'Your Genfeed session expired. Sign in in the web app, then retry.',
          );
        }
        token = renewed;
        context = await this.verifiedContext(
          token,
          options.signal ?? undefined,
        );
      }
      await beforeAuthenticatedSend(context);
    }

    const request = (credential: string) => {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${credential}`);
      if (!headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
      return fetch(url, { ...options, headers, redirect: 'error' });
    };
    let response = await request(token);
    if (response.status === 401) {
      if (token.startsWith('gf_')) {
        throw new Error(
          'This Genfeed API key was rejected. Update your API key or sign in from the extension popup.',
        );
      }
      if (isRefreshConsumed) {
        await this.clearToken();
        throw new Error(
          'Your Genfeed session expired. Sign in in the web app, then retry.',
        );
      }
      // Retry once after an expired JWT or legacy stored cookie is rejected.
      // An API outage must not silently erase a working browser session.
      const refreshed = await this.exchangeSessionToken(
        options.signal ?? undefined,
      );
      if (refreshed) {
        if (beforeAuthenticatedSend)
          await beforeAuthenticatedSend(
            await this.verifiedContext(refreshed, options.signal ?? undefined),
          );
        response = await request(refreshed);
      }
      if (!refreshed || response.status === 401) {
        await this.clearToken();
        throw new Error(
          'Your Genfeed session expired. Sign in in the web app, then retry.',
        );
      }
    }
    return response;
  }

  private async verifiedContext(
    token: string,
    signal?: AbortSignal,
  ): Promise<AuthContext> {
    const cached = this.verifiedByToken;
    if (
      cached &&
      cached.token === token &&
      Date.now() - cached.checkedAt < AUTH_CONTEXT_TTL_MS
    )
      return cached.context;
    const context = await this.readAuthContextWithToken(token, signal);
    this.verifiedByToken = { token, context, checkedAt: Date.now() };
    return context;
  }

  private async readAuthContextWithToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<AuthContext> {
    const response = await fetch(`${apiEndpoint}/auth/whoami`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal,
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403)
      throw new AuthIdentityRequestError(response.status);
    if (!response.ok)
      throw new Error(
        `Could not verify the refreshed session (HTTP ${response.status}). Retry.`,
      );
    const body = (await response.json()) as AuthContextResponse;
    const context = body.data;
    if (
      !context ||
      typeof context.user?.id !== 'string' ||
      typeof context.organization?.id !== 'string' ||
      !context.user.id ||
      !context.organization.id
    )
      throw new Error(
        'Genfeed did not confirm the refreshed account and workspace. Retry.',
      );
    return context;
  }

  async validateToken(): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) {
        return false;
      }

      const response = await this.makeAuthenticatedRequest(
        `${apiEndpoint}/auth/whoami`,
        { method: 'GET' },
      );

      return response.ok;
    } catch (error) {
      logger.error('Token validation failed', error);
      return false;
    }
  }

  async getAuthContext(
    forceRefresh = false,
    signal?: AbortSignal,
  ): Promise<AuthContext | null> {
    if (!(await this.getToken())) {
      throw new Error('Sign in to Genfeed in the web app, then retry.');
    }
    if (
      this.authContextCache &&
      !forceRefresh &&
      Date.now() - this.authContextCheckedAt < AUTH_CONTEXT_TTL_MS
    ) {
      return this.authContextCache;
    }
    // Persisted context from an older token is not proof of current access.
    const response = await this.makeAuthenticatedRequest(
      `${apiEndpoint}/auth/whoami`,
      {
        method: 'GET',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 403) {
      throw new Error(
        'This credential does not have access to the selected workspace. Open Genfeed and check your workspace, then retry.',
      );
    }
    if (!response.ok) {
      throw new Error(
        `Could not load your Genfeed workspace (HTTP ${response.status}). Retry in a moment.`,
      );
    }
    const body = (await response.json()) as {
      data?: {
        user?: AuthIdentity;
        organization?: AuthOrganization;
        scopes?: string[];
        isApiKey?: boolean;
      };
    };
    const data = body.data;
    if (!data?.user?.id)
      throw new Error(
        'Genfeed did not return your account identity. Retry in a moment.',
      );
    if (!data.organization?.id) {
      throw new Error(
        'Your session is valid, but Genfeed did not return an active workspace. Open Genfeed, select a workspace, then retry.',
      );
    }
    const context: AuthContext = {
      isApiKey: Boolean(data.isApiKey),
      organization: { id: data.organization.id, name: data.organization.name },
      scopes: data.scopes ?? [],
      user: { email: data.user.email, id: data.user.id, name: data.user.name },
    };
    this.authContextCache = context;
    this.authContextCheckedAt = Date.now();
    return context;
  }

  async hasOrganizationContext(forceRefresh = false): Promise<boolean> {
    const context = await this.getAuthContext(forceRefresh);
    return Boolean(context?.organization?.id);
  }

  debugCookies(): void {
    for (const origin of authCookieOrigins) {
      chrome.cookies.getAll({ url: origin }, (_cookies) => {
        // Debug callback - intentionally empty
      });
    }
  }

  async getTokenInfo(): Promise<TokenInfo | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }
    return { token };
  }
}

export const authService = AuthService.getInstance();

export const getToken = () => authService.getToken();
export const setToken = (token: string) => authService.setToken(token);
export const clearToken = () => authService.clearToken();
export const isAuthenticated = () => authService.isAuthenticated();
export const makeAuthenticatedRequest = (url: string, options?: RequestInit) =>
  authService.makeAuthenticatedRequest(url, options);
export const getAuthContext = (forceRefresh?: boolean) =>
  authService.getAuthContext(forceRefresh);
