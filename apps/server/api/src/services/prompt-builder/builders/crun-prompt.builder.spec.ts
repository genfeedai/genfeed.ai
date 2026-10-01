import { CrunPromptBuilder } from '@api/services/prompt-builder/builders/crun-prompt.builder';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';

describe('Crun prompt builder', () => {
  const builder = new CrunPromptBuilder();
  it.each(['crun/google/nano-banana-pro', 'crun/bytedance/seedream-4-5'])(
    'forwards rendered text only for %s',
    (model) => {
      expect(
        builder.buildPrompt(
          model,
          {
            prompt: 'original',
            modelCategory: ModelCategory.IMAGE,
            width: 1920,
            seed: 5,
            outputs: 4,
            resolution: '1080p',
          },
          'rendered',
        ),
      ).toEqual({ prompt: 'rendered' });
      expect(builder.getProvider()).toBe(ModelProvider.CRUN);
    },
  );
  it.each(['crun/kling/v2-5-turbo-pro', 'crun/google/veo3-1-fast-t2v'])(
    'uses deterministic video text for %s without forwarding controls',
    (model) => {
      expect(
        builder.buildPrompt(
          model,
          {
            prompt: 'original',
            modelCategory: ModelCategory.VIDEO,
            duration: 8,
            resolution: '1080p',
          },
          'rendered',
        ),
      ).toEqual({ prompt: 'rendered' });
    },
  );
  it('rejects unreviewed variants', () => {
    expect(builder.supportsModel('crun/google/nano-banana-pro-v2')).toBe(false);
    expect(() =>
      builder.buildPrompt(
        'google/nano-banana-pro',
        { prompt: 'original', modelCategory: ModelCategory.IMAGE },
        'rendered',
      ),
    ).toThrow('Unsupported Crun model');
  });
});
