import type { IModel } from '@genfeedai/contracts/interfaces';

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

export interface GenerateIngredientResult {
  id: string;
  url?: string;
}

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
