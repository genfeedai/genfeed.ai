import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import {
  PROMPT_ENHANCEMENT_MODEL,
  PromptEnhancementService,
} from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { describe, expect, it, vi } from 'vitest';

const input = {
  organizationId: 'org',
  brandId: 'selected-brand',
  userPrompt: '  Original creative intent\n',
};
function setup() {
  const openRouter = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: '  Enhanced creative prompt  ' } }],
      usage: { total_tokens: 15 },
    }),
  };
  const templates = {
    getRenderedPrompt: vi.fn().mockResolvedValue('Existing Studio template'),
  };
  const skills = {
    resolveRequestedSkillPromptSections: vi.fn().mockResolvedValue(''),
  };
  const prompts = { findOne: vi.fn().mockResolvedValue(null) };
  const service = new PromptEnhancementService(
    openRouter as never,
    prompts as never,
    templates as never,
    skills as never,
  );
  return { service, openRouter, templates, skills, prompts };
}

describe('PromptEnhancementService', () => {
  it('reuses only a completed enhancement with matching tenant, brand and exact text', async () => {
    const { service, prompts, openRouter } = setup();
    prompts.findOne.mockResolvedValue({ id: 'reviewed' });
    expect(await service.enhance({ ...input, promptId: 'reviewed' })).toEqual({
      result: input.userPrompt,
      tokensUsed: 0,
      isByok: false,
    });
    expect(prompts.findOne).toHaveBeenCalledWith({
      id: 'reviewed',
      organizationId: 'org',
      brandId: 'selected-brand',
      isDeleted: false,
      isSkipEnhancement: false,
      status: 'generated',
      enhanced: input.userPrompt,
    });
    expect(openRouter.chatCompletion).not.toHaveBeenCalled();
  });
  it('enhances normally when a saved prompt does not satisfy the scope and content query', async () => {
    const { service, openRouter } = setup();
    await service.enhance({ ...input, promptId: 'inaccessible-or-edited' });
    expect(openRouter.chatCompletion).toHaveBeenCalledOnce();
  });
  it('uses the existing model template, selected-brand skills, free model and Studio config', async () => {
    const { service, templates, skills, openRouter } = setup();
    skills.resolveRequestedSkillPromptSections.mockResolvedValue(
      'Selected skill',
    );
    expect(
      await service.enhance({
        ...input,
        model: 'provider/visual-model',
        requestedSkillSlugs: ['cinema'],
        contentType: 'image',
      }),
    ).toEqual({
      result: 'Enhanced creative prompt',
      tokensUsed: 15,
      isByok: false,
    });
    expect(templates.getRenderedPrompt).toHaveBeenCalledWith(
      'system.model.visual-model',
      {},
      'org',
    );
    expect(skills.resolveRequestedSkillPromptSections).toHaveBeenCalledWith(
      'org',
      'selected-brand',
      ['cinema'],
    );
    expect(openRouter.chatCompletion).toHaveBeenCalledWith(
      {
        model: PROMPT_ENHANCEMENT_MODEL,
        max_tokens: TEXT_GENERATION_LIMITS.promptEnhancement,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content: 'Existing Studio template\n\nSelected skill',
          },
          { role: 'user', content: input.userPrompt },
        ],
      },
      undefined,
    );
  });

  it.each(['image', 'video'] as const)(
    'reuses the cinematic fallback when the %s model template is unavailable',
    async (contentType) => {
      const { service, templates, openRouter } = setup();
      templates.getRenderedPrompt.mockRejectedValue(
        new Error('Template missing'),
      );
      await service.enhance({
        ...input,
        contentType,
        model: 'provider/unknown',
      });
      expect(openRouter.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining('Cinematography vocabulary'),
            }),
            { role: 'user', content: input.userPrompt },
          ],
        }),
        undefined,
      );
    },
  );

  it('uses the existing cinematic fallback for a blank template', async () => {
    const { service, templates, openRouter } = setup();
    templates.getRenderedPrompt.mockResolvedValue('  ');
    await service.enhance({ ...input, contentType: 'image' });
    expect(
      openRouter.chatCompletion.mock.calls[0]?.[0].messages[0].content,
    ).toContain('Cinematography vocabulary');
  });

  it('preserves explicit Studio template keys without a model', async () => {
    const { service, templates } = setup();
    await service.enhance({ ...input, systemPromptKey: 'system.custom' });
    expect(templates.getRenderedPrompt).toHaveBeenCalledWith(
      'system.custom',
      {},
      'org',
    );
  });

  it('preserves server-prepared Agent context and BYOK without template replacement', async () => {
    const { service, templates, openRouter } = setup();
    expect(
      await service.enhance(input, {
        preparedSystemPrompt: 'Existing assembled Agent brand context',
        byokApiKey: 'byok-fixture',
      }),
    ).toMatchObject({ isByok: true });
    expect(templates.getRenderedPrompt).not.toHaveBeenCalled();
    expect(openRouter.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'Existing assembled Agent brand context' },
          { role: 'user', content: input.userPrompt },
        ],
      }),
      'byok-fixture',
    );
  });

  it.each(['', '  ', 'x'.repeat(8001)])(
    'rejects an invalid provider result',
    async (result) => {
      const { service, openRouter } = setup();
      openRouter.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: result } }],
        usage: { total_tokens: 15 },
      });
      await expect(service.enhance(input)).rejects.toThrow('invalid response');
    },
  );

  it('propagates provider errors to the caller for its existing failure behavior', async () => {
    const { service, openRouter } = setup();
    openRouter.chatCompletion.mockRejectedValue(new Error('Provider failed'));
    await expect(service.enhance(input)).rejects.toThrow('Provider failed');
  });
});
