import { BasePromptBuilder } from '@api/services/prompt-builder/builders/base-prompt.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

class TestPromptBuilder extends BasePromptBuilder {
  buildPrompt(
    _model: string,
    _params: PromptBuilderParams,
    promptText: string,
  ): ReplicateInput {
    return { prompt: promptText } as ReplicateInput;
  }

  supportsModel(model: string) {
    return model === 'test';
  }

  getProvider() {
    return ModelProvider.REPLICATE;
  }

  negative(blacklist?: string[]) {
    return this.getNegativePrompt(blacklist);
  }
}

describe('BasePromptBuilder', () => {
  const builder = new TestPromptBuilder();

  it('exposes the provider contract', () => {
    expect(builder.getProvider()).toBe(ModelProvider.REPLICATE);
    expect(builder.supportsModel('test')).toBe(true);
    expect(
      builder.buildPrompt(
        'test',
        { modelCategory: ModelCategory.IMAGE, prompt: 'hi' },
        'rendered',
      ),
    ).toEqual({ prompt: 'rendered' });
  });

  it('joins blacklist terms into a negative prompt', () => {
    expect(builder.negative(['blurry', 'text'])).toBe('blurry,text');
    expect(builder.negative([])).toBe('');
    expect(builder.negative()).toBe('');
  });
});
