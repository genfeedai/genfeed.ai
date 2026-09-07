import type { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';

export type ProductApiKeyForm = {
  allowedIps: string;
  description: string;
  expiresAt: string;
  label: string;
  rateLimit: string;
  selectedScopes: string[];
};

export type ProductPlainKey = {
  key: string;
  label: string;
};

export type ProductApiKeyScope =
  (typeof API_KEY_SCOPE_PRESETS)[keyof typeof API_KEY_SCOPE_PRESETS][number];
