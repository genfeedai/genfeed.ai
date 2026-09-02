// =============================================================================
// COMFYUI PROMPT TYPES
// =============================================================================

/**
 * A ComfyUI prompt is a graph of nodes, keyed by node ID.
 * Each node has a class_type (e.g. "KSampler", "CLIPTextEncode") and inputs.
 */
export interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export interface ComfyUIPrompt {
  [nodeId: string]: ComfyUINode;
}

/**
 * Describes a dynamic input that can be injected into a ComfyUI prompt template.
 * Used to map user-facing workflow params to specific ComfyUI node fields.
 */
export interface ComfyUITemplateInput {
  /** Display name shown to the user (e.g. "Prompt", "Seed", "Face Photo") */
  key: string;
  /** Which ComfyUI node ID to inject the value into */
  nodeId: string;
  /** Which input field on the node */
  field: string;
  /** The type of the input */
  type: 'string' | 'number' | 'image' | 'boolean' | 'select';
  /** Default value if none provided */
  default?: unknown;
  /** Whether this input is required */
  required?: boolean;
  /** Description shown in the UI */
  description?: string;
  /** Options for select-type inputs */
  options?: string[];
}

/**
 * A ComfyUI workflow template: a prompt with metadata about dynamic inputs.
 * This is what gets stored on a workflow/listing for "run on your own ComfyUI" export.
 */
export interface ComfyUIWorkflowTemplate {
  /** The raw ComfyUI prompt JSON (node graph) */
  prompt: ComfyUIPrompt;
  /** Dynamic inputs that can be customized per execution */
  inputs: ComfyUITemplateInput[];
}
