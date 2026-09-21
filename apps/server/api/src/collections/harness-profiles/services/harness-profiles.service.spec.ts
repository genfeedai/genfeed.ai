import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { ExpertHarnessDraft } from '@api/services/expert-path/utils/expert-harness-draft.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IExpertPositioningScore } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';

const SCORE: IExpertPositioningScore = {
  dimensions: [
    {
      followUpFieldKey: 'bigDomino',
      followUpQuestion: 'Finish this sentence…',
      key: 'bigDomino',
      label: 'Big Domino',
      maxWeightedScore: 20,
      score: 4,
      weight: 2,
      weightedScore: 8,
    },
  ],
  rating: 'needs_work',
  scoredAt: '2026-09-19T00:00:00.000Z',
  totalScore: 61,
  version: 1,
  weakestDimension: 'bigDomino',
};

function buildDraft(
  overrides: Partial<ExpertHarnessDraft> = {},
): ExpertHarnessDraft {
  return {
    audience: ['Bootstrapped founders'],
    brandId: 'brand-1',
    description: 'Generated from the Expert Path interview.',
    guardrails: ['Never invent credentials'],
    isDefault: true,
    label: 'Cash Design expert voice',
    metadata: { source: 'expert-positioning' },
    platforms: ['linkedin'],
    positioning: SCORE,
    scope: 'founder',
    status: 'active',
    thesis: {
      beliefs: ['Cash flow is designed'],
      bigDomino: ['Cash flow is designed'],
      enemies: ['Monthly reports'],
      newOpportunity: ['A weekly cash ritual'],
      notFor: ['VC-backed burn'],
      originStory: ['I ran finance at a startup'],
      proofPoints: ['140 founders'],
      transformation: ['Deciding with the balance'],
    },
    voice: {
      bannedPhrases: ['game-changer'],
      stance: 'First-person practitioner',
      style: 'Short and concrete',
      tone: 'Direct',
      vocabulary: ['ritual'],
    },
    ...overrides,
  };
}

describe('HarnessProfilesService positioning drafts', () => {
  const profileDelegate = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    profile: profileDelegate,
  } as unknown as PrismaService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  let service: HarnessProfilesService;

  beforeEach(() => {
    vi.clearAllMocks();
    profileDelegate.findMany.mockResolvedValue([]);
    profileDelegate.create.mockImplementation(({ data }) =>
      Promise.resolve({
        createdById: data.createdById,
        data: data.data,
        id: 'profile-1',
        isDeleted: false,
        organizationId: data.organizationId,
      }),
    );
    profileDelegate.update.mockImplementation(({ data }) =>
      Promise.resolve({
        data: data.data,
        id: 'profile-1',
        isDeleted: false,
        organizationId: 'org-1',
      }),
    );
    service = new HarnessProfilesService(prisma, logger);
  });

  it('creates the profile with the scorecard when the brand has none', async () => {
    const profile = await service.upsertPositioningDraftForBrand({
      draft: buildDraft(),
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(profileDelegate.create).toHaveBeenCalled();
    expect(profile.positioning).toEqual(SCORE);
    expect(profile.thesis.bigDomino).toEqual(['Cash flow is designed']);
    expect(profile.scope).toBe('founder');
  });

  it('keeps operator edits, unions lists, and replaces the interview-owned thesis', async () => {
    const existing = {
      data: {
        audience: ['Operators'],
        brandId: 'brand-1',
        guardrails: ['Operator guardrail'],
        isDefault: true,
        label: 'Operator label',
        platforms: ['x'],
        profileType: 'harness',
        scope: 'brand',
        status: 'active',
        thesis: {
          beliefs: ['Operator belief'],
          bigDomino: ['Stale domino'],
          proofPoints: ['Operator proof'],
        },
        voice: {
          bannedPhrases: ['operator phrase'],
          stance: 'Operator stance',
          style: 'Operator style',
          tone: 'Operator tone',
          vocabulary: ['operator'],
        },
      },
      id: 'profile-1',
      isDeleted: false,
      organizationId: 'org-1',
    };
    profileDelegate.findMany.mockResolvedValue([existing]);
    profileDelegate.findFirst.mockResolvedValue(existing);

    const profile = await service.upsertPositioningDraftForBrand({
      draft: buildDraft(),
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(profileDelegate.create).not.toHaveBeenCalled();
    // Operator-set scalars win.
    expect(profile.label).toBe('Operator label');
    expect(profile.voice.tone).toBe('Operator tone');
    expect(profile.voice.style).toBe('Operator style');
    expect(profile.voice.stance).toBe('Operator stance');
    // Lists merge.
    expect(profile.audience).toEqual(['Operators', 'Bootstrapped founders']);
    expect(profile.voice.bannedPhrases).toEqual([
      'operator phrase',
      'game-changer',
    ]);
    expect(profile.thesis.beliefs).toEqual([
      'Operator belief',
      'Cash flow is designed',
    ]);
    expect(profile.thesis.proofPoints).toEqual([
      'Operator proof',
      '140 founders',
    ]);
    // Interview-owned keys and the scorecard are replaced.
    expect(profile.thesis.bigDomino).toEqual(['Cash flow is designed']);
    expect(profile.positioning).toEqual(SCORE);
  });

  it('preserves a stored scorecard through an unrelated profile update', async () => {
    profileDelegate.findFirst.mockResolvedValue({
      data: {
        brandId: 'brand-1',
        label: 'Expert voice',
        positioning: SCORE,
        profileType: 'harness',
        scope: 'founder',
        status: 'active',
      },
      id: 'profile-1',
      isDeleted: false,
      organizationId: 'org-1',
    });

    const profile = await service.update(
      'profile-1',
      { label: 'Renamed' },
      'org-1',
    );

    expect(profile.positioning).toEqual(SCORE);
    expect(profile.label).toBe('Renamed');
  });

  it('drops a malformed stored scorecard instead of surfacing it', async () => {
    profileDelegate.findMany.mockResolvedValue([
      {
        data: {
          brandId: 'brand-1',
          label: 'Expert voice',
          positioning: { rating: 'unknown', totalScore: 'high' },
          profileType: 'harness',
          scope: 'founder',
          status: 'active',
        },
        id: 'profile-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    const profile = await service.getActiveForBrand('org-1', 'brand-1');

    expect(profile?.positioning).toBeUndefined();
  });

  it('returns the contributing profile id for brief receipts', async () => {
    profileDelegate.findMany.mockResolvedValue([
      {
        data: {
          brandId: 'brand-1',
          isDefault: true,
          label: 'Expert voice',
          profileType: 'harness',
          scope: 'founder',
          status: 'active',
          thesis: {
            bigDomino: ['Cash flow is designed'],
            originStory: ['I ran finance at a startup'],
          },
        },
        id: 'profile-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    const resolved = await service.resolveContributionForBrand(
      'org-1',
      'brand-1',
    );

    expect(resolved?.profileId).toBe('profile-1');
    expect(resolved?.contribution.systemDirectives?.join(' ')).toContain(
      'Big Domino',
    );
    expect(resolved?.contribution.systemDirectives?.join(' ')).toContain(
      'Origin story',
    );
  });
});
