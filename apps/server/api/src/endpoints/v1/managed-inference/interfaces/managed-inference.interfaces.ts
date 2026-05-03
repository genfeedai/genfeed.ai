import type { Request } from 'express';

export interface ManagedInferenceAuthMetadata {
  isApiKey?: boolean;
  organization?: string;
  scopes?: string[];
  user?: string;
}

export interface ManagedInferenceRequestUser {
  id?: string;
  publicMetadata?: ManagedInferenceAuthMetadata;
}

export interface ManagedInferenceAuthenticatedRequest extends Request {
  user?: ManagedInferenceRequestUser;
}

export interface ManagedInferenceResponse {
  creditsDebited: number;
  model: string;
  output: Record<string, unknown> | string;
  provider: string;
}
