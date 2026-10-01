import type { CrunInputValue } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export interface CrunPreparedTask {
  organizationId: string;
  userId: string;
  ingredientId: string;
  brandId?: string;
  reservationId: string;
  modelKey: string;
  endpoint: string;
  contractVersion: string;
  quoteId: string;
  outputIndex: number;
  inputHash: string;
  inputMetadata: Prisma.InputJsonObject;
  quoteSnapshot: Prisma.InputJsonObject;
  credentialSource: 'hosted' | 'byok';
  credentialId: string | null;
  credentialFingerprint: string;
}

/** Ephemeral resolved secret. Never persist or serialize this object. */
export interface CrunResolvedCredential {
  apiKey: string;
  credentialSource: 'hosted' | 'byok';
  credentialId: string | null;
  credentialFingerprint: string;
}

export interface CrunProviderRequest {
  model: string;
  input: Record<string, CrunInputValue>;
}

export type CrunRequestSlot = {
  isAdmitted: boolean;
  retryAfterMs: number;
} | null;
