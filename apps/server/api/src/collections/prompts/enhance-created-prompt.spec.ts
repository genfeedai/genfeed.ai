import { enhanceCreatedPrompt } from '@api/collections/prompts/enhance-created-prompt';
import { PromptStatus, Status } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const input = {
  brandId: 'selected-brand',
  chargedCredits: 1,
  organizationId: 'org',
  promptId: 'prompt',
  requestedSkillSlugs: ['cinema'],
  systemPromptKey: 'system.model.image',
  url: 'prompt-create',
  userId: 'user',
  userPrompt: 'Raw input',
  contentType: 'image' as const,
};
function setup() {
  return {
    promptEnhancementService: {
      enhance: vi.fn().mockResolvedValue({
        result: 'Shared enhanced result',
        tokensUsed: 20,
        isByok: false,
      }),
    },
    promptsService: { patch: vi.fn() },
    creditsUtilsService: { refundOrganizationCredits: vi.fn() },
    websocketService: { emit: vi.fn() },
    loggerService: { log: vi.fn(), error: vi.fn() },
  };
}

describe('enhanceCreatedPrompt', () => {
  it('persists and publishes the shared enhancer result for the selected brand and skills', async () => {
    const deps = setup();
    await enhanceCreatedPrompt(deps as never, input);
    expect(deps.promptEnhancementService.enhance).toHaveBeenCalledWith({
      brandId: 'selected-brand',
      contentType: 'image',
      organizationId: 'org',
      requestedSkillSlugs: ['cinema'],
      systemPromptKey: 'system.model.image',
      userPrompt: 'Raw input',
    });
    expect(deps.promptsService.patch).toHaveBeenCalledWith('prompt', {
      enhanced: 'Shared enhanced result',
      status: PromptStatus.GENERATED,
    });
    expect(deps.websocketService.emit).toHaveBeenCalledWith(
      expect.any(String),
      { result: 'Shared enhanced result', status: Status.COMPLETED },
    );
    expect(
      deps.creditsUtilsService.refundOrganizationCredits,
    ).not.toHaveBeenCalled();
  });

  it('retains refund, failed persistence and websocket behavior on shared enhancement failure', async () => {
    const deps = setup();
    deps.promptEnhancementService.enhance.mockRejectedValue(
      new Error('Enhancement unavailable'),
    );
    await enhanceCreatedPrompt(deps as never, input);
    expect(
      deps.creditsUtilsService.refundOrganizationCredits,
    ).toHaveBeenCalledWith(
      'org',
      1,
      'prompt-creation-refund',
      'Prompt creation failed - credit refund',
      expect.any(Date),
    );
    expect(deps.promptsService.patch).toHaveBeenCalledWith('prompt', {
      status: PromptStatus.FAILED,
    });
    expect(deps.websocketService.emit).toHaveBeenCalledWith(
      expect.any(String),
      { error: 'Enhancement unavailable', status: Status.FAILED },
    );
    expect(deps.promptsService.patch).not.toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({ enhanced: expect.any(String) }),
    );
  });
});
