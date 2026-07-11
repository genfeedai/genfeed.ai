/**
 * Telegram Workflow Executors
 *
 * Registers the per-node-type executors on the WorkflowEngine used by the
 * Telegram bot. Extracted out of TelegramBotService so engine wiring, provider
 * routing, and model-id translation are no longer buried inside one large
 * method. Identical passthrough executors are collapsed into shared factories.
 */

import type { FalService } from '@api/services/integrations/fal/fal.service';
import type { ReplicatePredictionResult } from '@api/services/telegram-bot/telegram-bot.types';
import {
  FAL_IMAGE_MODEL_MAP,
  REPLICATE_IMAGE_MODEL_MAP,
  REPLICATE_VIDEO_MODEL_MAP,
} from '@api/services/telegram-bot/telegram-bot-model-maps.constants';
import type {
  ExecutableNode,
  ExecutionContext,
  WorkflowEngine,
} from '@genfeedai/workflow-engine';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

export interface WorkflowExecutorDeps {
  replicateService: ReplicateService;
  loggerService: LoggerService;
  falService?: FalService;
}

/** Result is usually a URL string or an array of URLs — take the first. */
function unwrapFirst(result: unknown): unknown {
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Poll a Replicate prediction until it completes or fails.
 */
export async function pollReplicatePrediction(
  replicateService: ReplicateService,
  predictionId: string,
  abortSignal?: AbortSignal,
  maxWaitMs = 10 * 60 * 1000,
): Promise<unknown> {
  const startTime = Date.now();
  const pollIntervalMs = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    if (abortSignal?.aborted) {
      throw new Error(`Prediction ${predictionId} aborted`);
    }

    const prediction = (await replicateService.getPrediction(
      predictionId,
    )) as ReplicatePredictionResult;

    if (
      prediction.status === 'succeeded' ||
      prediction.status === 'completed'
    ) {
      return prediction.output;
    }

    if (
      prediction.status === 'failed' ||
      prediction.status === 'canceled' ||
      prediction.status === 'error'
    ) {
      throw new Error(
        `Prediction failed: ${prediction.error || prediction.status}`,
      );
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    if (abortSignal?.aborted) {
      throw new Error(`Prediction ${predictionId} aborted`);
    }
  }

  throw new Error(
    `Prediction ${predictionId} timed out after ${maxWaitMs / 1000}s`,
  );
}

/**
 * Passthrough executor for a required config field. Throws if the value is
 * absent (used for imageInput/telegramInput/prompt).
 */
function makeRequiredPassthroughExecutor(
  configField: 'image' | 'prompt',
  returnKey: 'image' | 'text',
  errorNoun: string,
) {
  return async (node: ExecutableNode) => {
    const value = node.config[configField] as string;
    if (!value) {
      throw new Error(`No ${errorNoun} provided for node ${node.id}`);
    }
    return { [returnKey]: value };
  };
}

/**
 * Passthrough executor that forwards a single config field as-is, without
 * requiring it (used for audioInput/videoInput).
 */
function makeFieldPassthroughExecutor(field: 'audio' | 'video') {
  return async (node: ExecutableNode) => ({
    [field]: node.config[field] as string,
  });
}

/**
 * Register all node-type executors for the Telegram bot workflow engine.
 */
export function registerWorkflowExecutors(
  engine: WorkflowEngine,
  deps: WorkflowExecutorDeps,
): void {
  const { replicateService, loggerService, falService } = deps;

  // imageInput / telegramInput: passthrough that forwards the collected image URL
  engine.registerExecutor(
    'imageInput',
    makeRequiredPassthroughExecutor('image', 'image', 'image'),
  );
  engine.registerExecutor(
    'telegramInput',
    makeRequiredPassthroughExecutor('image', 'image', 'image'),
  );

  // prompt: passthrough that forwards the prompt text
  engine.registerExecutor(
    'prompt',
    makeRequiredPassthroughExecutor('prompt', 'text', 'prompt'),
  );

  // imageGen: calls fal.ai or Replicate to generate an image
  engine.registerExecutor(
    'imageGen',
    async (
      node: ExecutableNode,
      inputs: Map<string, unknown>,
      _ctx: ExecutionContext,
    ) => {
      // Gather inputs from connected nodes
      let promptText = '';
      let imageUrl = '';

      for (const [_key, value] of inputs) {
        const val = value as Record<string, unknown>;
        if (val?.text) {
          promptText = val.text as string;
        }
        if (val?.image) {
          imageUrl = val.image as string;
        }
      }

      const model = (node.config.model as string) || 'nano-banana-pro';
      const aspectRatio = (node.config.aspectRatio as string) || '1:1';

      const input: Record<string, unknown> = {
        aspect_ratio: aspectRatio,
        prompt: promptText,
      };

      if (imageUrl) {
        input.image = imageUrl;
      }

      // Route to fal.ai if model is a fal model
      const isFalModel =
        model.startsWith('fal-') ||
        model.startsWith('fal-ai/') ||
        FAL_IMAGE_MODEL_MAP[model];

      if (isFalModel && !falService?.isConfigured()) {
        throw new Error(
          `Fal model "${model}" requested but fal.ai is not configured. Set FAL_API_KEY or choose a Replicate model.`,
        );
      }

      if (isFalModel && falService?.isConfigured()) {
        const falModelId = FAL_IMAGE_MODEL_MAP[model] || model;

        loggerService.log(
          `TelegramBotService: Running imageGen via fal.ai with model ${falModelId}`,
          { input },
        );

        const falResult = await falService.generateImage(falModelId, {
          image_size: { height: 1024, width: 1024 },
          prompt: promptText,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        });

        return { image: falResult.url, provider: 'fal' };
      }

      // Default: Replicate
      const replicateModel = REPLICATE_IMAGE_MODEL_MAP[model] || model;

      loggerService.log(
        `TelegramBotService: Running imageGen with model ${replicateModel}`,
        { input },
      );

      // Use Replicate's run API (sync via prediction create + wait)
      const predictionId = await replicateService.runModel(
        replicateModel,
        input as Record<string, unknown>,
      );

      // Poll for completion
      const result = await pollReplicatePrediction(
        replicateService,
        predictionId,
        _ctx.abortSignal,
      );

      const outputUrl = unwrapFirst(result);

      return { image: outputUrl, predictionId };
    },
  );

  // videoGen: calls Replicate to generate a video
  engine.registerExecutor(
    'videoGen',
    async (
      node: ExecutableNode,
      inputs: Map<string, unknown>,
      _ctx: ExecutionContext,
    ) => {
      let promptText = '';
      let imageUrl = '';
      let lastFrameUrl = '';

      for (const [key, value] of inputs) {
        const val = value as Record<string, unknown>;
        if (val?.text) {
          promptText = val.text as string;
        }
        if (val?.image) {
          // Distinguish first image vs lastFrame based on targetHandle
          if (key.includes('lastFrame') || key.includes('image-2')) {
            lastFrameUrl = val.image as string;
          } else if (!imageUrl) {
            imageUrl = val.image as string;
          }
        }
      }

      const model = (node.config.model as string) || 'veo-3.1-fast';
      const duration = (node.config.duration as number) || 8;
      const aspectRatio = (node.config.aspectRatio as string) || '16:9';

      const replicateModel = REPLICATE_VIDEO_MODEL_MAP[model] || model;

      const input: Record<string, unknown> = {
        aspect_ratio: aspectRatio,
        duration,
        prompt: promptText,
      };

      if (imageUrl) {
        input.image = imageUrl;
      }
      if (lastFrameUrl) {
        input.last_frame = lastFrameUrl;
      }

      loggerService.log(
        `TelegramBotService: Running videoGen with model ${replicateModel}`,
        { input },
      );

      const predictionId = await replicateService.runModel(
        replicateModel,
        input as Record<string, unknown>,
      );

      const result = await pollReplicatePrediction(
        replicateService,
        predictionId,
        _ctx.abortSignal,
      );
      const outputUrl = unwrapFirst(result);

      return { predictionId, video: outputUrl };
    },
  );

  // animation: passthrough (easing is a client-side concern or future impl)
  engine.registerExecutor(
    'animation',
    async (
      _node: ExecutableNode,
      inputs: Map<string, unknown>,
      _ctx: ExecutionContext,
    ) => {
      // Just forward the video through
      for (const [_key, value] of inputs) {
        const val = value as Record<string, unknown>;
        if (val?.video) {
          return val;
        }
      }
      // Forward whatever came in
      const firstInput = inputs.values().next().value;
      return firstInput ?? {};
    },
  );

  // output: passthrough - collects the final result
  engine.registerExecutor(
    'output',
    async (
      _node: ExecutableNode,
      inputs: Map<string, unknown>,
      _ctx: ExecutionContext,
    ) => {
      // Forward all inputs as the final output
      const result: Record<string, unknown> = {};
      for (const [_key, value] of inputs) {
        const val = value as Record<string, unknown>;
        if (val) {
          Object.assign(result, val);
        }
      }
      return result;
    },
  );

  // audioInput / videoInput: passthrough
  engine.registerExecutor('audioInput', makeFieldPassthroughExecutor('audio'));
  engine.registerExecutor('videoInput', makeFieldPassthroughExecutor('video'));

  loggerService.log(
    'TelegramBotService: WorkflowEngine initialized with executors',
  );
}
