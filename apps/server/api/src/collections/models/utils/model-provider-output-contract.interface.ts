import type { ReplicatePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import type { WorkflowReviewedOutputContract } from '@genfeedai/contracts/interfaces/billing';

export interface SingleMediaOutputContract {
  adapterVersion: 1;
  representation: 'uri' | 'uri-array';
  outputs: 1;
  requests: 1;
  countInput?: string;
}
export type SingleMediaOutputContractResult =
  | { status: 'supported'; contract: SingleMediaOutputContract }
  | { status: 'unresolved'; reason: string };

export interface ReviewedReplicateOutputContract {
  modelKey: string;
  provider: 'replicate';
  endpoint: string;
  version: string;
  target: ReplicatePredictionTarget;
  output: SingleMediaOutputContract;
}
export type ReviewedReplicateOutputContractResult =
  | { status: 'reviewed'; contract: ReviewedReplicateOutputContract }
  | { status: 'unresolved'; reason: string };

export type ReviewedFalVideoOutputContract = Extract<
  WorkflowReviewedOutputContract,
  { provider: 'fal' }
>;
export type ReviewedFalVideoOutputContractResult =
  | {
      status: 'reviewed';
      contract: ReviewedFalVideoOutputContract;
      inputSchema: Record<string, unknown>;
      schemaFamily: string;
    }
  | { status: 'unresolved'; reason: string };
