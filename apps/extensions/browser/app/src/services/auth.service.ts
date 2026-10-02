import { Storage } from '@plasmohq/storage';
import { apiEndpoint, authCookieOrigins } from '~services/environment.service';
import { logger } from '~utils/logger.util';

const storage = new Storage();
const TOKEN_STORAGE_KEY = 'genfeed_token';
const AUTH_CONTEXT_STORAGE_KEY = 'genfeed_auth_context';

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

class AuthService {
  private static instance: AuthService;
  private tokenCache: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private authContextCache: AuthContext | null = null;
  private authContextCheckedAt = 0;

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

  private async exchangeSessionToken(): Promise<string | null> {
    // Better Auth's opaque session cookie is not an API Bearer credential.
    // The browser sends the HttpOnly API cookie; /token mints the verified JWT.
    const response = await fetch(`${apiEndpoint}/auth/token`, {
      credentials: 'include',
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
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

  async setToken(token: string): Promise<void> {
    try {
      await storage.set(TOKEN_STORAGE_KEY, token);
      this.tokenCache = token;
      this.authContextCache = null;
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
  ): Promise<Response> {
    const token = await this.getToken();
    if (!token)
      throw new Error('Sign in to Genfeed in the web app, then retry.');

    const request = (credential: string) => {
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${credential}`);
      if (!headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
      return fetch(url, { ...options, headers });
    };
    let response = await request(token);
    if (response.status === 401) {
      if (token.startsWith('gf_')) {
        throw new Error(
          'This Genfeed API key was rejected. Update your API key or sign in from the extension popup.',
        );
      }
      // Retry once after an expired JWT or legacy stored cookie is rejected.
      // An API outage must not silently erase a working browser session.
      const refreshed = await this.exchangeSessionToken();
      if (refreshed) response = await request(refreshed);
      if (!refreshed || response.status === 401) {
        await this.clearToken();
        throw new Error(
          'Your Genfeed session expired. Sign in in the web app, then retry.',
        );
      }
    }
    return response;
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

  async getAuthContext(forceRefresh = false): Promise<AuthContext | null> {
    if (!(await this.getToken())) {
      throw new Error('Sign in to Genfeed in the web app, then retry.');
    }
    if (
      this.authContextCache &&
      !forceRefresh &&
      Date.now() - this.authContextCheckedAt < 30_000
    ) {
      return this.authContextCache;
    }
    // Persisted context from an older token is not proof of current access.
    const response = await this.makeAuthenticatedRequest(
      `${apiEndpoint}/auth/whoami`,
      { method: 'GET', signal: AbortSignal.timeout(15_000) },
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
