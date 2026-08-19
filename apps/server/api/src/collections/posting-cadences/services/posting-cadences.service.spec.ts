import { PostCategory, ReleaseStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostingCadencesService } from './posting-cadences.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const BRAND_ID = 'cbrand0000001';
const CREDENTIAL_ID = 'ccredential01';
const CADENCE_ID = 'ccadence00001';
const INSTANT = '2026-08-20T10:00:00.000Z';
const IDENTITY_KEY = `${CADENCE_ID}|${CREDENTIAL_ID}|${PostCategory.REEL}|${INSTANT}`;

function cadenceRow() {
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

function generatingReservation() {
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

describe('PostingCadencesService', () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const postGroupsService = { create: vi.fn(), getOne: vi.fn() };
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
  };
  const prisma = {
    brand: { findFirst: vi.fn() },
    credential: {
      findFirst: vi.fn().mockResolvedValue({
        id: CREDENTIAL_ID,
        platform: 'INSTAGRAM',
      }),
    },
    post: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    postingCadence: { create, findFirst, findMany },
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
    slotReservation.findMany.mockResolvedValue([]);
    service = new PostingCadencesService(
      prisma as never,
      { error: vi.fn() } as never,
      postGroupsService as never,
      llmDispatcherService as never,
      creditsUtilsService as never,
      modelsService as never,
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
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalled();
    expect(result.releaseId).toBe('release-2');
  });
});
