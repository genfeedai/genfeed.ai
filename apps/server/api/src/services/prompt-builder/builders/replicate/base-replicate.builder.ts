import { ConfigService } from '@api/config/config.service';
import { BasePromptBuilder } from '@api/services/prompt-builder/builders/base-prompt.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelKey, ModelProvider } from '@genfeedai/enums';

/**
 * Base class for Replicate-specific prompt builders.
 * Provides shared utilities for resolution normalization and aspect ratio handling.
 */
export abstract class BaseReplicateBuilder extends BasePromptBuilder {
  constructor(protected readonly configService: ConfigService) {
    super();
  }

  getProvider(): ModelProvider {
    return ModelProvider.REPLICATE;
  }

  /**
   * Normalizes resolution values for Veo models.
   * Different models use different values for the same resolution:
   * - Veo 3/3.1: "720p", "1080p"
   * - Sora 2 Pro: "standard" (720p), "high" (1080p)
   * This maps Sora-style values to Veo-compatible values.
   */
  protected normalizeVeoResolution(resolution?: string): string {
    if (!resolution) {
      return '720p';
    }

    switch (resolution) {
      case 'high':
        return '1080p';
      case 'standard':
        return '720p';
      case '720p':
      case '1080p':
        return resolution;
      default:
        return '720p';
    }
  }

  /**
   * Normalizes resolution values for WAN Video models.
   * WAN Video only supports "480p" and "720p".
   * Maps higher resolutions to "720p" (max supported).
   */
  protected normalizeWanResolution(resolution?: string): string {
    if (!resolution) {
      return '720p';
    }

    switch (resolution) {
      case '480p':
        return '480p';
      case '720p':
      case 'standard':
        return '720p';
      case '1080p':
      case 'high':
        // WAN doesn't support 1080p, fallback to 720p
        return '720p';
      default:
        return '720p';
    }
  }

  /**
   * Each specialized builder must implement this to list supported models.
   */
  abstract getSupportedModels(): ModelKey[];

  supportsModel(model: ModelKey): boolean {
    return this.getSupportedModels().includes(model);
  }

  /**
   * Build prompt for a specific model.
   * Must be implemented by each specialized builder.
   */
  abstract buildPrompt(
    model: ModelKey,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateInput;
}
