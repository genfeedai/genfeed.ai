import { ConfigService } from '@api/config/config.service';

// ComfyUI types (not yet exported from cloud-types)
interface ComfyUIOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

interface ComfyUIHistoryEntry {
  outputs: Record<
    string,
    { images?: ComfyUIOutputFile[]; gifs?: ComfyUIOutputFile[] }
  >;
  status: { completed: boolean; status_str: string };
}

type ComfyUIHistoryResponse = Record<string, ComfyUIHistoryEntry>;

type ComfyUIPrompt = Record<string, unknown>;

interface ComfyUIQueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

import { ModelKey } from '@genfeedai/enums';
import {
  buildFlux2DevPrompt,
  buildFlux2DevPulidLoraPrompt,
  buildFlux2DevPulidPrompt,
  buildFlux2DevPulidUpscalePrompt,
  buildFlux2KleinPrompt,
  buildFluxDevPrompt,
  buildPulidFluxPrompt,
  buildZImageTurboLoraPrompt,
  buildZImageTurboPrompt,
} from '@genfeedai/workflows';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

@Injectable()
export class ComfyUIService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly comfyuiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.comfyuiUrl = this.configService.get('DARKROOM_COMFYUI_URL') ?? '';
  }

  /**
   * Generate an image using a self-hosted ComfyUI model.
   * Routes to the correct prompt builder based on model key.
   */
  public async generateImage(
    model: string,
    params: Record<string, unknown>,
  ): Promise<{ imageBuffer: Buffer; filename: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started for model ${model}`);

      // 1. Build the ComfyUI prompt from params
      const prompt = this.buildPrompt(model, params);

      // 2. Queue the prompt on ComfyUI
      const queueResult = await this.queuePrompt(prompt);

      // 3. Wait for completion
      const history = await this.waitForCompletion(queueResult.prompt_id);

      // 4. Extract output file info
      const outputFile = this.extractOutputFile(history);
      if (!outputFile) {
        throw new Error(
          `ComfyUI produced no output for prompt ${queueResult.prompt_id}`,
        );
      }

      // 5. Download the output image
      const imageBuffer = await this.getOutput(
        outputFile.filename,
        outputFile.subfolder,
      );

      this.loggerService.log(`${url} completed: ${outputFile.filename}`);

      return { filename: outputFile.filename, imageBuffer };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, { error, model });
      throw error;
    }
  }

  /**
   * Health check — pings the ComfyUI instance.
   */
  public async ping(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${this.comfyuiUrl}/system_stats`),
      );
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Queue a prompt for execution on ComfyUI.
   */
  private async queuePrompt(
    prompt: ComfyUIPrompt,
  ): Promise<ComfyUIQueuePromptResponse> {
    const res = await firstValueFrom(
      this.httpService.post(
        `${this.comfyuiUrl}/prompt`,
        { prompt },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    if (res.status !== 200) {
      throw new Error(`ComfyUI /prompt failed (${res.status})`);
    }

    return res.data as ComfyUIQueuePromptResponse;
  }

  /**
   * Get history for a specific prompt execution.
   */
  private async getHistory(
    promptId: string,
  ): Promise<ComfyUIHistoryEntry | undefined> {
    const res = await firstValueFrom(
      this.httpService.get(`${this.comfyuiUrl}/history/${promptId}`),
    );

    if (res.status !== 200) {
      throw new Error(`ComfyUI /history failed (${res.status})`);
    }

    const data = res.data as ComfyUIHistoryResponse;
    return data[promptId];
  }

  /**
   * Download an output file from ComfyUI.
   */
  private async getOutput(
    filename: string,
    subfolder: string,
  ): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type: 'output' });
    const res = await firstValueFrom(
      this.httpService.get(`${this.comfyuiUrl}/view?${params.toString()}`, {
        responseType: 'arraybuffer',
      }),
    );

    if (res.status !== 200) {
      throw new Error(`ComfyUI /view failed (${res.status})`);
    }

    return Buffer.from(res.data);
  }

  /**
   * Poll until prompt completes or times out.
   */
  private async waitForCompletion(
    promptId: string,
  ): Promise<ComfyUIHistoryEntry> {
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const history = await this.getHistory(promptId);

      if (history?.status?.completed) {
        return history;
      }

      if (history?.status?.status_str === 'error') {
        throw new Error(
          // @ts-expect-error TS2339
          `ComfyUI prompt ${promptId} failed: ${JSON.stringify(history.status?.messages)}`,
        );
      }

      await this.sleep(DEFAULT_POLL_MS);
    }

    throw new Error(
      `ComfyUI prompt ${promptId} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
    );
  }

  /**
   * Build a ComfyUI prompt based on the model key.
   */
  private buildPrompt(
    model: string,
    params: Record<string, unknown>,
  ): ComfyUIPrompt {
    switch (model) {
      case ModelKey.GENFEED_AI_FLUX_DEV:
        return buildFluxDevPrompt({
          cfg: params.cfg as number | undefined,
          height: params.height as number | undefined,
          negativePrompt: params.negativePrompt as string | undefined,
          prompt: String(params.prompt ?? ''),
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX_DEV_PULID:
        return buildPulidFluxPrompt({
          cfg: params.cfg as number | undefined,
          faceImage: String(params.faceImage ?? ''),
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          pulidStrength: params.pulidStrength as number | undefined,
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_Z_IMAGE_TURBO:
        return buildZImageTurboPrompt({
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX2_DEV:
        return buildFlux2DevPrompt({
          guidance: params.guidance as number | undefined,
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX2_DEV_PULID:
        return buildFlux2DevPulidPrompt({
          faceImage: String(params.faceImage ?? ''),
          guidance: params.guidance as number | undefined,
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          pulidStrength: params.pulidStrength as number | undefined,
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX2_DEV_PULID_UPSCALE:
        return buildFlux2DevPulidUpscalePrompt({
          faceImage: String(params.faceImage ?? ''),
          guidance: params.guidance as number | undefined,
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          pulidStrength: params.pulidStrength as number | undefined,
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          upscaleModel: params.upscaleModel as string | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX2_DEV_PULID_LORA:
        return buildFlux2DevPulidLoraPrompt({
          faceImage: String(params.faceImage ?? ''),
          guidance: params.guidance as number | undefined,
          height: params.height as number | undefined,
          loraPath: String(params.loraPath ?? ''),
          loraStrength: params.loraStrength as number | undefined,
          prompt: String(params.prompt ?? ''),
          pulidStrength: params.pulidStrength as number | undefined,
          realismLora: params.realismLora as string | undefined,
          realismLoraStrength: params.realismLoraStrength as number | undefined,
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_FLUX2_KLEIN:
        return buildFlux2KleinPrompt({
          height: params.height as number | undefined,
          prompt: String(params.prompt ?? ''),
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          width: params.width as number | undefined,
        });

      case ModelKey.GENFEED_AI_Z_IMAGE_TURBO_LORA:
        return buildZImageTurboLoraPrompt({
          height: params.height as number | undefined,
          loraPath: String(
            params.loraPath ?? 'itshaylamoore_z_image_turbo.safetensors',
          ),
          loraStrength: params.loraStrength as number | undefined,
          prompt: String(params.prompt ?? ''),
          seed: params.seed as number | undefined,
          steps: params.steps as number | undefined,
          upscaleModel: params.upscaleModel as string | undefined,
          width: params.width as number | undefined,
        });

      default:
        throw new Error(`Unknown self-hosted model: ${model}`);
    }
  }

  /**
   * Extract the first output image from a ComfyUI history entry.
   */
  private extractOutputFile(
    history: ComfyUIHistoryEntry,
  ): ComfyUIOutputFile | undefined {
    for (const nodeOutput of Object.values(history.outputs)) {
      if (nodeOutput.images && nodeOutput.images.length > 0) {
        return nodeOutput.images[0];
      }
    }
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
