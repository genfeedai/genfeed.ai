import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@videos/config/config.service';
import type {
  ComfyUIHistoryEntry,
  ComfyUIPromptResponse,
} from '@videos/interfaces/videos.interfaces';
import axios from 'axios';

@Injectable()
export class ComfyUIService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async getStatus(): Promise<{ status: 'online' | 'offline'; url: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.configService.COMFYUI_URL;

    try {
      await axios.get(`${url}/system_stats`, { timeout: 5000 });
      return { status: 'online', url };
    } catch {
      this.loggerService.warn(caller, { message: 'ComfyUI is offline', url });
      return { status: 'offline', url };
    }
  }

  async restart(): Promise<{ message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { message: 'Restart requested' });

    return { message: 'ComfyUI restart signal sent' };
  }

  /**
   * Queue a workflow on ComfyUI.
   * Returns the prompt_id on success, null on failure.
   */
  async queuePrompt(workflow: Record<string, unknown>): Promise<string | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.configService.COMFYUI_URL;

    try {
      const response = await axios.post<ComfyUIPromptResponse>(
        `${url}/prompt`,
        { prompt: workflow },
        { timeout: 10000 },
      );
      const promptId = response.data.prompt_id;
      this.loggerService.log(caller, {
        message: 'Workflow queued',
        promptId,
      });
      return promptId;
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Failed to queue workflow',
      });
      return null;
    }
  }

  /**
   * Get the history/status of a queued prompt.
   */
  async getHistory(promptId: string): Promise<ComfyUIHistoryEntry | null> {
    const url = this.configService.COMFYUI_URL;

    try {
      const response = await axios.get<Record<string, ComfyUIHistoryEntry>>(
        `${url}/history/${promptId}`,
        { timeout: 5000 },
      );
      return response.data[promptId] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Queue a workflow and poll until completion or timeout.
   * Returns the output filename on success, null on failure.
   */
  async queueAndWait(
    workflow: Record<string, unknown>,
    timeoutMs: number = 1200000,
    pollIntervalMs: number = 5000,
  ): Promise<string | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const promptId = await this.queuePrompt(workflow);
    if (!promptId) {
      return null;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const entry = await this.getHistory(promptId);
      if (!entry) {
        continue;
      }

      if (entry.status?.completed) {
        for (const node of Object.values(entry.outputs)) {
          const images = node.images;
          if (images?.length) {
            const filename = images[0].filename;
            this.loggerService.log(caller, {
              filename,
              message: 'Generation completed',
              promptId,
            });
            return filename;
          }
        }
        return null;
      }

      if (entry.status?.status_str === 'error') {
        this.loggerService.error(caller, {
          message: 'ComfyUI workflow failed',
          promptId,
        });
        return null;
      }
    }

    this.loggerService.warn(caller, {
      message: 'Workflow timed out',
      promptId,
    });
    return null;
  }
}
