import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type MobileAuthUser,
  mobileAuthService,
} from '@/services/auth.service';

interface MobileAuthContextValue {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  refreshSession: () => Promise<void>;
  signInWithEmail: (input: {
    email: string;
    password: string;
  }) => Promise<void>;
  signInWithGoogleIdToken: (input: {
    accessToken?: string | null;
    idToken: string;
    nonce?: string | null;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  user: MobileAuthUser | null;
}

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [cookieHeader, setCookieHeader] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<MobileAuthUser | null>(null);

  const refreshSession = useCallback(async () => {
    if (!cookieHeader) {
      setUser(null);
      return;
    }

    const refreshedUser = await mobileAuthService.refreshSession(cookieHeader);
    setUser(refreshedUser);
  }, [cookieHeader]);

  useEffect(() => {
    let mounted = true;

    const loadStoredSession = async () => {
      try {
        const stored = await mobileAuthService.getStoredSession();
        if (!mounted) {
          return;
        }

        setCookieHeader(stored.cookieHeader);
        setUser(stored.user);

        if (stored.cookieHeader) {
          const refreshedUser = await mobileAuthService.refreshSession(
            stored.cookieHeader,
          );
          if (mounted) {
            setUser(refreshedUser);
          }
        }
      } catch {
        await mobileAuthService.clearStoredSession();
        if (mounted) {
          setCookieHeader(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoaded(true);
        }
      }
    };

    loadStoredSession();

    return () => {
      mounted = false;
    };
  }, []);

  const getToken = useCallback(async () => {
    if (!cookieHeader) {
      return null;
    }

    try {
      return await mobileAuthService.getJwt(cookieHeader);
    } catch {
      await mobileAuthService.clearStoredSession();
      setCookieHeader(null);
      setUser(null);
      return null;
    }
  }, [cookieHeader]);

  const signInWithEmail = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await mobileAuthService.signInWithEmail(input);
      setCookieHeader(result.cookieHeader);
      setUser(result.user);
    },
    [],
  );

  const signInWithGoogleIdToken = useCallback(
    async (input: {
      accessToken?: string | null;
      idToken: string;
      nonce?: string | null;
    }) => {
      const result = await mobileAuthService.signInWithGoogleIdToken(input);
      setCookieHeader(result.cookieHeader);
      setUser(result.user);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await mobileAuthService.signOut(cookieHeader);
    setCookieHeader(null);
    setUser(null);
  }, [cookieHeader]);

  const value = useMemo<MobileAuthContextValue>(
    () => ({
      getToken,
      isLoaded,
      isSignedIn: Boolean(cookieHeader && user),
      refreshSession,
      signInWithEmail,
      signInWithGoogleIdToken,
      signOut,
      user,
    }),
    [
      cookieHeader,
      getToken,
      isLoaded,
      refreshSession,
      signInWithEmail,
      signInWithGoogleIdToken,
      signOut,
      user,
    ],
  );

  return (
    <MobileAuthContext.Provider value={value}>
      {children}
    </MobileAuthContext.Provider>
  );
}

export function useMobileAuth(): MobileAuthContextValue {
  const value = useContext(MobileAuthContext);

  if (!value) {
    throw new Error('useMobileAuth must be used within MobileAuthProvider');
  }

  return value;
}
