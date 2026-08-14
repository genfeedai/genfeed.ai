import type { Request } from 'express';

export interface ManagedInferenceRequestUser {
  id?: string;
  brandId?: string;
  isApiKey?: boolean;
  organizationId?: string;
  scopes?: string[];
  userId?: string;
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
