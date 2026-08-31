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

function isLegacyClerkHostname(hostname: string): boolean {
  return (
    hostname === 'clerk.com' ||
    hostname.endsWith('.clerk.com') ||
    hostname === 'clerk.dev' ||
    hostname.endsWith('.clerk.dev')
  );
}

/**
 * Better Auth maps its session image field to the canonical users.avatar
 * column. Migrated users can still carry an old Clerk proxy URL in that
 * column, but Clerk is no longer an auth or image-hosting dependency.
 */
export function normalizeAuthAvatarUrl(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      isLegacyClerkHostname(parsed.hostname.toLowerCase())
    ) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

export function getAuthPublicData(user: AuthUserLike): IAuthPublicData {
  return (user.publicMetadata || {}) as IAuthPublicData;
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

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== 'function') {
      return null;
    }

    for (const key of PLAYWRIGHT_JWT_STORAGE_KEYS) {
      const token = storage.getItem(key)?.trim();

      if (token) {
        return token;
      }
    }
  } catch {
    return null;
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
