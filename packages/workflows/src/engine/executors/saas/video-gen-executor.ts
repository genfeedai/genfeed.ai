import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export interface VideoGenOutput {
  // `id` and `status` mirror the pending ingredient the resolver creates before
  // handing off to the provider; the `videoGen` action contract requires both.
  id: string;
  status: string;
  filename?: string;
  generationBriefEvidence?: Record<string, unknown>;
  generationSource?: string;
  model: string;
  provider: string;
  videoUrl: string;
}

export type VideoGenResolver = (
  model: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<VideoGenOutput>;

export class VideoGenExecutor extends BaseExecutor {
  readonly nodeType = 'videoGen';
  private resolver: VideoGenResolver | null = null;

  setResolver(resolver: VideoGenResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for video generation');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 10;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('VideoGen resolver not configured');
    }

    const model = this.getRequiredConfig<string>(node.config, 'model');
    const prompt =
      (inputs.get('prompt') as string) ??
      this.getOptionalConfig<string>(node.config, 'prompt', '');
    const image =
      (inputs.get('image') as string) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'image',
        undefined,
      );
    const lastFrame =
      (inputs.get('lastFrame') as string) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'lastFrame',
        undefined,
      );
    const videoReference =
      (inputs.get('videoReference') as string) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'videoReference',
        undefined,
      );

    const params: Record<string, unknown> = {
      actionVerb: this.getOptionalConfig<string | undefined>(
        node.config,
        'actionVerb',
        undefined,
      ),
      brandId: this.getOptionalConfig<string | undefined>(
        node.config,
        'brandId',
        undefined,
      ),
      duration: this.getOptionalConfig<number | undefined>(
        node.config,
        'duration',
        undefined,
      ),
      height: this.getOptionalConfig<number>(node.config, 'height', 1080),
      lastFrame,
      negativePrompt: this.getOptionalConfig<string | undefined>(
        node.config,
        'negativePrompt',
        undefined,
      ),
      parentIngredientId: this.getOptionalConfig<string | undefined>(
        node.config,
        'parentIngredientId',
        undefined,
      ),
      prompt,
      references: image ? [image] : undefined,
      seed: this.getOptionalConfig<number | undefined>(
        node.config,
        'seed',
        undefined,
      ),
      videoReferences: videoReference ? [videoReference] : undefined,
      width: this.getOptionalConfig<number>(node.config, 'width', 1920),
    };

    for (const key of Object.keys(params)) {
      if (params[key] === undefined) {
        delete params[key];
      }
    }

    const result = await this.resolver(model, params, input.context, node);

    return {
      data: result,
      metadata: {
        filename: result.filename,
        model,
        provider: result.provider,
      },
    };
  }
}
