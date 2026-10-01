import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import type {
  CrunInputValue,
  CrunModelInputContract,
  ModelBillablePricingProfile,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { z } from 'zod';

export interface CrunPreparedTask {
  organizationId: string;
  userId: string;
  ingredientId: string;
  brandId?: string;
  reservationId: string | null;
  fundingBinding: CrunFundingBinding;
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

export interface CrunQuotePreparation {
  profile: ModelBillablePricingProfile;
  contract: CrunModelInputContract;
  pricingEvidence: unknown;
  request: CrunProviderRequest;
  credential: CrunResolvedCredential;
  outputs: number;
  creditsPerUsd: string | null;
  acquisitionRateVersion: string | null;
  marginMultiplier: number | null;
}

export const crunFundingBindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reservation') }).strict(),
  z.object({ kind: z.literal('free') }).strict(),
  z
    .object({
      kind: z.literal('byok'),
      receipt: generationUsageReceiptSchema
        .omit({ kind: true, state: true, confirmedFailure: true })
        .extend({ submissionIntentProvider: z.literal('crun') })
        .strict(),
    })
    .strict(),
]);
export type CrunFundingBinding = z.infer<typeof crunFundingBindingSchema>;

export interface CrunFrozenImageQuote {
  quoteId: string;
  expiresAt: string;
  organizationId: string;
  userId: string;
  brandId: string;
  intent: import('@genfeedai/contracts/interfaces/billing').CrunImageQuoteRequest;
  intentHash: string;
  request: CrunProviderRequest;
  snapshot: import('@genfeedai/contracts/interfaces').ModelBillableQuoteSnapshot;
  templateUsed?: string;
  templateVersion?: number;
}
