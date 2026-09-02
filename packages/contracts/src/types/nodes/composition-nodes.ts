// =============================================================================
// COMPOSITION NODE DATA (workflow-as-node)
// =============================================================================

import type { BaseNodeData } from './base';
import type { HandleType } from './handles';

export interface WorkflowInputNodeData extends BaseNodeData {
  // Config for this input boundary
  inputName: string;
  inputType: HandleType;
  required: boolean;
  description?: string;
}

export interface WorkflowOutputNodeData extends BaseNodeData {
  // Config for this output boundary
  outputName: string;
  outputType: HandleType;
  description?: string;

  // Input from connection (what gets returned when workflow completes)
  inputValue: string | null;
}

// Cached interface from referenced workflow
export interface WorkflowInterfaceInput {
  nodeId: string;
  name: string;
  type: HandleType;
  required: boolean;
}

export interface WorkflowInterfaceOutput {
  nodeId: string;
  name: string;
  type: HandleType;
}

export interface WorkflowInterface {
  inputs: WorkflowInterfaceInput[];
  outputs: WorkflowInterfaceOutput[];
}

export interface WorkflowRefNodeData extends BaseNodeData {
  // Reference to child workflow
  referencedWorkflowId: string | null;
  referencedWorkflowName: string | null;

  // Cached interface (refreshed on save or manually)
  cachedInterface: WorkflowInterface | null;

  // Runtime: mapped inputs from parent connections
  inputMappings: Record<string, string | null>;

  // Runtime: outputs received from child execution
  outputMappings: Record<string, string | null>;

  // Child execution tracking
  childExecutionId: string | null;
}
