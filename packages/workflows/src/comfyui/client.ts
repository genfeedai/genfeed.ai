import type {
  ComfyUIHistoryEntry,
  ComfyUIHistoryResponse,
  ComfyUIPrompt,
  ComfyUIQueuePromptResponse,
} from '@genfeedai/types';

export interface ComfyUIClientOptions {
  /** Polling interval in ms when waiting for completion */
  pollMs?: number;
  /** Max time to wait for completion in ms */
  timeoutMs?: number;
}

const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Lightweight HTTP client for the ComfyUI REST API.
 *
 * Talks to:
 *   POST /prompt          — queue a new prompt
 *   GET  /history/{id}    — check prompt status + outputs
 *   GET  /view            — download an output file
 *   GET  /system_stats    — health check
 */
export class ComfyUIClient {
  constructor(private readonly baseUrl: string) {}

  /**
   * Queue a prompt for execution on ComfyUI.
   */
  async queuePrompt(
    prompt: ComfyUIPrompt,
  ): Promise<ComfyUIQueuePromptResponse> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      body: JSON.stringify({ prompt }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI /prompt failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<ComfyUIQueuePromptResponse>;
  }

  /**
   * Get history for a specific prompt execution.
   */
  async getHistory(promptId: string): Promise<ComfyUIHistoryEntry | undefined> {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI /history failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as ComfyUIHistoryResponse;
    return data[promptId];
  }

  /**
   * Download an output file (image/video) from ComfyUI.
   */
  async getOutput(filename: string, subfolder: string): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type: 'output' });
    const response = await fetch(`${this.baseUrl}/view?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`ComfyUI /view failed (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Poll ComfyUI until the prompt completes or times out.
   * Returns the history entry with outputs.
   */
  async waitForCompletion(
    promptId: string,
    opts?: ComfyUIClientOptions,
  ): Promise<ComfyUIHistoryEntry> {
    const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const history = await this.getHistory(promptId);

      if (history?.status?.completed) {
        return history;
      }

      if (history?.status?.status_str === 'error') {
        throw new Error(
          `ComfyUI prompt ${promptId} failed: ${JSON.stringify(history.status.messages)}`,
        );
      }

      await this.sleep(pollMs);
    }

    throw new Error(
      `ComfyUI prompt ${promptId} timed out after ${timeoutMs}ms`,
    );
  }

  /**
   * Health check — pings the ComfyUI instance.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
