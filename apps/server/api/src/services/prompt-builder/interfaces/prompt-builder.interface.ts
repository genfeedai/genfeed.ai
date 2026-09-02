import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import type { ModelProvider } from '@genfeedai/enums';

/**
 * Base interface for all prompt builders
 * Each provider (Replicate, OpenAI, KlingAI, etc.) implements this
 */
export interface IPromptBuilder {
  /**
   * Build provider-specific prompt parameters from universal input
   * @param model - The model key to build prompt for
   * @param params - Universal prompt builder parameters
   * @param promptText - The rendered prompt text (from template or fallback)
   * @returns Provider-specific formatted parameters
   */
  buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateInput;

  /**
   * Check if this builder supports the given model
   * @param model - Model key to check
   * @returns true if this builder supports the model
   */
  supportsModel(model: string): boolean;

  /**
   * Get the provider this builder is for
   * @returns The model provider enum
   */
  getProvider(): ModelProvider;
}
