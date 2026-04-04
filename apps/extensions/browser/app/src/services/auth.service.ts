import { Storage } from '@plasmohq/storage';
import { EnvironmentService } from '~services/environment.service';
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

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getToken(): Promise<string | null> {
    if (this.tokenCache) {
      return this.tokenCache;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshToken();
    const token = await this.refreshPromise;
    this.refreshPromise = null;

    return token;
  }

  private async refreshToken(): Promise<string | null> {
    try {
      const storedToken = await storage.get<string>(TOKEN_STORAGE_KEY);
      if (storedToken) {
        this.tokenCache = storedToken;
        return storedToken;
      }

      const cookieToken = await this.getTokenFromCookies();
      if (cookieToken) {
        await this.setToken(cookieToken);
        return cookieToken;
      }

      return null;
    } catch (error) {
      logger.error('Error refreshing token', error);
      return null;
    }
  }

  private getTokenFromCookies(): Promise<string | null> {
    return new Promise((resolve) => {
      const domain = EnvironmentService.websiteDomain;
      const cookieNames = [
        '__session',
        '__clerk_session',
        'clerk-session',
        'session',
        '__clerk_db_jwt',
        'clerk-db-jwt',
        'jwt',
        'token',
      ];

      const tryNextCookie = (index: number) => {
        if (index >= cookieNames.length) {
          resolve(null);
          return;
        }

        chrome.cookies.get(
          {
            name: cookieNames[index],
            url: domain,
          },
          (cookie) => {
            if (cookie?.value) {
              resolve(cookie.value);
            } else {
              tryNextCookie(index + 1);
            }
          },
        );
      };

      tryNextCookie(0);
    });
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

    if (!token) {
      throw new Error('No authentication token available');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await this.clearToken();
      throw new Error('Authentication token expired');
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
        `${EnvironmentService.apiEndpoint}/auth/validate`,
        { method: 'GET' },
      );

      return response.ok;
    } catch (error) {
      logger.error('Token validation failed', error);
      return false;
    }
  }

  async getAuthContext(forceRefresh = false): Promise<AuthContext | null> {
    if (this.authContextCache && !forceRefresh) {
      return this.authContextCache;
    }

    if (!forceRefresh) {
      const storedContext = await storage.get<AuthContext>(
        AUTH_CONTEXT_STORAGE_KEY,
      );
      if (storedContext) {
        this.authContextCache = storedContext;
        return storedContext;
      }
    }

    try {
      const response = await this.makeAuthenticatedRequest(
        `${EnvironmentService.apiEndpoint}/auth/whoami`,
        { method: 'GET' },
      );

      if (!response.ok) {
        return null;
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
      const context: AuthContext | null =
        data?.user?.id && data?.organization?.id
          ? {
              isApiKey: Boolean(data.isApiKey),
              organization: {
                id: data.organization.id,
                name: data.organization.name,
              },
              scopes: data.scopes ?? [],
              user: {
                email: data.user.email,
                id: data.user.id,
                name: data.user.name,
              },
            }
          : null;

      if (context) {
        this.authContextCache = context;
        await storage.set(AUTH_CONTEXT_STORAGE_KEY, context);
      }

      return context;
    } catch (error) {
      logger.error('Failed to fetch auth context', error);
      return null;
    }
  }

  async hasOrganizationContext(forceRefresh = false): Promise<boolean> {
    const context = await this.getAuthContext(forceRefresh);
    return Boolean(context?.organization?.id);
  }

  debugCookies(): void {
    const cookieDomain = EnvironmentService.cookieDomain;
    chrome.cookies.getAll({ domain: cookieDomain }, (_cookies) => {
      // Debug callback - intentionally empty
    });
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
