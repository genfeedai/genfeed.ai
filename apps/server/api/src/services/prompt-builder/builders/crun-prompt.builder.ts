import { BasePromptBuilder } from '@api/services/prompt-builder/builders/base-prompt.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { CrunPromptInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CrunPromptBuilder extends BasePromptBuilder {
  getProvider(): ModelProvider {
    return ModelProvider.CRUN;
  }
  supportsModel(model: string): boolean {
    return [
      'crun/google/nano-banana-pro',
      'crun/bytedance/seedream-4-5',
    ].includes(model);
  }
  buildPrompt(
    model: string,
    _params: PromptBuilderParams,
    promptText: string,
  ): CrunPromptInput {
    if (!this.supportsModel(model))
      throw new Error('Unsupported Crun image model');
    return { prompt: promptText };
  }
}
