import {
  DEFAULT_RESOLVED_THEME,
  DEFAULT_THEME,
  isResolvedTheme,
  isThemePreference,
  type ResolvedTheme,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import {
  type NativeThemeColors,
  nativeThemeColors,
} from '@genfeedai/ui/semantic/mobile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { useMobileAuth } from '@/contexts/auth-context';
import { mobileSettingsService } from '@/services/api/settings.service';

interface MobileThemeContextValue {
  colors: NativeThemeColors;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const DEFAULT_CONTEXT: MobileThemeContextValue = {
  colors: nativeThemeColors[DEFAULT_RESOLVED_THEME],
  preference: DEFAULT_THEME,
  resolvedTheme: DEFAULT_RESOLVED_THEME,
  setPreference: async () => undefined,
};

const MobileThemeContext =
  createContext<MobileThemeContextValue>(DEFAULT_CONTEXT);

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, user } = useMobileAuth();
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>(DEFAULT_THEME);
  const [isLocalPreferenceLoaded, setIsLocalPreferenceLoaded] = useState(false);
  const preferenceRevision = useRef(0);

  useEffect(() => {
    let isActive = true;
    const startedAtRevision = preferenceRevision.current;

    const hydrateLocalPreference = async () => {
      try {
        const storedPreference = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        const nextPreference = isThemePreference(storedPreference)
          ? storedPreference
          : DEFAULT_THEME;

        if (isActive && preferenceRevision.current === startedAtRevision) {
          setPreferenceState(nextPreference);
        }

        if (storedPreference && !isThemePreference(storedPreference)) {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
        }
      } catch {
        if (isActive && preferenceRevision.current === startedAtRevision) {
          setPreferenceState(DEFAULT_THEME);
        }
      } finally {
        if (isActive) {
          setIsLocalPreferenceLoaded(true);
        }
      }
    };

    void hydrateLocalPreference();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isLocalPreferenceLoaded || !isLoaded || !isSignedIn || !user) {
      return;
    }

    let isActive = true;
    const startedAtRevision = preferenceRevision.current;

    const hydrateAccountPreference = async () => {
      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const accountPreference = await mobileSettingsService.getTheme(token);
        if (!isActive || preferenceRevision.current !== startedAtRevision) {
          return;
        }

        setPreferenceState(accountPreference);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, accountPreference);
      } catch {
        // A local preference keeps the app usable while account sync is offline.
      }
    };

    void hydrateAccountPreference();

    return () => {
      isActive = false;
    };
  }, [getToken, isLoaded, isLocalPreferenceLoaded, isSignedIn, user]);

  useLayoutEffect(() => {
    if (!isLocalPreferenceLoaded) {
      return;
    }

    try {
      Appearance.setColorScheme(
        preference === 'system' ? 'unspecified' : preference,
      );
    } catch {
      // React-painted surfaces still follow the resolved palette on platforms
      // that do not expose a native appearance override.
    }
  }, [isLocalPreferenceLoaded, preference]);

  const resolvedTheme = resolveThemePreference(
    preference,
    isResolvedTheme(systemColorScheme) ? systemColorScheme : null,
  );
  const colors = nativeThemeColors[resolvedTheme];

  const setPreference = useCallback(
    async (nextPreference: ThemePreference) => {
      preferenceRevision.current += 1;
      setPreferenceState(nextPreference);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextPreference);

      if (!isLoaded || !isSignedIn) {
        return;
      }

      const token = await getToken();
      if (token) {
        await mobileSettingsService.updateTheme(token, nextPreference);
      }
    },
    [getToken, isLoaded, isSignedIn],
  );

  const value = useMemo<MobileThemeContextValue>(
    () => ({ colors, preference, resolvedTheme, setPreference }),
    [colors, preference, resolvedTheme, setPreference],
  );

  if (!isLocalPreferenceLoaded) {
    return null;
  }

  return (
    <MobileThemeContext.Provider value={value}>
      {children}
    </MobileThemeContext.Provider>
  );
}

export function useMobileTheme(): MobileThemeContextValue {
  return useContext(MobileThemeContext);
}
