import { ConfigService } from '@images/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface ComfyUIOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUIHistoryEntry {
  outputs: Record<string, { images?: ComfyUIOutputFile[] }>;
  status?: { completed?: boolean; status_str?: string };
}

interface ComfyUIPromptResponse {
  prompt_id: string;
}

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

    // Restart is handled via Docker — this endpoint signals the orchestrator
    return { message: 'ComfyUI restart signal sent' };
  }

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
        message: 'Image workflow queued',
        promptId,
      });
      return promptId;
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Failed to queue image workflow',
      });
      return null;
    }
  }

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

  async queueAndWait(
    workflow: Record<string, unknown>,
    timeoutMs: number = 300000,
    pollIntervalMs: number = 2000,
  ): Promise<ComfyUIOutputFile | null> {
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
            const output = images[0];
            this.loggerService.log(caller, {
              filename: output.filename,
              message: 'Image workflow completed',
              promptId,
            });
            return output;
          }
        }
        return null;
      }

      if (entry.status?.status_str === 'error') {
        this.loggerService.error(caller, {
          message: 'ComfyUI image workflow failed',
          promptId,
        });
        return null;
      }
    }

    this.loggerService.warn(caller, {
      message: 'Image workflow timed out',
      promptId,
    });
    return null;
  }
}
