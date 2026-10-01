import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type { RunImageGenerationBriefResult } from '@api/services/generation-brief/run-image-generation-brief';
import type { RunVideoGenerationBriefResult } from '@api/services/generation-brief/run-video-generation-brief';
import type { ReplicatePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import type { VideoGenerationIdentityLock } from '@genfeedai/contracts/interfaces';
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
  provider: 'replicate';
  model: string;
  target: ReplicatePredictionTarget;
  input: Record<string, unknown>;
  output: Parameters<
    WorkflowEngineExecutorHelperService['createWorkflowOutputIngredient']
  >[0];
  generationSource: string;
}

/** Prepared input only; funding requires a separately reviewed output and billing contract. */
export interface WorkflowImageProviderPlan
  extends WorkflowMediaProviderPlanBase {
  actionId: 'imageGen';
  generationBriefEvidence: RunImageGenerationBriefResult['evidence'];
}

export interface WorkflowVideoProviderPlan
  extends WorkflowMediaProviderPlanBase {
  actionId: 'videoGen';
  generationBriefEvidence: RunVideoGenerationBriefResult['evidence'];
  identityLock?: VideoGenerationIdentityLock;
}

export type WorkflowMediaProviderPlan =
  | WorkflowImageProviderPlan
  | WorkflowVideoProviderPlan;
