import type { ToolRequiredRole } from './tool-definition.interface';

export type ActionApprovalPolicy = 'none' | 'required';
export type ActionCompletionMode = 'provider-callback' | 'synchronous';
export type ActionIdempotencyPolicy = 'none' | 'run-node';
export type ActionVisibility = 'internal' | 'public' | 'tool' | 'workflow';
export type ActionWorkflowCategory =
  | 'input'
  | 'ai'
  | 'processing'
  | 'composition'
  | 'output';
export type ActionJsonSchema = object;

export type ActionCreditPolicy =
  | { amount: number; mode: 'fixed' }
  | { mode: 'dynamic' };

export interface GenfeedActionDefinition {
  approval: ActionApprovalPolicy;
  authorization: ToolRequiredRole | 'public' | 'system';
  completionMode: ActionCompletionMode;
  credits: ActionCreditPolicy;
  description: string;
  id: string;
  idempotency: ActionIdempotencyPolicy;
  inputSchema: ActionJsonSchema;
  label: string;
  outputSchema: ActionJsonSchema;
  visibility: ActionVisibility;
  workflowCategory?: ActionWorkflowCategory;
  workflowIcon?: string;
}

export interface CreateGenfeedActionNodeInput {
  actionId: string;
  id: string;
  inputVariableKeys?: string[];
  label?: string;
  parameters?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GenfeedActionNodeDefinition {
  data: {
    config: {
      actionId: string;
      parameters: Record<string, unknown>;
    };
    inputVariableKeys: string[];
    label: string;
  };
  id: string;
  position: { x: number; y: number };
  type: 'genfeedAction';
}
