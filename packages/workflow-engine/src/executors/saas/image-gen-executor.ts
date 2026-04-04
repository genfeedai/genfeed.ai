import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface ImageGenOutput {
  imageUrl: string;
  imageBuffer?: Buffer;
  filename?: string;
  model: string;
  provider: string;
}

/**
 * Resolver that generates an image using the specified model/provider.
 * The actual implementation is injected at runtime from the NestJS service layer.
 */
export type ImageGenResolver = (
  model: string,
  params: Record<string, unknown>,
  context: ExecutionContext,
  node: ExecutableNode,
) => Promise<ImageGenOutput>;

export class ImageGenExecutor extends BaseExecutor {
  readonly nodeType = 'imageGen';
  private resolver: ImageGenResolver | null = null;

  setResolver(resolver: ImageGenResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const model = node.config.model;
    if (!model || typeof model !== 'string') {
      errors.push('Model is required for image generation');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 5;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.resolver) {
      throw new Error('ImageGen resolver not configured');
    }

    const model = this.getRequiredConfig<string>(node.config, 'model');

    // Collect params from node config and upstream inputs
    const prompt =
      (inputs.get('prompt') as string) ??
      this.getOptionalConfig<string>(node.config, 'prompt', '');
    const seed = this.getOptionalConfig<number | undefined>(
      node.config,
      'seed',
      undefined,
    );
    const width = this.getOptionalConfig<number>(node.config, 'width', 1024);
    const height = this.getOptionalConfig<number>(node.config, 'height', 1024);
    const steps = this.getOptionalConfig<number | undefined>(
      node.config,
      'steps',
      undefined,
    );
    const strength = this.getOptionalConfig<number | undefined>(
      node.config,
      'strength',
      undefined,
    );
    const cfg = this.getOptionalConfig<number | undefined>(
      node.config,
      'cfg',
      undefined,
    );
    const negativePrompt = this.getOptionalConfig<string | undefined>(
      node.config,
      'negativePrompt',
      undefined,
    );
    const faceImage =
      (inputs.get('faceImage') as string) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'faceImage',
        undefined,
      );
    const image =
      (inputs.get('image') as string) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'image',
        undefined,
      );
    const style = this.getOptionalConfig<string | undefined>(
      node.config,
      'style',
      undefined,
    );

    const params: Record<string, unknown> = {
      brandId: this.getOptionalConfig<string | undefined>(
        node.config,
        'brandId',
        undefined,
      ),
      cfg,
      faceImage,
      height,
      negativePrompt,
      prompt,
      references: image ? [image] : undefined,
      seed,
      steps,
      strength,
      style,
      width,
    };

    // Remove undefined params
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

export function createImageGenExecutor(): ImageGenExecutor {
  return new ImageGenExecutor();
}
