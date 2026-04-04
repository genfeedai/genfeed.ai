import { apiClient } from './client';

// Types matching backend DTOs
export interface NodeDefaultsData {
  imageModel?: string;
  imageProvider?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
  videoModel?: string;
  videoProvider?: string;
  videoAspectRatio?: string;
  videoDuration?: number;
  llmModel?: string;
  llmTemperature?: number;
  llmMaxTokens?: number;
  ttsProvider?: string;
  ttsVoice?: string;
}

export interface UiPreferencesData {
  edgeStyle?: string;
  showMinimap?: boolean;
  hasSeenWelcome?: boolean;
}

export interface RecentModelData {
  id: string;
  displayName: string;
  provider: string;
  timestamp?: number;
}

export interface SettingsData {
  nodeDefaults: NodeDefaultsData;
  uiPreferences: UiPreferencesData;
  recentModels: RecentModelData[];
}

// Generate or get session ID for anonymous users
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';

  let sessionId = localStorage.getItem('genfeed-session-id');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('genfeed-session-id', sessionId);
  }
  return sessionId;
}

interface FetchOptions extends RequestInit {
  signal?: AbortSignal;
}

// Add session header to options
function withSession(options?: { signal?: AbortSignal }): FetchOptions {
  return {
    headers: {
      'X-Session-Id': getSessionId(),
    },
    signal: options?.signal,
  };
}

export const settingsApi = {
  /**
   * Add a model to recent models
   */
  addRecentModel: async (
    model: Omit<RecentModelData, 'timestamp'>,
    signal?: AbortSignal
  ): Promise<RecentModelData[]> => {
    return apiClient.post<RecentModelData[]>(
      '/settings/recent-models',
      model,
      withSession({ signal })
    );
  },

  /**
   * Clear recent models
   */
  clearRecentModels: async (signal?: AbortSignal): Promise<RecentModelData[]> => {
    return apiClient.delete<RecentModelData[]>('/settings/recent-models', withSession({ signal }));
  },
  /**
   * Get all settings for current user
   */
  getAll: async (signal?: AbortSignal): Promise<SettingsData> => {
    return apiClient.get<SettingsData>('/settings', withSession({ signal }));
  },

  /**
   * Reset all settings to defaults
   */
  reset: async (signal?: AbortSignal): Promise<SettingsData> => {
    return apiClient.delete<SettingsData>('/settings', withSession({ signal }));
  },

  /**
   * Update multiple settings at once
   */
  update: async (
    data: { nodeDefaults?: NodeDefaultsData; uiPreferences?: UiPreferencesData },
    signal?: AbortSignal
  ): Promise<SettingsData> => {
    return apiClient.put<SettingsData>('/settings', data, withSession({ signal }));
  },

  /**
   * Update node defaults only
   */
  updateNodeDefaults: async (
    defaults: NodeDefaultsData,
    signal?: AbortSignal
  ): Promise<NodeDefaultsData> => {
    return apiClient.put<NodeDefaultsData>(
      '/settings/node-defaults',
      defaults,
      withSession({ signal })
    );
  },

  /**
   * Update UI preferences only
   */
  updateUiPreferences: async (
    preferences: UiPreferencesData,
    signal?: AbortSignal
  ): Promise<UiPreferencesData> => {
    return apiClient.put<UiPreferencesData>(
      '/settings/ui-preferences',
      preferences,
      withSession({ signal })
    );
  },
};
