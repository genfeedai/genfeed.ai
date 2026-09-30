import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import { ReviewDecision } from '@genfeedai/contracts';
import type { IHarnessAvoidFeedbackEntry } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';

function createHarnessProfilesService() {
  return {
    getActiveForBrand: vi.fn(),
    update: vi.fn(),
  };
}

function createLogger() {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createProfile(overrides: Record<string, unknown> = {}) {
  return {
    avoidFeedback: [] as IHarnessAvoidFeedbackEntry[],
    brandId: 'brand-1',
    examples: { avoid: [] as string[], good: [] as string[] },
    id: 'profile-1',
    ...overrides,
  };
}

describe('HarnessReviewFeedbackService', () => {
  let harnessProfilesService: ReturnType<typeof createHarnessProfilesService>;
  let logger: ReturnType<typeof createLogger>;
  let service: HarnessReviewFeedbackService;

  beforeEach(() => {
    harnessProfilesService = createHarnessProfilesService();
    logger = createLogger();
    service = new HarnessReviewFeedbackService(
      logger as unknown as LoggerService,
      harnessProfilesService as unknown as HarnessProfilesService,
    );
  });

  it('appends a rejected excerpt to examples.avoid and records feedback metadata', async () => {
    const profile = createProfile();
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'This post says something off-brand.',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      reason: 'Too salesy',
      sourceId: 'item-1',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.update).toHaveBeenCalledTimes(1);
    const [profileId, dto, organizationId] =
      harnessProfilesService.update.mock.calls[0];
    expect(profileId).toBe('profile-1');
    expect(organizationId).toBe('org-1');
    expect(dto.examples.avoid).toEqual(['This post says something off-brand.']);
    expect(dto.avoidFeedback).toHaveLength(1);
    expect(dto.avoidFeedback[0]).toMatchObject({
      content: 'This post says something off-brand.',
      isAutoAdded: true,
      reason: 'Too salesy',
      source: 'batch_item:item-1',
    });
    expect(typeof dto.avoidFeedback[0].addedAt).toBe('string');
  });

  it('appends request_changes feedback the same way as rejections', async () => {
    const profile = createProfile();
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Draft needs a different hook.',
      decision: ReviewDecision.REQUEST_CHANGES,
      organizationId: 'org-1',
      sourceId: 'item-2',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.update).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for approved decisions (promote-winners owns positive reinforcement)', async () => {
    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Great post!',
      decision: ReviewDecision.APPROVED,
      organizationId: 'org-1',
      sourceId: 'item-3',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
    expect(harnessProfilesService.update).not.toHaveBeenCalled();
  });

  it('is a no-op for unset decisions', async () => {
    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Unreviewed content',
      decision: ReviewDecision.UNSET,
      organizationId: 'org-1',
      sourceId: 'item-4',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
  });

  it('no-ops when brandId is missing', async () => {
    await service.recordReviewDecision({
      content: 'Off-brand copy',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-5',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
  });

  it('no-ops when content is blank', async () => {
    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: '   ',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-6',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
  });

  it('no-ops when the brand has no active harness profile', async () => {
    harnessProfilesService.getActiveForBrand.mockResolvedValue(null);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Off-brand copy',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-7',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.update).not.toHaveBeenCalled();
  });

  it('dedupes by source stamp instead of writing a duplicate entry', async () => {
    const profile = createProfile({
      avoidFeedback: [
        {
          addedAt: '2026-08-01T00:00:00.000Z',
          content: 'Already recorded content.',
          isAutoAdded: true,
          source: 'batch_item:item-8',
        },
      ],
      examples: { avoid: ['Already recorded content.'], good: [] },
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Already recorded content.',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-8',
      sourceType: 'batch_item',
    });

    expect(harnessProfilesService.update).not.toHaveBeenCalled();
  });

  it('truncates long content to an excerpt', async () => {
    const profile = createProfile();
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);
    const longContent = 'x'.repeat(1000);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: longContent,
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-9',
      sourceType: 'batch_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.avoidFeedback[0].content.length).toBeLessThan(
      longContent.length,
    );
    expect(dto.avoidFeedback[0].content.endsWith('…')).toBe(true);
  });

  it('preserves pre-existing human-curated avoid strings untouched', async () => {
    const profile = createProfile({
      examples: { avoid: ['Never use this tagline.'], good: [] },
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'A rejected generated caption.',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-10',
      sourceType: 'batch_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.examples.avoid).toEqual([
      'Never use this tagline.',
      'A rejected generated caption.',
    ]);
  });

  it('caps auto-added feedback at 20 entries, evicting the oldest auto-added ones first', async () => {
    const existingFeedback: IHarnessAvoidFeedbackEntry[] = Array.from(
      { length: 20 },
      (_, index) => ({
        addedAt: new Date(2026, 0, index + 1).toISOString(),
        content: `Auto entry ${index}`,
        isAutoAdded: true,
        source: `batch_item:old-${index}`,
      }),
    );
    const profile = createProfile({
      avoidFeedback: existingFeedback,
      examples: {
        avoid: existingFeedback.map((entry) => entry.content),
        good: [],
      },
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Newest rejected content',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-new',
      sourceType: 'batch_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.avoidFeedback).toHaveLength(20);
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) =>
          entry.source === 'batch_item:old-0',
      ),
    ).toBe(false);
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) =>
          entry.source === 'batch_item:item-new',
      ),
    ).toBe(true);
  });

  it('never evicts human-curated feedback entries, even past the cap', async () => {
    const humanEntry: IHarnessAvoidFeedbackEntry = {
      addedAt: new Date(2020, 0, 1).toISOString(),
      content: 'Human curated anti-example.',
      isAutoAdded: false,
      source: 'human',
    };
    const autoEntries: IHarnessAvoidFeedbackEntry[] = Array.from(
      { length: 20 },
      (_, index) => ({
        addedAt: new Date(2026, 0, index + 1).toISOString(),
        content: `Auto entry ${index}`,
        isAutoAdded: true,
        source: `batch_item:old-${index}`,
      }),
    );
    const profile = createProfile({
      avoidFeedback: [humanEntry, ...autoEntries],
      examples: {
        avoid: [humanEntry, ...autoEntries].map((entry) => entry.content),
        good: [],
      },
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Newest rejected content',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-newest',
      sourceType: 'batch_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) => entry.source === 'human',
      ),
    ).toBe(true);
  });

  it('never throws — logs and swallows errors so the review action always succeeds', async () => {
    harnessProfilesService.getActiveForBrand.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      service.recordReviewDecision({
        brandId: 'brand-1',
        content: 'Some content',
        decision: ReviewDecision.REJECTED,
        organizationId: 'org-1',
        sourceId: 'item-11',
        sourceType: 'batch_item',
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('resolves HarnessProfilesService via ModuleRef when not directly injected', async () => {
    const moduleRefProfilesService = createHarnessProfilesService();
    const profile = createProfile();
    moduleRefProfilesService.getActiveForBrand.mockResolvedValue(profile);
    moduleRefProfilesService.update.mockResolvedValue(profile);
    const moduleRef = {
      get: vi.fn().mockReturnValue(moduleRefProfilesService),
    };

    const withModuleRef = new HarnessReviewFeedbackService(
      logger as unknown as LoggerService,
      undefined,
      moduleRef as never,
    );

    await withModuleRef.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Some rejected content',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-12',
      sourceType: 'batch_item',
    });

    expect(moduleRef.get).toHaveBeenCalled();
    expect(moduleRefProfilesService.update).toHaveBeenCalledTimes(1);
  });
});
