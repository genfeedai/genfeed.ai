import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { StudioProposalsService } from '@api/services/content-engine/studio-proposals.service';
import {
  STUDIO_MEDIA_PROPOSALS_SCHEMA_NAME,
  STUDIO_STORYBOARD_PROPOSALS_SCHEMA_NAME,
} from '@genfeedai/contracts/api-types/contracts';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StudioProposalsService', () => {
  const assembleContext = vi.fn();
  const buildSystemPrompt = vi.fn();
  const findApproved = vi.fn();
  const completeStructured = vi.fn();
  const buildPerformance = vi.fn();
  const resolveBrief = vi.fn();
  const formatBrief = vi.fn();
  const warn = vi.fn();
  let service: StudioProposalsService;

  const request = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    surface: 'image' as const,
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findApproved.mockResolvedValue({ id: 'revision-1', status: 'APPROVED' });
    assembleContext.mockResolvedValue({
      brandId: 'brand-1',
      brandName: 'Acme',
    });
    buildSystemPrompt.mockImplementation((base: string) => `${base}\nBRAND`);
    buildPerformance.mockResolvedValue({
      dataset: { totalPosts: 12 },
      isColdStart: false,
      section: 'Top posts: behind-the-scenes reels.',
    });
    resolveBrief.mockResolvedValue({ id: 'brief-1' });
    formatBrief.mockReturnValue('HARNESS BRIEF: no hype, short sentences.');
    service = new StudioProposalsService(
      { assembleContext, buildSystemPrompt } as never,
      { findApproved } as never,
      { completeStructured } as never,
      { build: buildPerformance } as never,
      { formatBrief, resolveBrief } as never,
      { warn } as never,
    );
  });

  it('keeps the empty composer for a brand without an approved Brand OS', async () => {
    findApproved.mockResolvedValue(null);

    await expect(service.propose(request)).resolves.toEqual({
      isBrandApproved: false,
      proposals: [],
      surface: 'image',
    });
    expect(assembleContext).not.toHaveBeenCalled();
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it('drafts image proposals grounded in brand context and performance', async () => {
    const proposals = [
      {
        aspectRatio: '4:5',
        prompt: 'A barista pouring latte art at golden hour',
        title: 'Golden hour pour',
        why: 'Behind-the-scenes posts are your top performers.',
      },
    ];
    completeStructured.mockResolvedValue({ proposals });

    const result = await service.propose({ ...request, count: 2 });

    expect(result).toEqual({
      isBrandApproved: true,
      proposals,
      surface: 'image',
    });
    expect(assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        layers: { performancePatterns: true },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    const [params, organizationId] = completeStructured.mock.calls[0];
    expect(organizationId).toBe('org-1');
    expect(params.schemaName).toBe(STUDIO_MEDIA_PROPOSALS_SCHEMA_NAME);
    expect(params.messages[0].content).toContain('BRAND');
    expect(params.messages[1].content).toContain('Write 2 distinct proposals');
    expect(params.messages[1].content).toContain(
      'Top posts: behind-the-scenes reels.',
    );
  });

  it('drafts storyboard briefs with a shot plan', async () => {
    const proposals = [
      {
        brief: 'Show a day in the roastery.',
        shots: [
          { description: 'Beans pour into the roaster', durationSeconds: 4 },
          { description: 'Barista tastes the first cup', durationSeconds: 5 },
        ],
        title: 'Roastery day',
        why: 'Process content drives saves for the brand.',
      },
    ];
    completeStructured.mockResolvedValue({ proposals });

    const result = await service.propose({ ...request, surface: 'storyboard' });

    expect(result).toEqual({
      isBrandApproved: true,
      proposals,
      surface: 'storyboard',
    });
    expect(completeStructured.mock.calls[0][0].schemaName).toBe(
      STUDIO_STORYBOARD_PROPOSALS_SCHEMA_NAME,
    );
  });

  it('fails when the brand context cannot be assembled', async () => {
    assembleContext.mockResolvedValue(null);

    await expect(service.propose(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('writes the proposals against the harness brief for the surface', async () => {
    completeStructured.mockResolvedValue({ proposals: [] });

    await service.propose(request);
    await service.propose({ ...request, surface: 'video' });
    await service.propose({ ...request, surface: 'storyboard' });

    expect(
      resolveBrief.mock.calls.map(([params]) => params.contentType),
    ).toEqual(['image', 'video', 'video-script']);
    expect(resolveBrief.mock.calls[0][0]).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    for (const [params] of completeStructured.mock.calls) {
      expect(params.messages[0].content).toContain(
        'HARNESS BRIEF: no hype, short sentences.',
      );
    }
  });

  it.each([
    ['no brief', null, ''],
    ['an empty brief', { id: 'brief-1' }, '   '],
    [
      'an over-budget brief',
      { id: 'brief-1' },
      'x'.repeat(BRAND_CONTEXT_CHARACTER_BUDGET + 1),
    ],
  ])(
    'fails with a retryable 503 and drafts nothing for %s',
    async (_label, brief, formatted) => {
      resolveBrief.mockResolvedValue(brief);
      formatBrief.mockReturnValue(formatted);

      await expect(service.propose(request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(assembleContext).not.toHaveBeenCalled();
      expect(completeStructured).not.toHaveBeenCalled();
    },
  );

  it('lets a brand access refusal through without drafting', async () => {
    resolveBrief.mockRejectedValue(
      new ForbiddenException('Brand access denied'),
    );

    await expect(service.propose(request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it('does not resolve a brief for a brand without an approved Brand OS', async () => {
    findApproved.mockResolvedValue(null);

    await service.propose(request);

    expect(resolveBrief).not.toHaveBeenCalled();
  });
});
