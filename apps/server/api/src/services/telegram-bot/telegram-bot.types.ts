/**
 * Telegram Bot Types
 *
 * Shared types for the GenFeed workflow execution bot, extracted so the
 * conversation, run-command, executor, and runner collaborators can share a
 * single canonical definition.
 */

import type { RunAuthType } from '@genfeedai/enums';

/** Workflow JSON type (matches core workflow format) */
export interface WorkflowJson {
  version: number;
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }>;
}

/** Input requirement derived from workflow nodes */
export interface WorkflowInput {
  nodeId: string;
  nodeType: string;
  label: string;
  inputType: 'image' | 'text' | 'audio' | 'video';
  required: boolean;
  defaultValue?: string;
}

/** Conversation state machine step per chat */
export type ConversationStep =
  | 'idle'
  | 'selecting_workflow'
  | 'collecting_inputs'
  | 'confirming'
  | 'executing';

/** Conversation state per chat */
export interface ConversationState {
  step: ConversationStep;
  workflowId?: string;
  workflowName?: string;
  workflow?: WorkflowJson;
  requiredInputs: WorkflowInput[];
  currentInputIndex: number;
  collectedInputs: Map<string, string>;
  startedAt: number;
  statusMessageId?: number;
}

/** Resolved org/user/auth context bound to a chat */
export interface ChatAuthContext {
  authType: RunAuthType;
  organizationId: string;
  userId: string;
  apiKeyId?: string;
  scopes?: string[];
}

export type TelegramWorkflowName =
  | 'full-pipeline'
  | 'image-series'
  | 'image-to-video'
  | 'single-image'
  | 'single-video'
  | 'ugc-factory';

export interface ReplicatePredictionResult {
  status?: string;
  output?: unknown;
  error?: string;
}
