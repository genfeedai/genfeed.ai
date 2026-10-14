import type { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import type {
  AccountGenerationFunding,
  AccountGenerationRun,
} from '@api/collections/posts/services/post-account-generation.types';

export type QueuedAccountGenerationRun = Omit<
  AccountGenerationRun,
  'context' | 'funding'
> & {
  funding: Omit<AccountGenerationFunding, 'apiKey'>;
  isByok: boolean;
};

export interface AccountGenerationJobData {
  dto: GenerateAccountPostDto;
  offset: number;
  postIds: string[];
  previousTexts: string[];
  run: QueuedAccountGenerationRun;
}

export interface AccountGenerationPageOptions {
  isLastPage: boolean;
  previousTexts: string[];
}

export function queuedAccountGenerationRun(
  run: AccountGenerationRun,
): QueuedAccountGenerationRun {
  return {
    brandMode: run.brandMode,
    funding: {
      creditsPerDispatch: run.funding.creditsPerDispatch,
      poolReservationId: run.funding.poolReservationId,
    },
    identity: {
      brandId: run.identity.brandId,
      organizationId: run.identity.organizationId,
      userId: run.identity.userId,
      isApiKey: run.identity.isApiKey,
      apiKeyId: run.identity.apiKeyId,
      scopes: run.identity.scopes,
    },
    isByok: run.funding.apiKey !== undefined,
    limit: run.limit,
    model: run.model,
    parentRequestId: run.parentRequestId,
    runId: run.runId,
    scope: run.scope,
  };
}
