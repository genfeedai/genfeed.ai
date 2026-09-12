import type { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import type {
  AgentStudioHandoffPayload,
  IModel,
} from '@genfeedai/contracts/interfaces';

export interface CredentialMentionItem {
  id: string;
  handle: string;
  name: string;
  platform: string;
  avatar: string | null;
}

export interface AgentInstallReadiness {
  authMode: 'better_auth' | 'none';
  billingMode: 'cloud_billing' | 'oss_local';
  localTools: {
    anyDetected: boolean;
    claude: boolean;
    codex: boolean;
    detected: string[];
  };
  providers: {
    anyConfigured: boolean;
    configured: string[];
    fal: boolean;
    imageGenerationReady: boolean;
    openai: boolean;
    replicate: boolean;
    textGenerationReady: boolean;
  };
  ui: {
    showBilling: boolean;
    showCloudUpgradeCta: boolean;
    showCredits: boolean;
    showPricing: boolean;
  };
  workspace: {
    brandId: string | null;
    hasBrand: boolean;
    hasOrganization: boolean;
    organizationId: string | null;
  };
}

export type GenerationModel = IModel;

export interface GetGenerationModelsParams {
  category?: ModelCategory;
  organizationId?: string;
}

export interface GenerateIngredientResult {
  id: string;
  url?: string;
}

/**
 * `POST /router/estimate-generation-credits` request (#4672 Manual-mode
 * review card). `organizationId` is never sent — the server derives it from
 * the authenticated user.
 */
export interface EstimateGenerationCreditsParams {
  category: 'image' | 'video';
  duration?: number;
  outputs?: number;
  prioritize?: RouterPriority;
  prompt: string;
  quality?: string;
  resolution?: string;
}

export interface EstimateGenerationCreditsResult {
  /** `null` when the estimate is unavailable — never blocks the review. */
  credits: number | null;
  isAvailable: boolean;
  modelKey: string | null;
}

/**
 * `POST /agent/studio-handoff` request (#4670 Open in Studio). The Agent
 * supplies exactly what it already resolved — prompt, concrete model,
 * applicable parameters — never `organizationId`/`userId`; the server
 * derives those from the authenticated request.
 */
export type CreateAgentStudioHandoffParams = AgentStudioHandoffPayload;

export interface CreateAgentStudioHandoffResult {
  /** Opaque handoff id — the only thing that belongs in the Studio generate URL. */
  id: string;
}

/**
 * `GET /agent/studio-handoff/:id` response (#4670 Open in Studio, consumer
 * side). Single-use — the server deletes the handoff on this call whether or
 * not it resolves, so a retry always sees it as gone.
 */
export type ConsumeAgentStudioHandoffResult = AgentStudioHandoffPayload;

export interface AgentGeneratedAsset {
  category?: string;
  cdnUrl?: string;
  id: string;
  status: string;
  url?: string;
}

export interface AgentClonedVoice {
  id: string;
  metadataLabel?: string;
  provider?: string;
  cloneStatus?: string;
  sampleAudioUrl?: string;
}

export interface WorkflowInterfaceField {
  defaultValue?: unknown;
  description?: string;
  label?: string;
  required?: boolean;
  type: string;
  validation?: Record<string, unknown>;
}

export interface WorkflowInterfaceSchema {
  inputs: Record<string, WorkflowInterfaceField>;
  outputs: Record<string, WorkflowInterfaceField>;
}

export interface WorkflowTriggerScope {
  expectedContextVersion: number;
  threadId: string;
}

export interface ManualReviewBatchPayload {
  brandId: string;
  items: Array<{
    caption?: string;
    format: string;
    ingredientId?: string;
    label?: string;
    mediaUrl?: string;
    platform?: string;
    prompt?: string;
    sourceActionId?: string;
    sourceWorkflowId?: string;
    sourceWorkflowName?: string;
  }>;
}

export interface PresignedUploadResponse {
  data: {
    id: string;
    attributes: {
      publicUrl: string;
      uploadUrl: string;
    };
  };
}
