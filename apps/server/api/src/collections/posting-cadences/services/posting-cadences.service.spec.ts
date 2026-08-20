<<<<<<< HEAD
import {
  CalendarSlotItemType,
  CalendarSlotState,
  PostCategory,
  PostingCadenceStatus,
  ReleaseStatus,
} from '@genfeedai/enums';
=======
import { ApiKeyScope, PostCategory, ReleaseStatus } from '@genfeedai/enums';
import { ForbiddenException } from '@nestjs/common';
>>>>>>> origin/master
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostingCadencesService } from './posting-cadences.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const BRAND_ID = 'cbrand0000001';
const CREDENTIAL_ID = 'ccredential01';
const CADENCE_ID = 'ccadence00001';
const INSTANT = '2026-08-20T10:00:00.000Z';
const IDENTITY_KEY = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|${INSTANT}`;
const ARTICLE_IDENTITY_KEY = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.ARTICLE}|${INSTANT}`;
const RANGE = {
  endDate: '2026-08-21T00:00:00.000Z',
  startDate: '2026-08-20T00:00:00.000Z',
};

function cadenceRow(
  overrides: Partial<ReturnType<typeof baseCadenceRow>> = {},
) {
  return { ...baseCadenceRow(), ...overrides };
}

function baseCadenceRow() {
  return {
    brief: 'A short every two hours about shipping in public',
    brandId: BRAND_ID,
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    credentialId: CREDENTIAL_ID,
    endsAt: new Date('2026-08-21T00:00:00.000Z'),
    format: PostCategory.REEL,
    generateLanding: 'draft',
    id: CADENCE_ID,
    intervalMinutes: 120,
    isDeleted: false,
    label: 'August shorts',
    maxOccurrences: null,
    organizationId: ORG_ID,
    startsAt: new Date('2026-08-20T00:00:00.000Z'),
    status: 'active',
    timezone: 'UTC',
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: USER_ID,
    windowEndMinute: 22 * 60,
    windowStartMinute: 8 * 60,
  };
}

function reservationRow(
  overrides: Partial<ReturnType<typeof baseReservationRow>> = {},
) {
  return { ...baseReservationRow(), ...overrides };
}

function baseReservationRow() {
  return {
    brandId: BRAND_ID,
    cadenceId: CADENCE_ID,
    credentialId: CREDENTIAL_ID,
    format: PostCategory.REEL,
    generatedItemId: null,
    generatedItemType: null,
    id: 'reservation-1',
    identityKey: IDENTITY_KEY,
    instant: new Date(INSTANT),
    lastFailureReason: null,
    state: 'generating',
    timezone: 'UTC',
  };
}

function generatingReservation() {
  return reservationRow();
}

describe('PostingCadencesService', () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const cadenceUpdate = vi.fn();
  const postGroupsService = { create: vi.fn(), getOne: vi.fn() };
  const articlesService = { createArticle: vi.fn() };
  const llmDispatcherService = { chatCompletion: vi.fn() };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const modelsService = { findOne: vi.fn() };
  const slotReservation = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    article: { findMany: vi.fn().mockResolvedValue([]) },
    brand: { findFirst: vi.fn() },
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: CREDENTIAL_ID,
        platform: 'INSTAGRAM',
      }),
    },
    post: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    postingCadence: { create, findFirst, findMany, update: cadenceUpdate },
    slotReservation,
  };

  let service: PostingCadencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.credential.findFirst.mockResolvedValue({
      id: CREDENTIAL_ID,
      platform: 'INSTAGRAM',
    });
    prisma.post.findMany.mockResolvedValue([]);
    prisma.article.findMany.mockResolvedValue([]);
    slotReservation.findMany.mockResolvedValue([]);
    slotReservation.updateMany.mockResolvedValue({ count: 0 });
    service = new PostingCadencesService(
      prisma as never,
      { error: vi.fn() } as never,
      postGroupsService as never,
      llmDispatcherService as never,
      creditsUtilsService as never,
      modelsService as never,
      articlesService as never,
    );
  });

  it('rejects a cadence with neither end date nor max occurrences', async () => {
    await expect(
      service.create(ORG_ID, USER_ID, {
        brandId: BRAND_ID,
        credentialId: CREDENTIAL_ID,
        format: PostCategory.REEL,
        intervalMinutes: 120,
        startsAt: '2026-08-20T00:00:00.000Z',
        windowEndMinute: 22 * 60,
        windowStartMinute: 8 * 60,
      }),
    ).rejects.toThrow('end date or a max occurrence count');
    expect(create).not.toHaveBeenCalled();
  });

  it('writes a draft without calling the model or charging credits', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.create.mockResolvedValue(generatingReservation());
    slotReservation.update.mockResolvedValue({
      ...generatingReservation(),
      generatedItemId: 'release-1',
      generatedItemType: 'release',
      state: 'filled',
    });
    postGroupsService.create.mockResolvedValue({
      id: 'release-1',
      targets: [{ id: 'post-1' }],
    });

    const result = await service.write(ORG_ID, USER_ID, IDENTITY_KEY);

    expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(postGroupsService.create).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({
        baseContent: 'Draft',
        status: ReleaseStatus.DRAFT,
        title: 'Untitled',
      }),
      IDENTITY_KEY,
      { source: 'calendar-slot' },
      undefined,
    );
    expect(result.releaseId).toBe('release-1');
  });

  it('generates campaign copy from brand context and scheduled posts, then charges credits', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.create.mockResolvedValue(generatingReservation());
    slotReservation.update.mockResolvedValue({
      ...generatingReservation(),
      generatedItemId: 'release-2',
      generatedItemType: 'release',
      state: 'filled',
    });
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { voice: { style: 'direct', tone: 'operator-to-operator' } },
      description: 'Open-source AI OS for content creation',
      label: 'Genfeed',
      text: null,
    });
    prisma.post.findMany.mockResolvedValue([
      {
        description: 'Morning: we shipped cadence ghosts on the calendar.',
        scheduledDate: new Date('2026-08-20T08:00:00.000Z'),
      },
    ]);
    modelsService.findOne.mockResolvedValue({
      minCost: 1,
      pricingType: 'per-token',
      inputCostPerMillionTokens: 10,
      outputCostPerMillionTokens: 40,
    });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Hook: Generate just filled the 10am hole.',
          },
        },
      ],
    });
    postGroupsService.create.mockResolvedValue({
      id: 'release-2',
      targets: [{ id: 'post-2' }],
    });

    const result = await service.generate(ORG_ID, USER_ID, IDENTITY_KEY);

    expect(llmDispatcherService.chatCompletion).toHaveBeenCalledTimes(1);
    const completionArgs = llmDispatcherService.chatCompletion.mock.calls[0];
    expect(completionArgs?.[1]).toBe(ORG_ID);
    const messages = completionArgs?.[0]?.messages as Array<{
      content: string;
      role: string;
    }>;
    const userPrompt = messages.find(
      (message) => message.role === 'user',
    )?.content;
    expect(userPrompt).toContain('Brand: Genfeed');
    expect(userPrompt).toContain('Campaign: August shorts');
    expect(userPrompt).toContain('Morning: we shipped cadence ghosts');
    expect(userPrompt).toContain('Already scheduled in this campaign');
    expect(postGroupsService.create).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({
        baseContent: 'Hook: Generate just filled the 10am hole.',
        title: 'August shorts',
      }),
      IDENTITY_KEY,
      { source: 'calendar-slot' },
      undefined,
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalled();
    expect(result.releaseId).toBe('release-2');
  });

<<<<<<< HEAD
  it('persists skip and omits the skipped identity from listSlots', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.create.mockResolvedValue(
      reservationRow({ state: CalendarSlotState.SKIPPED }),
    );

    const skipped = await service.skip(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identityKey: IDENTITY_KEY,
        state: CalendarSlotState.SKIPPED,
      }),
    });
    expect(skipped.state).toBe(CalendarSlotState.SKIPPED);

    findMany.mockResolvedValue([cadenceRow()]);
    slotReservation.findMany.mockResolvedValue([
      reservationRow({ state: CalendarSlotState.SKIPPED }),
    ]);

    const slots = await service.listSlots(
      ORG_ID,
      BRAND_ID,
      RANGE.startDate,
      RANGE.endDate,
    );

    expect(slots.some((slot) => slot.identityKey === IDENTITY_KEY)).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('allows skip on a generate-failed slot', async () => {
    slotReservation.findFirst.mockResolvedValue(
      reservationRow({
        lastFailureReason: 'The model returned empty copy.',
        state: CalendarSlotState.GENERATE_FAILED,
      }),
    );
    slotReservation.update.mockResolvedValue(
      reservationRow({ state: CalendarSlotState.SKIPPED }),
    );
    findFirst.mockResolvedValue(cadenceRow());

    const skipped = await service.skip(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.update).toHaveBeenCalledWith({
      data: { state: CalendarSlotState.SKIPPED },
      where: { id: 'reservation-1' },
    });
    expect(skipped.state).toBe(CalendarSlotState.SKIPPED);
  });

  it('rejects generate and write on a skipped slot', async () => {
    slotReservation.findFirst.mockResolvedValue(
      reservationRow({ state: CalendarSlotState.SKIPPED }),
    );

    await expect(
      service.generate(ORG_ID, USER_ID, IDENTITY_KEY),
    ).rejects.toThrow('skipped');
    await expect(service.write(ORG_ID, USER_ID, IDENTITY_KEY)).rejects.toThrow(
      'skipped',
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(articlesService.createArticle).not.toHaveBeenCalled();
  });

  it('records an article generate by reservation link and does not consume an unlinked article', async () => {
    const articleCadence = cadenceRow({ format: PostCategory.ARTICLE });
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(articleCadence);
    slotReservation.create.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
      }),
    );
    slotReservation.update.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        generatedItemId: 'article-1',
        generatedItemType: CalendarSlotItemType.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
        state: CalendarSlotState.FILLED,
      }),
    );
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {},
      description: 'Open-source AI OS',
      label: 'Genfeed',
      text: null,
    });
    modelsService.findOne.mockResolvedValue({ minCost: 1 });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'A linked essay about the slot.' } }],
    });
    articlesService.createArticle.mockResolvedValue({ id: 'article-1' });

    const result = await service.generate(
      ORG_ID,
      USER_ID,
      ARTICLE_IDENTITY_KEY,
    );

    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(articlesService.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'A linked essay about the slot.',
      }),
      USER_ID,
      ORG_ID,
      BRAND_ID,
    );
    expect(slotReservation.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatedItemId: 'article-1',
        generatedItemType: CalendarSlotItemType.ARTICLE,
        state: CalendarSlotState.FILLED,
      }),
      where: { id: 'reservation-1' },
    });
    expect(result.articleId).toBe('article-1');
    expect(result.releaseId).toBeUndefined();
    expect(result.targetId).toBe('article-1');

    findMany.mockResolvedValue([articleCadence]);
    slotReservation.findMany.mockResolvedValue([
      reservationRow({
        format: PostCategory.ARTICLE,
        generatedItemId: 'article-1',
        generatedItemType: CalendarSlotItemType.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
        state: CalendarSlotState.FILLED,
      }),
    ]);
    prisma.article.findMany.mockResolvedValue([
      {
        createdAt: new Date(INSTANT),
        id: 'unlinked-article',
      },
    ]);

    const slots = await service.listSlots(
      ORG_ID,
      BRAND_ID,
      RANGE.startDate,
      RANGE.endDate,
    );
    const noonKey = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.ARTICLE}|2026-08-20T12:00:00.000Z`;

    expect(
      slots.some((slot) => slot.identityKey === ARTICLE_IDENTITY_KEY),
    ).toBe(false);
    expect(slots.some((slot) => slot.identityKey === noonKey)).toBe(true);
  });

  it('writes an article draft without calling the model or charging credits', async () => {
    const articleCadence = cadenceRow({ format: PostCategory.ARTICLE });
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(articleCadence);
    slotReservation.create.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
      }),
    );
    slotReservation.update.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        generatedItemId: 'article-2',
        generatedItemType: CalendarSlotItemType.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
        state: CalendarSlotState.FILLED,
      }),
    );
    articlesService.createArticle.mockResolvedValue({ id: 'article-2' });

    const result = await service.write(ORG_ID, USER_ID, ARTICLE_IDENTITY_KEY);

    expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(articlesService.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Draft',
        label: 'Untitled',
      }),
      USER_ID,
      ORG_ID,
      BRAND_ID,
    );
    expect(result.articleId).toBe('article-2');
    expect(result.releaseId).toBeUndefined();
  });

  it('soft-deletes vanished missing reservations on edit and keeps filled or skipped survivors', async () => {
    const shortened = cadenceRow({
      endsAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    findFirst.mockResolvedValue(cadenceRow());
    cadenceUpdate.mockResolvedValue(shortened);
    slotReservation.findMany.mockResolvedValue([
      reservationRow({
        id: 'missing-later',
        identityKey: `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T16:00:00.000Z`,
        instant: new Date('2026-08-20T16:00:00.000Z'),
        state: CalendarSlotState.MISSING,
      }),
      reservationRow({
        id: 'filled-surviving',
        state: CalendarSlotState.FILLED,
      }),
      reservationRow({
        id: 'skipped-surviving',
        identityKey: `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T08:00:00.000Z`,
        instant: new Date('2026-08-20T08:00:00.000Z'),
        state: CalendarSlotState.SKIPPED,
      }),
    ]);
    slotReservation.updateMany.mockResolvedValue({ count: 1 });

    await service.update(ORG_ID, CADENCE_ID, {
      endsAt: '2026-08-20T12:00:00.000Z',
    });

    expect(cadenceUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        endsAt: new Date('2026-08-20T12:00:00.000Z'),
      }),
      where: { id: CADENCE_ID },
    });
    expect(slotReservation.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: expect.objectContaining({
        cadenceId: CADENCE_ID,
        id: { in: ['missing-later'] },
        isDeleted: false,
        organizationId: ORG_ID,
      }),
    });
  });

  it('archives a deleted cadence so unfilled derived slots disappear', async () => {
    findFirst.mockResolvedValue(cadenceRow());
    cadenceUpdate.mockResolvedValue(
      cadenceRow({
        isDeleted: true,
        status: PostingCadenceStatus.ARCHIVED,
      }),
    );

    const removed = await service.remove(ORG_ID, CADENCE_ID);

    expect(cadenceUpdate).toHaveBeenCalledWith({
      data: {
        isDeleted: true,
        status: PostingCadenceStatus.ARCHIVED,
      },
      where: { id: CADENCE_ID },
    });
    expect(removed.isDeleted).toBe(true);
    expect(removed.status).toBe(PostingCadenceStatus.ARCHIVED);

    findMany.mockResolvedValue([]);
    slotReservation.findMany.mockResolvedValue([
      reservationRow({ state: CalendarSlotState.MISSING }),
    ]);

    const slots = await service.listSlots(
      ORG_ID,
      BRAND_ID,
      RANGE.startDate,
      RANGE.endDate,
    );

    expect(slots).toEqual([]);
  });

  it('reverts a generating reservation to missing on cancel', async () => {
    slotReservation.findFirst.mockResolvedValue(generatingReservation());
    slotReservation.update.mockResolvedValue(
      reservationRow({ state: CalendarSlotState.MISSING }),
    );

    const cancelled = await service.cancel(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatedItemId: null,
        generatedItemType: null,
        lastFailureReason: null,
        state: CalendarSlotState.MISSING,
      }),
      where: { id: 'reservation-1' },
    });
    expect(cancelled.state).toBe(CalendarSlotState.MISSING);
=======
  it('rejects a draft-only API key before generating a scheduled landing', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue({
      ...cadenceRow(),
      generateLanding: 'scheduled',
    });
    slotReservation.create.mockResolvedValue(generatingReservation());
    slotReservation.update.mockResolvedValue({
      ...generatingReservation(),
      state: 'generate-failed',
    });

    await expect(
      service.generate(ORG_ID, USER_ID, IDENTITY_KEY, undefined, {
        isApiKey: true,
        scopes: [ApiKeyScope.POSTS_DRAFT],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
    expect(slotReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'generate-failed' }),
      }),
    );
  });

  it('passes the API-key context into post-group create', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.create.mockResolvedValue(generatingReservation());
    slotReservation.update.mockResolvedValue({
      ...generatingReservation(),
      generatedItemId: 'release-3',
      generatedItemType: 'release',
      state: 'filled',
    });
    postGroupsService.create.mockResolvedValue({
      id: 'release-3',
      targets: [{ id: 'post-3' }],
    });
    const apiKeyContext = {
      isApiKey: true,
      scopes: [ApiKeyScope.POSTS_DRAFT],
    };

    await service.write(ORG_ID, USER_ID, IDENTITY_KEY, apiKeyContext);

    expect(postGroupsService.create).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({ status: ReleaseStatus.DRAFT }),
      IDENTITY_KEY,
      { source: 'calendar-slot' },
      apiKeyContext,
    );
>>>>>>> origin/master
  });
});
