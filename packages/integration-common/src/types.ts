/**
 * Shared types for platform integrations
 */

export interface OrgIntegration {
  id: string;
  orgId: string;
  platform: 'telegram' | 'slack' | 'discord' | 'twitch';
  botToken: string; // encrypted at rest
  config: {
    allowedUserIds?: string[];
    appToken?: string;
    defaultWorkflow?: string;
    webhookMode?: boolean;
  };
  status: 'active' | 'paused' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowInput {
  nodeId: string;
  label: string;
  inputType: 'text' | 'image' | 'audio' | 'video';
  defaultValue?: string;
  required?: boolean;
}

export interface WorkflowJson {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: Record<string, unknown>;
  edges: Array<unknown>;
}

export interface UserSettings {
  imageModel: string;
  videoModel: string;
}

export interface WorkflowSession {
  state: 'idle' | 'selecting' | 'collecting' | 'confirming' | 'running';
  executionId?: string;
  orgId?: string;
  workflowId?: string;
  workflowName?: string;
  workflow?: WorkflowJson;
  requiredInputs: WorkflowInput[];
  currentInputIndex: number;
  collectedInputs: Map<string, string>;
  startedAt: number;
  statusMessageId?: number | string;
}

export interface ExecutionResult {
  success: boolean;
  durationMs: number;
  modelUsed?: string;
  outputs: Array<{
    type: 'image' | 'video';
    url: string;
  }>;
  error?: string;
}

export type ProgressCallback = (
  message: string,
  percentage: number,
) => Promise<void>;

export interface BotManager {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  addIntegration(integration: OrgIntegration): Promise<void>;
  updateIntegration(integration: OrgIntegration): Promise<void>;
  removeIntegration(integrationId: string): Promise<void>;
  getActiveCount(): number;
}
