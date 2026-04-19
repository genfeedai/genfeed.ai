'use client';

import type { UserResource } from '@clerk/types';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IClerkPublicData, IUser } from '@genfeedai/interfaces';
import type { ProtectedAppBootstrapPayload } from '@genfeedai/services/auth/auth.service';
import { Button } from '@ui/primitives/button';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getDesktopBridge, isDesktopShell } from '@/lib/desktop/runtime';
import { getDesktopSessionId } from './session-id';

type DesktopAuthSnapshot = {
  accessState: ProtectedAppBootstrapPayload['access'] | null;
  currentUser: IUser | null;
  isLoaded: boolean;
  /** True when running in desktop shell with no active cloud session. */
  isOfflineMode: boolean;
  session: {
    issuedAt: string;
    token: string;
    userEmail?: string;
    userId: string;
    userName?: string;
  } | null;
};

type DesktopUser = UserResource & {
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  publicMetadata: IClerkPublicData;
};

const LOCAL_SESSION_TOKEN = 'genfeed-local-session';

const EMPTY_PUBLIC_DATA: IClerkPublicData = {
  accountType: undefined,
  balance: undefined,
  brand: '',
  category: undefined,
  hasEverHadCredits: false,
  isOnboardingCompleted: false,
  isSuperAdmin: false,
  organization: '',
  stripeCustomerId: '',
  stripePriceId: '',
  stripeSubscriptionId: '',
  stripeSubscriptionStatus: '',
  subscriptionTier: undefined,
  user: '',
};

const EMPTY_SNAPSHOT: DesktopAuthSnapshot = {
  accessState: null,
  currentUser: null,
  isLoaded: false,
  isOfflineMode: false,
  session: null,
};

let snapshot = EMPTY_SNAPSHOT;
let initialized = false;
let refreshGeneration = 0;
const listeners = new Set<() => void>();

function emit(nextSnapshot: DesktopAuthSnapshot): void {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => {
    listener();
  });
}

function buildPublicMetadata(
  accessState: ProtectedAppBootstrapPayload['access'] | null,
): IClerkPublicData {
  if (!accessState) {
    return EMPTY_PUBLIC_DATA;
  }

  return {
    ...EMPTY_PUBLIC_DATA,
    balance: accessState.creditsBalance,
    brand: accessState.brandId,
    hasEverHadCredits: accessState.hasEverHadCredits,
    isOnboardingCompleted: accessState.isOnboardingCompleted,
    isSuperAdmin: accessState.isSuperAdmin,
    organization: accessState.organizationId,
    stripeSubscriptionStatus: accessState.subscriptionStatus,
    subscriptionTier: accessState.subscriptionTier,
    user: accessState.userId,
  };
}

function buildUser(
  currentUser: IUser | null,
  accessState: ProtectedAppBootstrapPayload['access'] | null,
  reload: () => Promise<void>,
): DesktopUser | null {
  if (!currentUser || !accessState) {
    return null;
  }

  const emailAddress = currentUser.email || '';
  const fullName =
    currentUser.fullName ||
    `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() ||
    currentUser.handle ||
    currentUser.email;

  return {
    emailAddresses: emailAddress
      ? [{ emailAddress, id: `${currentUser.id}-primary` }]
      : [],
    firstName: currentUser.firstName ?? '',
    fullName,
    id: currentUser.id,
    imageUrl: currentUser.avatar || '',
    lastName: currentUser.lastName ?? '',
    primaryEmailAddress: emailAddress ? { emailAddress } : null,
    publicMetadata: buildPublicMetadata(accessState),
    reload,
  } as unknown as DesktopUser;
}

async function fetchBootstrap(
  token: string,
): Promise<ProtectedAppBootstrapPayload | null> {
  try {
    const response = await fetch('/v1/auth/bootstrap', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ProtectedAppBootstrapPayload;
  } catch {
    return null;
  }
}

async function refreshSnapshot(
  nextSession?: DesktopAuthSnapshot['session'] | null,
): Promise<void> {
  const generation = ++refreshGeneration;

  if (!isDesktopShell()) {
    const bootstrap = await fetchBootstrap('');

    if (generation === refreshGeneration) {
      emit(
        bootstrap
          ? {
              accessState: bootstrap.access,
              currentUser: bootstrap.currentUser,
              isLoaded: true,
              isOfflineMode: false,
              session: {
                issuedAt: new Date().toISOString(),
                token: LOCAL_SESSION_TOKEN,
                userEmail: bootstrap.currentUser?.email ?? undefined,
                userId: bootstrap.access.userId,
                userName:
                  bootstrap.currentUser?.fullName ??
                  bootstrap.currentUser?.handle ??
                  bootstrap.currentUser?.email ??
                  undefined,
              },
            }
          : { ...EMPTY_SNAPSHOT, isLoaded: true },
      );
    }
    return;
  }

  const bridge = getDesktopBridge();

  if (!bridge) {
    if (generation === refreshGeneration) {
      emit({ ...EMPTY_SNAPSHOT, isLoaded: true });
    }
    return;
  }

  const session =
    nextSession === undefined ? await bridge.auth.getSession() : nextSession;

  if (!session) {
    if (generation === refreshGeneration) {
      // No cloud session — desktop offline mode. Signal to auth guards that
      // this is a valid state (not unauthenticated) so they don't redirect to /login.
      emit({
        accessState: null,
        currentUser: null,
        isLoaded: true,
        isOfflineMode: true,
        session: null,
      });
    }
    return;
  }

  const bootstrap = await fetchBootstrap(session.token);

  if (generation !== refreshGeneration) {
    return;
  }

  if (!bootstrap) {
    emit({
      accessState: null,
      currentUser: null,
      isLoaded: true,
      isOfflineMode: false,
      session: null,
    });
    return;
  }

  emit({
    accessState: bootstrap.access,
    currentUser: bootstrap.currentUser,
    isLoaded: true,
    isOfflineMode: false,
    session,
  });
}

function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;
  void refreshSnapshot();

  if (!isDesktopShell()) {
    return;
  }

  const bridge = getDesktopBridge();
  if (!bridge) {
    return;
  }

  bridge.auth.onDidChangeSession((session: DesktopAuthSnapshot['session']) => {
    void refreshSnapshot(session);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useDesktopSnapshot(): DesktopAuthSnapshot {
  ensureInitialized();

  const currentSnapshot = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );

  useEffect(() => {
    ensureInitialized();
    return () => undefined;
  }, []);

  return currentSnapshot;
}

async function signOutDesktop(redirectUrl?: string): Promise<void> {
  if (!isDesktopShell()) {
    emit({
      accessState: null,
      currentUser: null,
      isLoaded: true,
      isOfflineMode: false,
      session: null,
    });

    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
    return;
  }

  const bridge = getDesktopBridge();
  if (!bridge) {
    return;
  }

  await bridge.auth.logout();
  await refreshSnapshot(null);

  if (redirectUrl) {
    window.location.assign(redirectUrl);
  }
}

export function ClerkProvider({
  children,
  ..._props
}: {
  children: ReactNode;
  [key: string]: unknown;
}): ReactNode {
  ensureInitialized();
  return children;
}

function isSnapshotSignedIn(s: DesktopAuthSnapshot): boolean {
  return s.session !== null || s.accessState !== null || s.isOfflineMode;
}

export function useAuth() {
  const currentSnapshot = useDesktopSnapshot();
  const isSignedIn = isSnapshotSignedIn(currentSnapshot);

  return useMemo(
    () => ({
      getToken: async () => currentSnapshot.session?.token ?? '',
      isLoaded: currentSnapshot.isLoaded,
      isSignedIn,
      orgId: currentSnapshot.accessState?.organizationId ?? null,
      orgRole: null,
      orgSlug: null,
      sessionId: getDesktopSessionId(currentSnapshot.session?.token ?? null),
      signOut: async () => signOutDesktop(),
      userId:
        currentSnapshot.accessState?.userId ??
        currentSnapshot.session?.userId ??
        null,
    }),
    [currentSnapshot, isSignedIn],
  );
}

export function useUser(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: DesktopUser | null;
} {
  const currentSnapshot = useDesktopSnapshot();

  return useMemo(() => {
    const user = buildUser(
      currentSnapshot.currentUser,
      currentSnapshot.accessState,
      async () => {
        await refreshSnapshot();
      },
    );

    return {
      isLoaded: currentSnapshot.isLoaded,
      isSignedIn: isSnapshotSignedIn(currentSnapshot),
      user,
    };
  }, [currentSnapshot]);
}

export function useSession(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  session: { id: string; touch: () => Promise<void> } | null;
} {
  const currentSnapshot = useDesktopSnapshot();

  return useMemo(
    () => ({
      isLoaded: currentSnapshot.isLoaded,
      isSignedIn: isSnapshotSignedIn(currentSnapshot),
      session: currentSnapshot.session
        ? {
            id: getDesktopSessionId(currentSnapshot.session.token) ?? '',
            touch: async () => {
              await refreshSnapshot();
            },
          }
        : null,
    }),
    [currentSnapshot],
  );
}

export function useClerk() {
  return useMemo(
    () => ({
      signOut: async ({ redirectUrl }: { redirectUrl?: string } = {}) =>
        signOutDesktop(redirectUrl),
    }),
    [],
  );
}

function DesktopAuthAction({
  actionLabel,
  title,
}: {
  actionLabel: string;
  title: string;
}) {
  const [isLaunching, setIsLaunching] = useState(false);
  const { isSignedIn } = useAuth();

  const handleClick = async () => {
    if (!isDesktopShell()) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    setIsLaunching(true);

    try {
      await bridge.auth.login();
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card/50 p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {isDesktopShell()
            ? 'Continue in your browser to attach this desktop app to Genfeed Cloud.'
            : 'Authentication is optional in this self-hosted build.'}
        </p>
      </div>

      <Button
        className="min-w-44"
        disabled={isLaunching || !isDesktopShell()}
        onClick={() => {
          void handleClick();
        }}
      >
        {isDesktopShell()
          ? isLaunching
            ? 'Opening Browser...'
            : actionLabel
          : 'No Login Required'}
      </Button>

      {isSignedIn ? (
        <p className="text-xs text-muted-foreground">
          {isDesktopShell()
            ? 'Desktop session attached. Redirecting to your workspace.'
            : 'Local workspace ready.'}
        </p>
      ) : null}
    </div>
  );
}

export function SignIn() {
  return <DesktopAuthAction actionLabel="Sign In in Browser" title="Sign In" />;
}

export function SignUp() {
  return (
    <DesktopAuthAction
      actionLabel="Continue In Browser"
      title="Create Your Account"
    />
  );
}

export function UserButton() {
  const { user } = useUser();
  const initials =
    (user?.fullName || user?.primaryEmailAddress?.emailAddress || 'User')
      .trim()
      .slice(0, 1)
      .toUpperCase() || 'U';

  return (
    <Button
      className="h-9 w-9 rounded-full p-0"
      onClick={() => {
        void signOutDesktop('/login');
      }}
      size={ButtonSize.SM}
      variant={ButtonVariant.OUTLINE}
    >
      <span className="text-xs font-semibold">{initials}</span>
    </Button>
  );
}
