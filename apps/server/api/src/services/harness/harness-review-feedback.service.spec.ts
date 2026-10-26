import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { HarnessReviewFeedbackService } from '@api/services/harness/harness-review-feedback.service';
import { ReviewDecision } from '@genfeedai/contracts';
import type { IHarnessAvoidFeedbackEntry } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';

function createHarnessProfilesService() {
  return {
    create: vi.fn(),
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
      sourceType: 'turbo_run_item',
    });

    expect(harnessProfilesService.update).toHaveBeenCalledTimes(1);
    const [profileId, dto, organizationId] =
      harnessProfilesService.update.mock.calls[0];
    expect(profileId).toBe('profile-1');
    expect(organizationId).toBe('org-1');
    // The reviewer's reason travels with the excerpt into later prompts.
    expect(dto.examples.avoid).toEqual([
      'This post says something off-brand. — because Too salesy',
    ]);
    expect(dto.avoidFeedback).toHaveLength(1);
    expect(dto.avoidFeedback[0]).toMatchObject({
      content: 'This post says something off-brand.',
      isAutoAdded: true,
      reason: 'Too salesy',
      source: 'turbo_run_item:item-1',
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
      sourceType: 'turbo_run_item',
    });

    expect(harnessProfilesService.update).toHaveBeenCalledTimes(1);
  });

  it('appends an approved draft to examples.good after curated examples, newest first', async () => {
    const profile = createProfile({
      examples: { avoid: [], good: ['Curated example'] },
      goodFeedback: [
        {
          addedAt: '2026-10-01T00:00:00.000Z',
          content: 'Earlier approval',
          source: 'turbo_run_item:item-0',
        },
      ],
    });
    // The earlier approval is already part of examples.good.
    profile.examples.good.push('Earlier approval');
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Great post!',
      decision: ReviewDecision.APPROVED,
      organizationId: 'org-1',
      sourceId: 'item-3',
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.examples).toEqual({
      good: ['Curated example', 'Great post!', 'Earlier approval'],
    });
    expect(dto.goodFeedback).toHaveLength(2);
    expect(dto.goodFeedback[0]).toMatchObject({
      content: 'Great post!',
      source: 'turbo_run_item:item-3',
    });
    expect(dto.avoidFeedback).toBeUndefined();
  });

  it('keeps only the newest five approvals and leaves curated examples alone', async () => {
    const goodFeedback = Array.from({ length: 5 }, (_, index) => ({
      addedAt: `2026-10-0${index + 1}T00:00:00.000Z`,
      content: `Approved ${index + 1}`,
      source: `turbo_run_item:old-${index + 1}`,
    }));
    const profile = createProfile({
      examples: {
        avoid: [],
        good: ['Curated example', ...goodFeedback.map((fb) => fb.content)],
      },
      goodFeedback,
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Approved newest',
      decision: ReviewDecision.APPROVED,
      organizationId: 'org-1',
      sourceId: 'new',
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.examples.good).toEqual([
      'Curated example',
      'Approved newest',
      'Approved 5',
      'Approved 4',
      'Approved 3',
      'Approved 2',
    ]);
    expect(dto.goodFeedback).toHaveLength(5);
  });

  it('does not save the same approval twice', async () => {
    harnessProfilesService.getActiveForBrand.mockResolvedValue(
      createProfile({
        goodFeedback: [
          {
            addedAt: '2026-10-01T00:00:00.000Z',
            content: 'Great post!',
            source: 'turbo_run_item:item-3',
          },
        ],
      }),
    );

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Great post!',
      decision: ReviewDecision.APPROVED,
      organizationId: 'org-1',
      sourceId: 'item-3',
      sourceType: 'turbo_run_item',
    });

    expect(harnessProfilesService.update).not.toHaveBeenCalled();
  });

  it('is a no-op for unset decisions', async () => {
    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Unreviewed content',
      decision: ReviewDecision.UNSET,
      organizationId: 'org-1',
      sourceId: 'item-4',
      sourceType: 'turbo_run_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
  });

  it('no-ops when brandId is missing', async () => {
    await service.recordReviewDecision({
      content: 'Off-brand copy',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-5',
      sourceType: 'turbo_run_item',
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
      sourceType: 'turbo_run_item',
    });

    expect(harnessProfilesService.getActiveForBrand).not.toHaveBeenCalled();
  });

  it('creates a harness profile when the brand has none, so the feedback is kept', async () => {
    const created = createProfile({ id: 'profile-new' });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(null);
    harnessProfilesService.create.mockResolvedValue(created);
    harnessProfilesService.update.mockResolvedValue(created);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Off-brand copy',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      reason: 'Too salesy',
      sourceId: 'item-7',
      sourceType: 'turbo_run_item',
      userId: 'user-1',
    });

    expect(harnessProfilesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        isDefault: true,
        scope: 'brand',
        status: 'active',
      }),
      'org-1',
      'user-1',
    );
    const [profileId, dto] = harnessProfilesService.update.mock.calls[0];
    expect(profileId).toBe('profile-new');
    expect(dto.examples.avoid).toEqual(['Off-brand copy — because Too salesy']);
  });

  it('caps a long reason and keeps an entry without one as the bare excerpt', async () => {
    const profile = createProfile();
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'Draft A',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      reason: 'y'.repeat(600),
      sourceId: 'item-r1',
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.avoidFeedback[0].reason.length).toBeLessThanOrEqual(240);
    expect(dto.avoidFeedback[0].reason.endsWith('…')).toBe(true);
  });

  it('re-renders an earlier entry that has a reason instead of keeping it as a human string', async () => {
    const profile = createProfile({
      avoidFeedback: [
        {
          addedAt: '2026-08-01T00:00:00.000Z',
          content: 'Old rejected draft.',
          isAutoAdded: true,
          reason: 'Wrong audience',
          source: 'turbo_run_item:old',
        },
      ],
      examples: { avoid: ['Old rejected draft.'], good: [] },
    });
    harnessProfilesService.getActiveForBrand.mockResolvedValue(profile);
    harnessProfilesService.update.mockResolvedValue(profile);

    await service.recordReviewDecision({
      brandId: 'brand-1',
      content: 'New rejected draft.',
      decision: ReviewDecision.REJECTED,
      organizationId: 'org-1',
      sourceId: 'item-new',
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.examples.avoid).toEqual([
      'Old rejected draft. — because Wrong audience',
      'New rejected draft.',
    ]);
  });

  it('dedupes by source stamp instead of writing a duplicate entry', async () => {
    const profile = createProfile({
      avoidFeedback: [
        {
          addedAt: '2026-08-01T00:00:00.000Z',
          content: 'Already recorded content.',
          isAutoAdded: true,
          source: 'turbo_run_item:item-8',
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
      sourceType: 'turbo_run_item',
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
      sourceType: 'turbo_run_item',
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
      sourceType: 'turbo_run_item',
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
        source: `turbo_run_item:old-${index}`,
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
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(dto.avoidFeedback).toHaveLength(20);
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) =>
          entry.source === 'turbo_run_item:old-0',
      ),
    ).toBe(false);
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) =>
          entry.source === 'turbo_run_item:item-new',
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
        source: `turbo_run_item:old-${index}`,
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
      sourceType: 'turbo_run_item',
    });

    const [, dto] = harnessProfilesService.update.mock.calls[0];
    expect(
      dto.avoidFeedback.some(
        (entry: IHarnessAvoidFeedbackEntry) => entry.source === 'human',
      ),
    ).toBe(true);
  });

  it('serializes decisions for one brand so a batch keeps every approval', async () => {
    let stored = createProfile();
    harnessProfilesService.getActiveForBrand.mockImplementation(async () => {
      const snapshot = stored;
      // Yield so an unserialized second call would read the same snapshot.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return snapshot;
    });
    harnessProfilesService.update.mockImplementation(
      async (_id: string, dto: Record<string, unknown>) => {
        stored = { ...stored, ...dto } as typeof stored;
        return stored;
      },
    );

    await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        service.recordReviewDecision({
          brandId: 'brand-1',
          content: `Approved ${id}`,
          decision: ReviewDecision.APPROVED,
          organizationId: 'org-1',
          sourceId: id,
          sourceType: 'turbo_run_item',
        }),
      ),
    );

    expect(
      (stored as { goodFeedback: Array<{ content: string }> }).goodFeedback
        .map((entry) => entry.content)
        .sort(),
    ).toEqual(['Approved a', 'Approved b', 'Approved c']);
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
        sourceType: 'turbo_run_item',
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
      sourceType: 'turbo_run_item',
    });

    expect(moduleRef.get).toHaveBeenCalled();
    expect(moduleRefProfilesService.update).toHaveBeenCalledTimes(1);
  });
});
