import type {
  ModelBillableCompletionInput,
  ModelBillableQuoteSnapshot,
  ProviderQuoteDimensions,
} from './model-pricing.interface';

export type WorkflowGenerationProviderTarget =
  | { model: string }
  | { version: string };

export type WorkflowReviewedOutputContract =
  | {
      modelKey: string;
      provider: 'replicate';
      endpoint: string;
      version: string;
      target: WorkflowGenerationProviderTarget;
      output: {
        adapterVersion: 1;
        representation: 'uri' | 'uri-array';
        requests: 1;
        outputs: 1;
        countInput?: string;
      };
    }
  | {
      modelKey: string;
      provider: 'fal';
      endpoint: string;
      version: string;
      target: { endpoint: string };
      output: {
        adapterVersion: 1;
        representation: 'video-object';
        requests: 1;
        outputs: 1;
        countInput?: never;
      };
    };

export interface WorkflowMediaPreparationContract {
  version: 1;
  preparationVersion: 1;
  actionId: 'imageGen' | 'videoGen';
  brief: {
    briefVersion: number;
    compilerId: string;
    compilerVersion: number;
    profileId: string;
    profileVersion: number;
    modelKey: string;
    mediaKind: 'image' | 'video';
  };
  reviewedOutput: WorkflowReviewedOutputContract;
}

export type WorkflowMediaProjectionPolicy =
  | { kind: 'frozen-pricing-profile'; version: 1 }
  | {
      kind: 'exact-provider-input';
      version: 1;
      inputKeys: string[];
      inputFingerprint: string;
    };

export interface WorkflowGenerationDispatch {
  contractVersion: string;
  preparationContract: WorkflowMediaPreparationContract;
  projectionPolicy: WorkflowMediaProjectionPolicy;
  provider: string;
  modelKey: string;
  target: string;
  credentialRoute:
    | { kind: 'platform' }
    | { kind: 'byok'; credentialId: string };
  /** Billing dimensions and provider target are frozen; input URLs may resolve at dispatch. */
  quantities: ProviderQuoteDimensions & { requests: 1; outputs: 1 };
  billableFingerprint: string;
}

export interface WorkflowGenerationNodeAllocation {
  nodeId: string;
  actionId: string;
  operationId: string;
  owner: 'workflow-execution';
  billingMode: 'credits' | 'byok';
  dispatch: WorkflowGenerationDispatch;
  quote?: ModelBillableQuoteSnapshot;
}

export interface WorkflowGenerationManifest {
  executionId: string;
  organizationId: string;
  actorUserId: string;
  workflowVersionId: string;
  selectedNodeIds: string[];
  graphFingerprint: string;
  allocations: WorkflowGenerationNodeAllocation[];
}

export interface WorkflowGenerationCompletedArtifact {
  ingredientId: string;
  assetKey: string;
  role: 'primary';
}

export type WorkflowGenerationOperationEvidence =
  | { operationId: string; phase: 'unclaimed' }
  | { operationId: string; phase: 'claimed'; claimId: string }
  | {
      operationId: string;
      phase: 'submission-intent';
      intentId: string;
      observedAt: string;
    }
  | {
      operationId: string;
      phase: 'accepted';
      intentId: string;
      providerJobId: string;
      observedAt: string;
    }
  | {
      operationId: string;
      phase: 'completed';
      intentId: string;
      providerJobId?: string;
      proofId: string;
      observedAt: string;
      artifacts: WorkflowGenerationCompletedArtifact[];
      completion: ModelBillableCompletionInput;
    }
  | {
      operationId: string;
      phase: 'failed';
      intentId: string;
      providerJobId?: string;
      proofId: string;
      observedAt: string;
      kind: 'submission-rejected' | 'provider-terminal' | 'local-job-terminal';
      provider: string;
    }
  | {
      operationId: string;
      phase: 'unsubmitted';
      observedAt: string;
      reason: 'dispatch-closed';
    };

export type WorkflowGenerationProviderEvidence = Extract<
  WorkflowGenerationOperationEvidence,
  { phase: 'accepted' | 'completed' | 'failed' }
>;

export interface WorkflowExecutionGenerationBilling {
  version: 1;
  state: 'preparing' | 'funded';
  manifest: WorkflowGenerationManifest;
  manifestHash: string;
  holdAmount: string;
  reservationId: string | null;
  expiresAt: string;
  dispatchClosed: boolean;
  operations: WorkflowGenerationOperationEvidence[];
}
