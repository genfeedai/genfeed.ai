import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptEnhancementResponseError } from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function setup(enabled = true) {
  const settings = {
    get: vi.fn().mockResolvedValue({ isEnabled: enabled, source: 'brand' }),
  };
  const harness = {
    resolveBrief: vi.fn().mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: [],
      styleDirectives: [],
      guardrails: [],
      sources: [],
      metadata: { contentType: 'image' },
    }),
    formatBrief: vi.fn().mockReturnValue('Private guidance'),
  };
  const packs = {
    listLoadedPackVersions: vi.fn().mockResolvedValue([
      { id: 'public-pack', version: '1.2.3' },
      { id: 'unused', version: '1' },
    ]),
  };
  const promptEnhancement = {
    enhance: vi.fn().mockResolvedValue({
      result: 'A cinematic view of a red bicycle',
      tokensUsed: 10,
      isByok: false,
    }),
  };
  const logger = { warn: vi.fn() };
  return {
    logger,
    settings,
    harness,
    packs,
    promptEnhancement,
    service: new MediaPromptEnhancementService(
      settings as never,
      harness as never,
      packs as never,
      promptEnhancement as never,
      logger as never,
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
  it('rejects selected skills when enhancement is disabled before any model work', async () => {
    const { service, promptEnhancement, harness } = setup(false);
    await expect(
      service.enhance({ ...input, requestedSkillSlugs: ['cinema'] }),
    ).rejects.toThrow('Enable enhancement');
    expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    expect(harness.resolveBrief).not.toHaveBeenCalled();
  });
  it('forwards normalized selections and preserves actionable selection errors', async () => {
    const { service, promptEnhancement } = setup();
    const error = new BadRequestException('Remove unavailable selection');
    promptEnhancement.enhance.mockRejectedValue(error);
    await expect(
      service.enhance({ ...input, requestedSkillSlugs: ['Cinema'] }),
    ).rejects.toBe(error);
    expect(promptEnhancement.enhance).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSkillSlugs: ['cinema'],
        contentType: 'image',
      }),
    );
  });

  it('preserves exact caller bytes and makes no enhancement calls when disabled', async () => {
    const { service, harness, promptEnhancement, packs } = setup(false);
    expect(await service.enhance(input)).toEqual({
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: 'brand',
      status: 'skipped',
      source: 'brand',
      appliedPacks: [],
    });
    expect(harness.resolveBrief).not.toHaveBeenCalled();
    expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    expect(packs.listLoadedPackVersions).not.toHaveBeenCalled();
  });

  it('honors explicit request overrides and exposes only contributing IDs and versions', async () => {
    const { service, promptEnhancement } = setup(false);
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
    expect(promptEnhancement.enhance).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      brandId: input.brandId,
      userPrompt: input.prompt,
      promptId: undefined,
      model: input.model,
      contentType: input.contentType,
    });
  });

  it('announces applied media instructions but excludes non-prompt pack fields', async () => {
    const { service, harness } = setup();
    harness.resolveBrief.mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: ['Keep the product logo accurate'],
      styleDirectives: ['Use warm lighting'],
      guardrails: ['Avoid misleading product claims'],
      evaluationCriteria: ['Internal evaluation rubric'],
      providerHints: ['Internal routing hint'],
      sources: [],
      metadata: { contentType: 'image' },
    });
    const receipt = await service.enhance(input);
    expect(receipt.enhancedPrompt).toContain('Use warm lighting');
    expect(receipt.enhancedPrompt).toContain('Keep the product logo accurate');
    expect(receipt.enhancedPrompt).toContain('Avoid misleading product claims');
    expect(JSON.stringify(receipt)).not.toContain('Internal evaluation rubric');
    expect(JSON.stringify(receipt)).not.toContain('Internal routing hint');
  });

  it('stops on unavailable harness guidance without calling a model', async () => {
    const { service, harness, promptEnhancement } = setup();
    harness.resolveBrief.mockResolvedValue(null);
    await expect(service.enhance(input)).rejects.toThrow(
      'Prompt enhancement is unavailable',
    );
    expect(promptEnhancement.enhance).not.toHaveBeenCalled();
  });

  it('does not hide a provider failure or return a stale applied receipt', async () => {
    const { service, promptEnhancement } = setup();
    promptEnhancement.enhance.mockRejectedValue(new Error('Unavailable'));
    await expect(service.enhance(input)).rejects.toThrow(
      'Prompt enhancement is unavailable',
    );
  });
  it.each(['brief', 'provider', 'response', 'receipt'] as const)(
    'logs only sanitized diagnostics for %s failures',
    async (stage) => {
      const { service, harness, promptEnhancement, packs, logger } = setup();
      const sensitive = 'private prompt and brand guidance from provider error';
      if (stage === 'brief')
        harness.resolveBrief.mockRejectedValue(new Error(sensitive));
      if (stage === 'provider')
        promptEnhancement.enhance.mockRejectedValue(new Error(sensitive));
      if (stage === 'response')
        promptEnhancement.enhance.mockRejectedValue(
          new PromptEnhancementResponseError(),
        );
      if (stage === 'receipt')
        packs.listLoadedPackVersions.mockRejectedValue(new Error(sensitive));
      await expect(
        service.enhance({
          ...input,
          prompt: sensitive,
          model: sensitive,
          contentType: 'video',
        }),
      ).rejects.toThrow('Prompt enhancement is unavailable');
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Media prompt enhancement failed',
        {
          contentType: 'video',
          model: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
          stage,
        },
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(sensitive);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'Private guidance',
      );
    },
  );
  it('folds existing harness guidance locally without sending it to the text enhancer', async () => {
    const { service, harness, promptEnhancement } = setup();
    const privateGuidance = 'Private brand rendering guidance';
    harness.resolveBrief.mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: [privateGuidance],
      styleDirectives: [],
      guardrails: [],
      sources: [],
      metadata: { contentType: 'video' },
    });
    const receipt = await service.enhance({
      ...input,
      brandId: 'selected-brand',
      contentType: 'video',
    });
    expect(receipt.enhancedPrompt).toContain(privateGuidance);
    expect(receipt.originalPrompt).toBe(input.prompt);
    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'selected-brand',
        organizationId: input.organizationId,
      }),
    );
    expect(promptEnhancement.enhance).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      brandId: 'selected-brand',
      userPrompt: input.prompt,
      contentType: 'video',
      model: input.model,
    });
    expect(JSON.stringify(promptEnhancement.enhance.mock.calls)).not.toContain(
      privateGuidance,
    );
    expect(harness.formatBrief).not.toHaveBeenCalled();
  });
  it('classifies shared enhancer output validation failures as response failures', async () => {
    const { service, promptEnhancement, logger } = setup();
    promptEnhancement.enhance.mockRejectedValue(
      new PromptEnhancementResponseError(),
    );
    await expect(service.enhance(input)).rejects.toThrow(
      'Prompt enhancement is unavailable',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Media prompt enhancement failed',
      expect.objectContaining({ stage: 'response' }),
    );
  });
});
