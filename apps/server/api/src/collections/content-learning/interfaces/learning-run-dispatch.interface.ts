import type { LearningRunDispatchReceiptV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type {
  ContentLearningOperation,
  ContentLearningRun,
} from '@genfeedai/prisma';

export interface LearningRunDispatchScope {
  runId: string;
  operationId: string;
  organizationId: string;
}

export interface LearningRunDispatchContext {
  input: LearningRunDispatchScope;
  run: ContentLearningRun;
  operation: ContentLearningOperation;
  now: Date;
}

export interface LearningRunDispatchOutcome {
  operation: ContentLearningOperation;
  dispatchable: boolean;
}

export interface LearningRunReceiptRecovery {
  receipt: LearningRunDispatchReceiptV1 | null;
  outcome: LearningRunDispatchOutcome | null;
}

export interface LearningRunClock {
  now: Date;
}

export interface LearningRunClaim {
  run: ContentLearningRun;
  operation: ContentLearningOperation;
  receipt: LearningRunDispatchReceiptV1;
  token: Date;
}
