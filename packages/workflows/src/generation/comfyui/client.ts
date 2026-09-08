import type {
  ComfyUIHistoryEntry,
  ComfyUIHistoryResponse,
  ComfyUIPrompt,
  ComfyUIQueuePromptResponse,
} from '@genfeedai/contracts/types';

export interface ComfyUIClientOptions {
  /** Polling interval in ms when waiting for completion */
  pollMs?: number;
  /** Max time to wait for completion in ms */
  timeoutMs?: number;
}

export interface ComfyUIRequestOptions {
  body?: { prompt: ComfyUIPrompt };
  responseType?: 'arraybuffer' | 'none';
}

/**
 * Transports own status/error policy and reject failed requests. Return parsed
 * JSON by default, ArrayBuffer or Buffer for arraybuffer; none ignores the body.
 */
export type ComfyUIRequest = (
  path: string,
  options?: ComfyUIRequestOptions,
) => Promise<unknown>;

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
  private readonly request: ComfyUIRequest;

  constructor(
    private readonly baseUrl: string,
    request?: ComfyUIRequest,
  ) {
    this.request =
      request ?? ((path, options) => this.fetchRequest(path, options));
  }

  /**
   * Queue a prompt for execution on ComfyUI.
   */
  async queuePrompt(
    prompt: ComfyUIPrompt,
  ): Promise<ComfyUIQueuePromptResponse> {
    return (await this.request('/prompt', {
      body: { prompt },
    })) as ComfyUIQueuePromptResponse;
  }

  /**
   * Get history for a specific prompt execution.
   */
  async getHistory(promptId: string): Promise<ComfyUIHistoryEntry | undefined> {
    const data = (await this.request(
      `/history/${promptId}`,
    )) as ComfyUIHistoryResponse;
    return data[promptId];
  }

  /**
   * Download an output file (image/video) from ComfyUI.
   */
  async getOutput(filename: string, subfolder: string): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type: 'output' });
    // Select Buffer.from's ArrayBuffer overload; Axios Buffer values also work.
    const arrayBuffer = (await this.request(`/view?${params.toString()}`, {
      responseType: 'arraybuffer',
    })) as ArrayBuffer;
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
      await this.request('/system_stats', { responseType: 'none' });
      return true;
    } catch {
      return false;
    }
  }

  private async fetchRequest(
    path: string,
    options?: ComfyUIRequestOptions,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const response = options?.body
      ? await fetch(url, {
          body: JSON.stringify(options.body),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
      : await fetch(url);

    if (!response.ok) {
      const detail = options?.responseType ? '' : `: ${await response.text()}`;
      const endpoint = path.split(/[/?]/)[1];
      throw new Error(
        `ComfyUI /${endpoint} failed (${response.status})${detail}`,
      );
    }

    if (options?.responseType === 'none') return;
    if (options?.responseType === 'arraybuffer') return response.arrayBuffer();
    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
