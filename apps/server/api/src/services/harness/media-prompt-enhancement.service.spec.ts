import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { describe, expect, it, vi } from 'vitest';

function setup(enabled = true) {
  const settings = {
    get: vi.fn().mockResolvedValue({ isEnabled: enabled, source: 'brand' }),
  };
  const harness = {
    resolveBrief: vi.fn().mockResolvedValue({ appliedPacks: ['public-pack'] }),
    formatBrief: vi.fn().mockReturnValue('Private guidance'),
  };
  const packs = {
    listLoadedPackVersions: vi.fn().mockResolvedValue([
      { id: 'public-pack', version: '1.2.3' },
      { id: 'unused', version: '1' },
    ]),
  };
  const openRouter = {
    chatCompletion: vi
      .fn()
      .mockResolvedValue({
        choices: [
          { message: { content: 'A cinematic view of a red bicycle' } },
        ],
      }),
  };
  return {
    settings,
    harness,
    packs,
    openRouter,
    service: new MediaPromptEnhancementService(
      settings as never,
      harness as never,
      packs as never,
      openRouter as never,
    ),
  };
}
const input = {
  organizationId: 'org',
  brandId: 'brand',
  prompt: '  A red bicycle.\n',
  contentType: 'image' as const,
  model: 'image-model',
};

describe('MediaPromptEnhancementService', () => {
  it('preserves exact caller bytes and makes no enhancement calls when disabled', async () => {
    const { service, harness, openRouter, packs } = setup(false);
    expect(await service.enhance(input)).toEqual({
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: 'brand',
      status: 'skipped',
      source: 'brand',
      appliedPacks: [],
    });
    expect(harness.resolveBrief).not.toHaveBeenCalled();
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
    expect(packs.listLoadedPackVersions).not.toHaveBeenCalled();
  });

  it('honors explicit request overrides and exposes only contributing IDs and versions', async () => {
    const { service, openRouter } = setup(false);
    const receipt = await service.enhance({ ...input, harness: true });
    expect(receipt).toEqual({
      originalPrompt: input.prompt,
      enhancedPrompt: 'A cinematic view of a red bicycle',
      brandId: 'brand',
      status: 'applied',
      source: 'request',
      appliedPacks: [{ id: 'public-pack', version: '1.2.3' }],
    });
    expect(JSON.stringify(receipt)).not.toContain('Private guidance');
    expect(openRouter.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('image-model'),
          }),
          { role: 'user', content: input.prompt },
        ],
      }),
    );
  });

  it('stops on unavailable harness guidance without calling a model', async () => {
    const { service, harness, openRouter } = setup();
    harness.resolveBrief.mockResolvedValue(null);
    await expect(service.enhance(input)).rejects.toThrow(
      'Prompt enhancement is unavailable',
    );
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
  });

  it.each(['', 'x'.repeat(8001)])(
    'rejects unusable model output',
    async (output) => {
      const { service, openRouter } = setup();
      openRouter.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: output } }],
      });
      await expect(service.enhance(input)).rejects.toThrow(
        'Prompt enhancement is unavailable',
      );
    },
  );

  it('does not hide a provider failure or return a stale applied receipt', async () => {
    const { service, openRouter } = setup();
    openRouter.chatCompletion.mockRejectedValue(new Error('Unavailable'));
    await expect(service.enhance(input)).rejects.toThrow(
      'Prompt enhancement is unavailable',
    );
  });
});
