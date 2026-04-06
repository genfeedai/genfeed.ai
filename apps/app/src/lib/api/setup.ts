import { apiClient } from './client';

// =============================================================================
// TYPES
// =============================================================================

export interface SetupStatus {
  hasCompletedSetup: boolean;
  detectedTools: DetectedTools;
}

export interface CompleteSetupResponse {
  hasCompletedSetup: boolean;
}

export interface DetectedToolStatus {
  installed: boolean;
}

export interface DetectedTools {
  replicate: DetectedToolStatus;
  anthropic: DetectedToolStatus;
  codex: DetectedToolStatus;
  claude: DetectedToolStatus;
}

export interface KeyValidationResult {
  valid: boolean;
  message?: string;
}

// =============================================================================
// API
// =============================================================================

export const setupApi = {
  complete: (data: { replicateApiKey: string }, signal?: AbortSignal) =>
    apiClient.post<CompleteSetupResponse>('/setup/complete', data, { signal }),

  detectTools: (signal?: AbortSignal) =>
    apiClient.get<DetectedTools>('/setup/detect-tools', { signal }),

  getStatus: (signal?: AbortSignal) =>
    apiClient.get<SetupStatus>('/setup/status', { signal }),

  validateKey: (
    data: { provider: string; apiKey: string },
    signal?: AbortSignal,
  ) =>
    apiClient.post<KeyValidationResult>('/setup/validate-key', data, {
      signal,
    }),
};
