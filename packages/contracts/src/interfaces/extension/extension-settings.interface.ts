import type { ThemePreference } from '../../constants';
import type { NativeHostProviderIdValue } from '../../constants/native-host.constant';
export interface PersistedExtensionSettings {
  autoFill: boolean;
  autoPost: boolean;
  /** Provider the user chose to run text actions after a confirmed cloud failure; null keeps cloud only. */
  localFallbackProviderId: NativeHostProviderIdValue | null;
  theme: ThemePreference;
  recordOwnPublications: boolean;
}
export interface SettingsState extends PersistedExtensionSettings {
  isLoaded: boolean;
  settingsRevision: number;
  themeRevision: number;
}
export interface SettingsActions {
  applyStoredSettings: (settings: unknown) => void;
  applyAccountTheme: (theme: ThemePreference) => void;
  setAutoFill: (autoFill: boolean) => void;
  setAutoPost: (autoPost: boolean) => void;
  setLocalFallbackProvider: (
    providerId: NativeHostProviderIdValue | null,
  ) => void;
  setRecordOwnPublications: (enabled: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  loadSettings: () => Promise<void>;
}
