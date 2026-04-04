// =============================================================================
// COMFYUI HISTORY RESPONSE TYPES
// =============================================================================

/**
 * A single output image/file from a ComfyUI execution.
 */
export interface ComfyUIOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

/**
 * Output from a single ComfyUI node in the history response.
 */
export interface ComfyUINodeOutput {
  images?: ComfyUIOutputFile[];
  gifs?: ComfyUIOutputFile[];
}

/**
 * Status info for a completed ComfyUI prompt.
 */
export interface ComfyUIPromptStatus {
  status_str: string;
  completed: boolean;
  messages: Array<[string, Record<string, unknown>]>;
}

/**
 * A single history entry from the ComfyUI /history endpoint.
 */
export interface ComfyUIHistoryEntry {
  prompt: [number, string, Record<string, unknown>, Record<string, unknown>];
  outputs: Record<string, ComfyUINodeOutput>;
  status: ComfyUIPromptStatus;
}

/**
 * Full response from GET /history/{prompt_id}
 */
export interface ComfyUIHistoryResponse {
  [promptId: string]: ComfyUIHistoryEntry;
}

/**
 * Response from POST /prompt (queue a new prompt)
 */
export interface ComfyUIQueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}
