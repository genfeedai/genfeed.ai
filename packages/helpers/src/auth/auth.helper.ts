import type { IAuthPublicData } from '@genfeedai/interfaces';

type AuthUserLike = {
  publicMetadata?: unknown;
};

type PlaywrightAuthWindow = Window &
  typeof globalThis & {
    __better_auth_client_state?: {
      session_id?: string;
      sessions?: Array<{
        id?: string;
        lastActiveOrganizationId?: string;
        user?: {
          id?: string;
          publicMetadata?: IAuthPublicData;
        };
      }>;
      user_id?: string;
    };
    __better_auth_is_signed_in?: boolean;
  };

export interface PlaywrightAuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  orgId: string | null;
  publicMetadata: IAuthPublicData | null;
  userId: string | null;
}

export interface AuthTokenOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
  template?: string;
}

export type AuthTokenGetter = (
  opts?: AuthTokenOptions,
) => Promise<string | null>;

const PLAYWRIGHT_JWT_STORAGE_KEYS = [
  '__better_auth_client_jwt',
  'better-auth-db-jwt',
];

export function getAuthPublicData(user: AuthUserLike): IAuthPublicData {
  return (user.publicMetadata || {}) as unknown as IAuthPublicData;
}

export function getPlaywrightAuthState(): PlaywrightAuthState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const playwrightWindow = window as PlaywrightAuthWindow;
  const authState = playwrightWindow.__better_auth_client_state;

  if (!authState || playwrightWindow.__better_auth_is_signed_in !== true) {
    return null;
  }

  const session = authState.sessions?.[0];
  const publicMetadata = session?.user?.publicMetadata ?? null;

  return {
    isLoaded: true,
    isSignedIn: true,
    orgId: session?.lastActiveOrganizationId ?? null,
    publicMetadata,
    userId: session?.user?.id ?? authState.user_id ?? null,
  };
}

export function getPlaywrightJwtToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  for (const key of PLAYWRIGHT_JWT_STORAGE_KEYS) {
    const token = window.localStorage.getItem(key)?.trim();

    if (token) {
      return token;
    }
  }

  return null;
}

export async function resolveAuthToken(
  getToken: AuthTokenGetter,
  opts?: AuthTokenOptions,
): Promise<string | null> {
  return (await getToken(opts)) ?? getPlaywrightJwtToken();
}

export async function resolveRequiredAuthToken(
  getToken: AuthTokenGetter,
  opts: AuthTokenOptions | undefined,
  createError: () => Error,
): Promise<string> {
  const token = await resolveAuthToken(getToken, opts);

  if (!token) {
    throw createError();
  }

  return token;
}

export function hasPlaywrightJwtToken(): boolean {
  return getPlaywrightJwtToken() !== null;
}
