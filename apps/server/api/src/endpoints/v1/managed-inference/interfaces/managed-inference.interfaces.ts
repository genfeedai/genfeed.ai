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

export type ManagedInferenceAuthenticatedRequest = Omit<Request, 'user'> & {
  user?: ManagedInferenceRequestUser;
};

export interface ManagedInferenceResponse {
  creditsDebited: number;
  model: string;
  operation?: string;
  output: unknown;
  provider: string;
}
