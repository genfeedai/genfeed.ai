import type {
  StoryboardAcceptedLineFunding,
  StoryboardExecutionBinding,
  StoryboardLineEvidence,
} from '@api/collections/content-runs/services/storyboard-operation-manifest.schema';
import type { StoryboardRunQuote } from '@genfeedai/contracts/api-types/contracts/storyboard-run-quote.contract';
import type { Prisma } from '@genfeedai/prisma';

export type StoryboardReadonly<T> = T extends readonly (infer TValue)[]
  ? readonly StoryboardReadonly<TValue>[]
  : T extends object
    ? { readonly [TKey in keyof T]: StoryboardReadonly<T[TKey]> }
    : T;

export interface StoryboardAcceptedLineRef {
  organizationId: string;
  brandId: string;
  runId: string;
  operationId: string;
  lineKey: string;
  attempt: number;
  actorUserId: string;
}

export interface StoryboardFundingMutationRef
  extends StoryboardAcceptedLineRef {
  expectedSequence: number;
  expectedCancellationGeneration: number;
}

export interface StoryboardAcceptedLine<TPrepared> {
  organizationId: string;
  brandId: string;
  runId: string;
  operationId: string;
  actorUserId: string;
  quoteId: string;
  acceptedRevision: number;
  acceptedAt: string;
  inputHash: string;
  capabilityVersion: string;
  acceptedQuote: StoryboardRunQuote;
  key: string;
  attempt: number;
  sourceActionId: string;
  stage: StoryboardRunQuote['items'][number]['stage'];
  shotId: string | null;
  slotOrdinal: number | null;
  preparedHash: string;
  prepared: TPrepared;
  sequence: number;
  cancellationGeneration: number;
  admissionClosed: boolean;
  executionBinding: StoryboardExecutionBinding | null;
  evidence: StoryboardLineEvidence;
  funding: StoryboardAcceptedLineFunding;
}

export type StoryboardAcceptedLineRead<TPrepared> =
  | {
      readonly kind: 'accepted';
      readonly line: StoryboardReadonly<StoryboardAcceptedLine<TPrepared>>;
    }
  | {
      readonly kind: 'imported-unresolved';
      readonly operationId: string;
      readonly quoteId: string | null;
      readonly acceptedRevision: number | null;
      readonly actorUserId: string | null;
      readonly evidencePaths: readonly string[];
      readonly reasonCode: 'STORYBOARD_FUNDING_EVIDENCE_UNRESOLVED';
    };

export interface StoryboardLockedAcceptedLine<TPrepared> {
  readonly tx: Prisma.TransactionClient;
  readonly line: StoryboardReadonly<StoryboardAcceptedLine<TPrepared>>;
  readonly replaceFunding: (
    expectedRevision: number,
    next: StoryboardAcceptedLineFunding,
  ) => Promise<StoryboardReadonly<StoryboardAcceptedLineFunding>>;
}

/** Trusted server callbacks contain database work only and may be retried. */
export interface StoryboardFundingStore<TPrepared> {
  readAcceptedLine(
    ref: StoryboardAcceptedLineRef,
  ): Promise<StoryboardAcceptedLineRead<TPrepared>>;
  withLockedAcceptedLine<TResult>(
    ref: StoryboardFundingMutationRef,
    work: (
      context: StoryboardLockedAcceptedLine<TPrepared>,
    ) => Promise<TResult>,
  ): Promise<TResult>;
}
