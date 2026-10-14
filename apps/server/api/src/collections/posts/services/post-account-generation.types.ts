import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandedModeResolution } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

/** Post columns an account or thread run writes after create: its receipt link and stopped reason. */
export interface PostGenerationUpdateFields {
  brandedReceiptId?: string | null;
  brandedReceiptState?: string | null;
  targetError?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

export type AccountGenerationIdentity = Pick<
  AuthenticatedUser,
  'brandId' | 'organizationId' | 'userId' | 'isApiKey' | 'apiKeyId' | 'scopes'
>;

/** Who pays for and owns a run's credit holds. */
export interface AccountGenerationScope {
  organizationId: string;
  brandId: string;
  actorUserId: string;
}

/** The run-level funding every dispatch of one run draws on. */
export interface AccountGenerationFunding {
  /** The org's own provider key when the run is BYOK; undefined means platform key. */
  apiKey: string | undefined;
  /** Credits each dispatch settles when the provider accepted its attempt. */
  creditsPerDispatch: number;
  /** The single up-front hold, or null for BYOK and free models. */
  poolReservationId: string | null;
}

/** Everything a run decides before its placeholder posts exist. */
export interface AccountGenerationRun {
  brandMode: BrandedModeResolution;
  context: AccountPublishingContext;
  funding: AccountGenerationFunding;
  identity: AccountGenerationIdentity;
  /** Characters allowed per post (per segment for a thread). */
  limit: number;
  model: string;
  /** Shared batch id: every receipt of the run carries it as `runId`. */
  runId: string;
  scope: AccountGenerationScope;
  /** Request key of the failed attempt this run retries. */
  parentRequestId?: string;
}
