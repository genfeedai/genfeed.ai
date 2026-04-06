import type { IPromptBuilder } from '@api/services/prompt-builder/interfaces/prompt-builder.interface';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import type { ModelProvider } from '@genfeedai/enums';

/**
 * Abstract base class for prompt builders
 * Provides common functionality for all providers
 */

export abstract class BasePromptBuilder implements IPromptBuilder {
  /**
   * Build provider-specific prompt parameters
   * Must be implemented by each provider
   * @param model - Model key
   * @param params - Prompt parameters
   * @param promptText - Pre-rendered prompt text (from template or raw)
   */
  abstract buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateInput;

  /**
   * Check if this builder supports the given model
   * Must be implemented by each provider
   */
  abstract supportsModel(model: string): boolean;

  /**
   * Get the provider this builder is for
   * Must be implemented by each provider
   */
  abstract getProvider(): ModelProvider;

  /**
   * Get negative prompt from blacklist
   * @param blacklist - Array of blacklisted terms
   * @returns Comma-separated string of blacklisted terms
   */
  protected getNegativePrompt(blacklist?: string[]): string {
    return blacklist?.join(',') || '';
  }
}
