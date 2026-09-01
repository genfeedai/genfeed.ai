import { MAX_CADENCE_SPAN_DAYS } from '@api-types/contracts/cadence-expansion.contract';
import {
  ApiKeyScope,
  CalendarSlotItemType,
  CalendarSlotState,
  PostCategory,
  PostingCadenceStatus,
  ReleaseStatus,
} from '@genfeedai/enums';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostingCadenceCopyService } from './posting-cadence-copy.service';
import { PostingCadenceValidationService } from './posting-cadence-validation.service';
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

type ReservationRow = {
  brandId: string;
  cadenceId: string;
  credentialId: string;
  format: PostCategory;
  generatedItemId: string | null;
  generatedItemType: CalendarSlotItemType | null;
  id: string;
  identityKey: string;
  instant: Date;
  lastFailureReason: string | null;
  state: CalendarSlotState;
  timezone: string;
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
  overrides: Partial<ReservationRow> = {},
): ReservationRow {
  return { ...baseReservationRow(), ...overrides };
}

function baseReservationRow(): ReservationRow {
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
    state: CalendarSlotState.GENERATING,
    timezone: 'UTC',
  };
}

function generatingReservation() {
  return reservationRow();
}

function missingReservation() {
  return reservationRow({ state: CalendarSlotState.MISSING });
}

type ReservationTestRow = ReservationRow & {
  isDeleted: boolean;
  organizationId: string;
};

type ReservationWhere = {
  id?: string;
  identityKey?: string;
  isDeleted?: boolean;
  organizationId?: string;
  state?: string | { in: string[] };
};

type ReservationUpsertArgs = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: {
    organizationId_identityKey: {
      identityKey: string;
      organizationId: string;
    };
  };
};

type ReservationUpdateManyArgs = {
  data: Record<string, unknown>;
  where: ReservationWhere;
};

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
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

  const installStatefulReservations = (
    initialRows: ReturnType<typeof reservationRow>[] = [],
  ) => {
    const rows = new Map<string, ReservationTestRow>(
      initialRows.map((row) => [
        row.identityKey,
        { ...row, isDeleted: false, organizationId: ORG_ID },
      ]),
    );

    slotReservation.findFirst.mockImplementation(
      async ({ where }: { where: ReservationWhere }) => {
        const row = where.identityKey
          ? rows.get(where.identityKey)
          : [...rows.values()].find((candidate) => candidate.id === where.id);
        if (
          !row ||
          (where.organizationId &&
            row.organizationId !== where.organizationId) ||
          (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted)
        ) {
          return null;
        }
        return { ...row };
      },
    );
    slotReservation.upsert.mockImplementation(
      async ({ create, update, where }: ReservationUpsertArgs) => {
        const identity = where.organizationId_identityKey;
        const existing = rows.get(identity.identityKey);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }

        const created = {
          ...reservationRow({
            ...(create as Partial<ReturnType<typeof baseReservationRow>>),
            id: `reservation-${rows.size + 1}`,
          }),
          isDeleted: false,
          organizationId: identity.organizationId,
        };
        rows.set(identity.identityKey, created);
        return { ...created };
      },
    );
    slotReservation.updateMany.mockImplementation(
      async ({ data, where }: ReservationUpdateManyArgs) => {
        const row = where.identityKey
          ? rows.get(where.identityKey)
          : [...rows.values()].find((candidate) => candidate.id === where.id);
        const stateMatches =
          where.state === undefined ||
          (typeof where.state === 'string'
            ? row?.state === where.state
            : where.state.in.includes(row?.state ?? ''));
        if (
          !row ||
          !stateMatches ||
          (where.organizationId &&
            row.organizationId !== where.organizationId) ||
          (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted)
        ) {
          return { count: 0 };
        }
        Object.assign(row, data);
        return { count: 1 };
      },
    );

    return rows;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.credential.findFirst.mockResolvedValue({
      id: CREDENTIAL_ID,
      platform: 'INSTAGRAM',
    });
    prisma.post.findMany.mockResolvedValue([]);
    prisma.article.findMany.mockResolvedValue([]);
    slotReservation.findMany.mockResolvedValue([]);
    slotReservation.updateMany.mockResolvedValue({ count: 1 });
    const copyService = new PostingCadenceCopyService(
      prisma as never,
      llmDispatcherService as never,
      creditsUtilsService as never,
      modelsService as never,
    );
    const validationService = new PostingCadenceValidationService(
      prisma as never,
    );
    service = new PostingCadencesService(
      prisma as never,
      { error: vi.fn() } as never,
      postGroupsService as never,
      articlesService as never,
      copyService,
      validationService,
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

  it('reports the shared cadence span bound instead of a duplicated value', async () => {
    const startsAt = new Date('2026-08-20T00:00:00.000Z');
    const endsAt = new Date(
      startsAt.getTime() + (MAX_CADENCE_SPAN_DAYS + 1) * 24 * 60 * 60 * 1000,
    );

    await expect(
      service.create(ORG_ID, USER_ID, {
        brandId: BRAND_ID,
        credentialId: CREDENTIAL_ID,
        endsAt: endsAt.toISOString(),
        format: PostCategory.REEL,
        intervalMinutes: 120,
        startsAt: startsAt.toISOString(),
        windowEndMinute: 22 * 60,
        windowStartMinute: 8 * 60,
      }),
    ).rejects.toThrow(
      `cannot be more than ${MAX_CADENCE_SPAN_DAYS} days after start`,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the durable tenant and full-identity unique for concurrent bookings', async () => {
    const rows = installStatefulReservations();
    const dto = {
      brandId: BRAND_ID,
      credentialId: CREDENTIAL_ID,
      format: PostCategory.REEL,
      instant: INSTANT,
      timezone: 'UTC',
    };

    const [first, second] = await Promise.all([
      service.book(ORG_ID, dto),
      service.book(ORG_ID, dto),
    ]);

    expect(rows.size).toBe(1);
    expect(first.identityKey).toBe(IDENTITY_KEY.replace(CADENCE_ID, 'manual'));
    expect(second.identityKey).toBe(first.identityKey);
    for (const call of slotReservation.upsert.mock.calls) {
      expect(call[0].where).toEqual({
        organizationId_identityKey: {
          identityKey: first.identityKey,
          organizationId: ORG_ID,
        },
      });
    }
  });

  it('allows one concurrent fill and rejects fill or skip after the durable claim', async () => {
    const rows = installStatefulReservations();
    findFirst.mockResolvedValue(cadenceRow());
    let finishRelease!: (value: {
      id: string;
      targets: { id: string }[];
    }) => void;
    const release = new Promise<{
      id: string;
      targets: { id: string }[];
    }>((resolve) => {
      finishRelease = resolve;
    });
    postGroupsService.create.mockReturnValue(release);

    const winner = service.write(ORG_ID, USER_ID, IDENTITY_KEY);
    await vi.waitFor(() => {
      expect(postGroupsService.create).toHaveBeenCalledTimes(1);
    });

    await expect(service.write(ORG_ID, USER_ID, IDENTITY_KEY)).rejects.toThrow(
      'already generating',
    );
    await expect(service.skip(ORG_ID, IDENTITY_KEY)).rejects.toThrow(
      'Cancel the in-flight generate',
    );

    finishRelease({ id: 'release-winner', targets: [{ id: 'post-winner' }] });
    await expect(winner).resolves.toMatchObject({
      releaseId: 'release-winner',
    });
    expect(rows.get(IDENTITY_KEY)?.state).toBe(CalendarSlotState.FILLED);
    expect(postGroupsService.create).toHaveBeenCalledTimes(1);
  });

  it('clears stale failure metadata and preserves cancellation against a late fill', async () => {
    const rows = installStatefulReservations([
      reservationRow({
        lastFailureReason: 'The model returned empty copy.',
        state: CalendarSlotState.GENERATE_FAILED,
      }),
    ]);
    findFirst.mockResolvedValue(cadenceRow());
    let finishRelease!: (value: {
      id: string;
      targets: { id: string }[];
    }) => void;
    const release = new Promise<{
      id: string;
      targets: { id: string }[];
    }>((resolve) => {
      finishRelease = resolve;
    });
    postGroupsService.create.mockReturnValue(release);

    const fill = service.write(ORG_ID, USER_ID, IDENTITY_KEY);
    await vi.waitFor(() => {
      expect(postGroupsService.create).toHaveBeenCalledTimes(1);
    });
    expect(rows.get(IDENTITY_KEY)?.lastFailureReason).toBeNull();

    await expect(service.cancel(ORG_ID, IDENTITY_KEY)).resolves.toMatchObject({
      lastFailureReason: null,
      state: CalendarSlotState.MISSING,
    });
    finishRelease({ id: 'release-late', targets: [{ id: 'post-late' }] });

    await expect(fill).rejects.toThrow('cancelled');
    expect(rows.get(IDENTITY_KEY)).toMatchObject({
      generatedItemId: null,
      generatedItemType: null,
      lastFailureReason: null,
      state: CalendarSlotState.MISSING,
    });
  });

  it('hashes the complete slot identity so equal labels and instants cannot collide', async () => {
    installStatefulReservations();
    findFirst.mockResolvedValue(
      cadenceRow({ format: PostCategory.ARTICLE, label: 'Launch story' }),
    );
    articlesService.createArticle
      .mockResolvedValueOnce({ id: 'article-identity-1' })
      .mockResolvedValueOnce({ id: 'article-identity-2' });
    const secondIdentity = `ccadence00002|${CREDENTIAL_ID}|${PostCategory.ARTICLE}|${INSTANT}`;

    await service.write(ORG_ID, USER_ID, ARTICLE_IDENTITY_KEY);
    await service.write(ORG_ID, USER_ID, secondIdentity);

    const slugs = articlesService.createArticle.mock.calls.map(
      ([input]) => input.slug,
    );
    expect(slugs).toHaveLength(2);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs.every((slug) => slug.startsWith('untitled-'))).toBe(true);
  });

  it('writes a draft without calling the model or charging credits', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.upsert.mockResolvedValue(missingReservation());
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
    slotReservation.upsert.mockResolvedValue(missingReservation());
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

  it('persists skip and omits the skipped identity from listSlots', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.upsert.mockResolvedValue(missingReservation());

    const skipped = await service.skip(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ identityKey: IDENTITY_KEY }),
        where: {
          organizationId_identityKey: {
            identityKey: IDENTITY_KEY,
            organizationId: ORG_ID,
          },
        },
      }),
    );
    expect(slotReservation.updateMany).toHaveBeenCalledWith({
      data: { state: CalendarSlotState.SKIPPED },
      where: expect.objectContaining({
        id: 'reservation-1',
        isDeleted: false,
        organizationId: ORG_ID,
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
    findFirst.mockResolvedValue(cadenceRow());

    const skipped = await service.skip(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.updateMany).toHaveBeenCalledWith({
      data: { state: CalendarSlotState.SKIPPED },
      where: expect.objectContaining({
        id: 'reservation-1',
        isDeleted: false,
        organizationId: ORG_ID,
      }),
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
    slotReservation.upsert.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
        state: CalendarSlotState.MISSING,
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
    expect(slotReservation.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatedItemId: 'article-1',
        generatedItemType: CalendarSlotItemType.ARTICLE,
        state: CalendarSlotState.FILLED,
      }),
      where: expect.objectContaining({
        id: 'reservation-1',
        isDeleted: false,
        organizationId: ORG_ID,
        state: CalendarSlotState.GENERATING,
      }),
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
    slotReservation.upsert.mockResolvedValue(
      reservationRow({
        format: PostCategory.ARTICLE,
        identityKey: ARTICLE_IDENTITY_KEY,
        state: CalendarSlotState.MISSING,
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
        generatedItemId: 'release-filled',
        identityKey: `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T18:00:00.000Z`,
        instant: new Date('2026-08-20T18:00:00.000Z'),
        state: CalendarSlotState.FILLED,
      }),
      reservationRow({
        id: 'skipped-surviving',
        identityKey: `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T20:00:00.000Z`,
        instant: new Date('2026-08-20T20:00:00.000Z'),
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
      where: expect.objectContaining({
        id: CADENCE_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      }),
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
      where: expect.objectContaining({
        id: CADENCE_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      }),
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

    const cancelled = await service.cancel(ORG_ID, IDENTITY_KEY);

    expect(slotReservation.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        generatedItemId: null,
        generatedItemType: null,
        lastFailureReason: null,
        state: CalendarSlotState.MISSING,
      }),
      where: expect.objectContaining({
        id: 'reservation-1',
        isDeleted: false,
        organizationId: ORG_ID,
        state: CalendarSlotState.GENERATING,
      }),
    });
    expect(cancelled.state).toBe(CalendarSlotState.MISSING);
  });

  it('rejects a draft-only API key before generating a scheduled landing', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue({
      ...cadenceRow(),
      generateLanding: 'scheduled',
    });
    slotReservation.upsert.mockResolvedValue(missingReservation());

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
    expect(slotReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'generate-failed' }),
      }),
    );
  });

  it('passes the API-key context into post-group create', async () => {
    slotReservation.findFirst.mockResolvedValue(null);
    findFirst.mockResolvedValue(cadenceRow());
    slotReservation.upsert.mockResolvedValue(missingReservation());
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
  });

  it('collapses overlapping cadences onto the oldest cadence', async () => {
    const older = cadenceRow({
      createdAt: new Date('2026-08-18T00:00:00.000Z'),
      id: CADENCE_ID,
    });
    const newer = cadenceRow({
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
      id: 'ccadence00002',
    });
    findMany.mockResolvedValue([newer, older]);

    const slots = await service.listSlots(
      ORG_ID,
      BRAND_ID,
      RANGE.startDate,
      RANGE.endDate,
    );
    const noonSlots = slots.filter(
      (slot) => slot.instant === '2026-08-20T10:00:00.000Z',
    );

    expect(noonSlots).toHaveLength(1);
    expect(noonSlots[0]?.cadenceId).toBe(CADENCE_ID);
    expect(noonSlots[0]?.identityKey).toBe(IDENTITY_KEY);
  });

  it('does not collapse overlapping cadences with a different credential or format', async () => {
    findMany.mockResolvedValue([
      cadenceRow(),
      cadenceRow({
        createdAt: new Date('2026-08-19T01:00:00.000Z'),
        credentialId: 'ccredential02',
        id: 'ccadence00002',
      }),
      cadenceRow({
        createdAt: new Date('2026-08-19T02:00:00.000Z'),
        format: PostCategory.POST,
        id: 'ccadence00003',
      }),
    ]);

    const slots = await service.listSlots(
      ORG_ID,
      BRAND_ID,
      RANGE.startDate,
      RANGE.endDate,
    );
    const noonSlots = slots.filter(
      (slot) => slot.instant === '2026-08-20T10:00:00.000Z',
    );

    expect(noonSlots).toHaveLength(3);
    expect(new Set(noonSlots.map((slot) => slot.cadenceId)).size).toBe(3);
  });

  it('returns the existing item when generate is repeated concurrently', async () => {
    const rows = installStatefulReservations();
    findFirst.mockResolvedValue(cadenceRow());
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
      choices: [{ message: { content: 'Hook: one identity, one item.' } }],
    });
    let finishRelease!: (value: {
      id: string;
      targets: { id: string }[];
    }) => void;
    const release = new Promise<{
      id: string;
      targets: { id: string }[];
    }>((resolve) => {
      finishRelease = resolve;
    });
    postGroupsService.create.mockReturnValue(release);

    const first = service.generate(ORG_ID, USER_ID, IDENTITY_KEY);
    await vi.waitFor(() => {
      expect(postGroupsService.create).toHaveBeenCalledTimes(1);
    });
    await expect(
      service.generate(ORG_ID, USER_ID, IDENTITY_KEY),
    ).rejects.toThrow('already generating');

    finishRelease({ id: 'release-once', targets: [{ id: 'post-once' }] });
    await expect(first).resolves.toMatchObject({
      releaseId: 'release-once',
    });
    postGroupsService.getOne.mockResolvedValue({
      id: 'release-once',
      targets: [{ id: 'post-once' }],
    });
    const replay = await service.generate(ORG_ID, USER_ID, IDENTITY_KEY);
    expect(replay.releaseId).toBe('release-once');
    expect(postGroupsService.create).toHaveBeenCalledTimes(1);
    expect(rows.get(IDENTITY_KEY)?.state).toBe(CalendarSlotState.FILLED);
  });

  it('rejects bulk generate when the confirmed count does not match', async () => {
    await expect(
      service.generateBulk(ORG_ID, USER_ID, [IDENTITY_KEY], 2),
    ).rejects.toThrow('Confirm 1 slots to generate them.');
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('stops bulk generate after credit exhaustion and leaves remaining slots missing', async () => {
    const secondIdentity = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T12:00:00.000Z`;
    const thirdIdentity = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T14:00:00.000Z`;
    const rows = installStatefulReservations();
    findFirst.mockResolvedValue(cadenceRow());
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: {},
      description: 'Open-source AI OS',
      label: 'Genfeed',
      text: null,
    });
    modelsService.findOne.mockResolvedValue({ minCost: 1 });
    creditsUtilsService.checkOrganizationCreditsAvailable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(0);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Hook: first slot filled.' } }],
    });
    postGroupsService.create.mockResolvedValue({
      id: 'release-bulk-1',
      targets: [{ id: 'post-bulk-1' }],
    });

    const result = await service.generateBulk(
      ORG_ID,
      USER_ID,
      [IDENTITY_KEY, secondIdentity, thirdIdentity],
      3,
    );

    expect(result.completedCount).toBe(1);
    expect(result.remainingCount).toBe(2);
    expect(result.isCreditsExhausted).toBe(true);
    expect(result.remainingIdentityKeys).toEqual([
      secondIdentity,
      thirdIdentity,
    ]);
    expect(rows.get(IDENTITY_KEY)?.state).toBe(CalendarSlotState.FILLED);
    expect(rows.get(secondIdentity)?.state).toBe(CalendarSlotState.MISSING);
    expect(rows.get(thirdIdentity)).toBeUndefined();
    expect(postGroupsService.create).toHaveBeenCalledTimes(1);
    expect(result.completed[0]?.identityKey).toBe(IDENTITY_KEY);
  });

  it('stops bulk generate when the request is cancelled', async () => {
    const secondIdentity = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|2026-08-20T12:00:00.000Z`;
    installStatefulReservations();
    findFirst.mockResolvedValue(cadenceRow());
    postGroupsService.create.mockResolvedValue({
      id: 'release-cancel',
      targets: [{ id: 'post-cancel' }],
    });
    const abort = new AbortController();
    abort.abort();

    const result = await service.generateBulk(
      ORG_ID,
      USER_ID,
      [IDENTITY_KEY, secondIdentity],
      2,
      undefined,
      undefined,
      abort.signal,
    );

    expect(result.completedCount).toBe(0);
    expect(result.isCancelled).toBe(true);
    expect(result.remainingIdentityKeys).toEqual([
      IDENTITY_KEY,
      secondIdentity,
    ]);
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });
});
