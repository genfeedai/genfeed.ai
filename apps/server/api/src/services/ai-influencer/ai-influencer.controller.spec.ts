import { AiInfluencerController } from '@api/services/ai-influencer/ai-influencer.controller';

describe('AiInfluencerController', () => {
  it('routes post generation through the workflow service', async () => {
    const generatePost = vi.fn().mockResolvedValue({ personaSlug: 'ava' });
    const controller = new AiInfluencerController(
      {} as never,
      { generatePost } as never,
      {} as never,
    );

    await expect(
      controller.generatePost({
        organizationId: 'org-1',
        personaSlug: 'ava',
        platforms: ['linkedin'],
      }),
    ).resolves.toEqual({ data: { personaSlug: 'ava' }, success: true });
    expect(generatePost).toHaveBeenCalledWith({
      aspectRatio: undefined,
      captionOverride: undefined,
      organizationId: 'org-1',
      personaSlug: 'ava',
      platforms: ['linkedin'],
      promptOverride: undefined,
    });
  });

  it('routes daily generation through the tenant workflow', async () => {
    const runDailyPosts = vi.fn().mockResolvedValue({
      generated: 1,
      results: [{ personaSlug: 'ava' }],
    });
    const controller = new AiInfluencerController(
      {} as never,
      { runDailyPosts } as never,
      {} as never,
    );

    await expect(
      controller.scheduleDailyPosts({ organizationId: 'org-1' }),
    ).resolves.toEqual({
      data: { results: [{ personaSlug: 'ava' }], totalGenerated: 1 },
      success: true,
    });
    expect(runDailyPosts).toHaveBeenCalledWith('org-1');
  });
});
