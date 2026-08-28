import type { ToolRequiredRole } from './tool-definition.interface.js';

export type ActionApprovalPolicy = 'none' | 'required';
export type ActionIdempotencyPolicy = 'none' | 'run-node';
export type ActionVisibility = 'internal' | 'public' | 'tool';
export type ActionJsonSchema = object;

export type ActionCreditPolicy =
  | { amount: number; mode: 'fixed' }
  | { mode: 'dynamic' };

export interface GenfeedActionDefinition {
  approval: ActionApprovalPolicy;
  authorization: ToolRequiredRole | 'public' | 'system';
  credits: ActionCreditPolicy;
  description: string;
  id: string;
  idempotency: ActionIdempotencyPolicy;
  inputSchema: ActionJsonSchema;
  label: string;
  outputSchema: ActionJsonSchema;
  visibility: ActionVisibility;
}

export interface CreateGenfeedActionNodeInput {
  actionId: string;
  id: string;
  inputVariableKeys?: string[];
  label?: string;
  position?: { x: number; y: number };
}

export interface GenfeedActionNodeDefinition {
  data: {
    config: {
      actionId: string;
      parameters: Record<string, never>;
    };
    inputVariableKeys: string[];
    label: string;
  };
  id: string;
  position: { x: number; y: number };
  type: 'genfeedAction';
}
