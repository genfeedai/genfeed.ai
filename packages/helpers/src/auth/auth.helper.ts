import type { IAuthPublicData } from '@genfeedai/interfaces';

type AuthUserLike = {
  publicMetadata?: unknown;
};

type PlaywrightAuthWindow = Window &
  typeof globalThis & {
    __clerk_client_state?: {
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
    __clerk_is_signed_in?: boolean;
  };

export interface PlaywrightAuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  orgId: string | null;
  publicMetadata: IAuthPublicData | null;
  userId: string | null;
}

export type AuthTokenGetter = (opts?: {
  forceRefresh?: boolean;
  template?: string;
}) => Promise<string | null>;

const PLAYWRIGHT_JWT_STORAGE_KEYS = ['__clerk_client_jwt', 'clerk-db-jwt'];

export function getAuthPublicData(user: AuthUserLike): IAuthPublicData {
  return (user.publicMetadata || {}) as unknown as IAuthPublicData;
}

export function getPlaywrightAuthState(): PlaywrightAuthState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const playwrightWindow = window as PlaywrightAuthWindow;
  const authState = playwrightWindow.__clerk_client_state;

  if (!authState || playwrightWindow.__clerk_is_signed_in !== true) {
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
  opts?: {
    forceRefresh?: boolean;
    template?: string;
  },
): Promise<string | null> {
  const { getBetterAuthToken } = await import('@genfeedai/auth-client');
  return (
    (await getBetterAuthToken()) ??
    (await getToken(opts)) ??
    getPlaywrightJwtToken()
  );
}

export function hasPlaywrightJwtToken(): boolean {
  return getPlaywrightJwtToken() !== null;
}
