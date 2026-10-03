import type { ThemePreference } from '../../constants';
export interface PersistedExtensionSettings {
  autoFill: boolean;
  autoPost: boolean;
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
  setRecordOwnPublications: (enabled: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  loadSettings: () => Promise<void>;
}
