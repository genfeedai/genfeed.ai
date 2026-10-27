import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { SkillBrandBriefService } from '@api/services/skill-executor/skill-brand-brief.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SkillBrandBriefService', () => {
  const harnessGenerationService = {
    formatBrief: vi.fn(),
    resolveBrief: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  const context = {
    brandId: 'brand-1',
    brandVoice: 'ignored',
    organizationId: 'org-1',
    platforms: ['twitter'],
    userId: 'user-1',
  };

  let service: SkillBrandBriefService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SkillBrandBriefService(
      harnessGenerationService as never,
      logger as never,
    );
  });

  it('resolves the brief for the acting user and returns it trimmed', async () => {
    harnessGenerationService.resolveBrief.mockResolvedValue({ id: 'brief' });
    harnessGenerationService.formatBrief.mockReturnValue(
      '  Brand voice: direct.  ',
    );

    const brief = await service.resolve(context, {
      contentType: 'post',
      platform: 'twitter',
      topic: 'AI hooks',
    });

    expect(brief).toBe('Brand voice: direct.');
    expect(harnessGenerationService.resolveBrief).toHaveBeenCalledWith({
      brandId: 'brand-1',
      contentType: 'post',
      includeContentMemory: true,
      organizationId: 'org-1',
      platform: 'twitter',
      topic: 'AI hooks',
      userId: 'user-1',
    });
  });

  it.each([
    ['no brief resolves', null, ''],
    ['the brief is empty', { id: 'brief' }, '   '],
    [
      'the brief is over the brand context budget',
      { id: 'brief' },
      'x'.repeat(BRAND_CONTEXT_CHARACTER_BUDGET + 1),
    ],
  ])('fails with a retryable 503 when %s', async (_name, brief, formatted) => {
    harnessGenerationService.resolveBrief.mockResolvedValue(brief);
    harnessGenerationService.formatBrief.mockReturnValue(formatted);

    await expect(
      service.resolve(context, { contentType: 'article' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lets a brand access refusal through instead of hiding it as a 503', async () => {
    harnessGenerationService.resolveBrief.mockRejectedValue(
      new Error('Brand access denied'),
    );

    await expect(
      service.resolve(context, { contentType: 'post' }),
    ).rejects.toThrow('Brand access denied');
  });
});
