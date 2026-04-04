import type { IClerkPublicData } from '@genfeedai/interfaces';

type ClerkUserLike = {
  publicMetadata?: unknown;
};

type PlaywrightClerkWindow = Window &
  typeof globalThis & {
    __clerk_client_state?: {
      session_id?: string;
      sessions?: Array<{
        id?: string;
        lastActiveOrganizationId?: string;
        user?: {
          id?: string;
          publicMetadata?: IClerkPublicData;
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
  publicMetadata: IClerkPublicData | null;
  userId: string | null;
}

export type ClerkTokenGetter = (opts?: {
  forceRefresh?: boolean;
  template?: string;
}) => Promise<string | null>;

const PLAYWRIGHT_JWT_STORAGE_KEYS = ['__clerk_client_jwt', 'clerk-db-jwt'];

export function getClerkPublicData(user: ClerkUserLike): IClerkPublicData {
  return (user.publicMetadata || {}) as unknown as IClerkPublicData;
}

export function getPlaywrightAuthState(): PlaywrightAuthState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const playwrightWindow = window as PlaywrightClerkWindow;
  const clerkState = playwrightWindow.__clerk_client_state;

  if (!clerkState || playwrightWindow.__clerk_is_signed_in !== true) {
    return null;
  }

  const session = clerkState.sessions?.[0];
  const publicMetadata = session?.user?.publicMetadata ?? null;

  return {
    isLoaded: true,
    isSignedIn: true,
    orgId: session?.lastActiveOrganizationId ?? null,
    publicMetadata,
    userId: session?.user?.id ?? clerkState.user_id ?? null,
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

export async function resolveClerkToken(
  getToken: ClerkTokenGetter,
  opts?: {
    forceRefresh?: boolean;
    template?: string;
  },
): Promise<string | null> {
  return (await getToken(opts)) ?? getPlaywrightJwtToken();
}

export function hasPlaywrightJwtToken(): boolean {
  return getPlaywrightJwtToken() !== null;
}
