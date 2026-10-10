import type { SeedanceNativeOutputQuoteEvidence } from '@api/collections/videos/services/seedance-native-output-quote.util';
import type { SeedanceReferenceQuoteEvidence } from '@api/collections/videos/services/seedance-reference-evidence.util';
import type { PreparedFalVideoDispatch } from '@api/collections/videos/services/video-generation.types';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type { RunImageGenerationBriefResult } from '@api/services/generation-brief/run-image-generation-brief';
import type { RunVideoGenerationBriefResult } from '@api/services/generation-brief/run-video-generation-brief';
import type { ReplicatePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import type { VideoGenerationIdentityLock } from '@genfeedai/contracts/interfaces';
import type { WorkflowReviewedOutputContract } from '@genfeedai/contracts/interfaces/billing';
import type {
  ExecutableNode,
  ExecutionContext,
} from '@genfeedai/workflows/engine';

export interface WorkflowMediaProviderPlanInput {
  model: string;
  params: Record<string, unknown>;
  context: ExecutionContext;
  node: ExecutableNode;
}

interface WorkflowMediaProviderPlanBase {
  preparationVersion: 1;
  model: string;
  input: Record<string, unknown>;
  output: Parameters<
    WorkflowEngineExecutorHelperService['createWorkflowOutputIngredient']
  >[0];
  generationSource: string;
}

/** Prepared input only; funding requires a separately reviewed output and billing contract. */
export interface WorkflowImageProviderPlan
  extends WorkflowMediaProviderPlanBase {
  provider: 'replicate';
  target: ReplicatePredictionTarget;
  actionId: 'imageGen';
  generationBriefEvidence: RunImageGenerationBriefResult['evidence'];
}

interface WorkflowVideoProviderPlanBase extends WorkflowMediaProviderPlanBase {
  actionId: 'videoGen';
  generationBriefEvidence: RunVideoGenerationBriefResult['evidence'];
  identityLock?: VideoGenerationIdentityLock;
}

export interface WorkflowReplicateVideoProviderPlan
  extends WorkflowVideoProviderPlanBase {
  provider: 'replicate';
  target: ReplicatePredictionTarget;
}

export interface WorkflowFalVideoProviderPlan
  extends WorkflowVideoProviderPlanBase {
  provider: 'fal';
  target: { endpoint: string };
  preparedFalDispatch: PreparedFalVideoDispatch;
  reviewedOutput: Extract<WorkflowReviewedOutputContract, { provider: 'fal' }>;
  referenceQuoteEvidence?: SeedanceReferenceQuoteEvidence;
  nativeOutputQuoteEvidence?: SeedanceNativeOutputQuoteEvidence;
  schemaPreparation: {
    kind: 'reviewed-provider-schema';
    modelKey: string;
    mediaKind: 'video';
    schemaVersion: string;
    schemaFamily: string;
    inputSchemaHash: string;
    adapterVersion: 1;
  };
}

export type WorkflowVideoProviderPlan =
  | WorkflowReplicateVideoProviderPlan
  | WorkflowFalVideoProviderPlan;

export type WorkflowMediaProviderPlan =
  | WorkflowImageProviderPlan
  | WorkflowVideoProviderPlan;
