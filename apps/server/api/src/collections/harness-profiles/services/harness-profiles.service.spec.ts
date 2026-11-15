import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ExpertHarnessDraft } from '@api/services/expert-path/utils/expert-harness-draft.util';
import {
  createHarnessProfileStore,
  type StoredHarnessProfile,
} from '@api/shared/testing/harness-profile-store';
import type { IExpertPositioningScore } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

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

function storedProfile(
  overrides: Partial<StoredHarnessProfile> = {},
): StoredHarnessProfile {
  return {
    brandId: 'brand-1',
    content: {},
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    createdById: null,
    currentVersion: 1,
    description: null,
    id: 'profile-1',
    isDefault: true,
    isDeleted: false,
    label: 'Expert voice',
    organizationId: 'org-1',
    scope: 'founder',
    status: 'active',
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('HarnessProfilesService', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  let store: ReturnType<typeof createHarnessProfileStore>;
  let service: HarnessProfilesService;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createHarnessProfileStore({ 'brand-1': 'org-1' });
    service = new HarnessProfilesService(store.prisma, logger);
  });

  it('creates the profile with the scorecard when the brand has none', async () => {
    const profile = await service.upsertPositioningDraftForBrand({
      draft: buildDraft(),
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(store.profiles).toHaveLength(1);
    expect(profile.brandId).toBe('brand-1');
    expect(profile.positioning).toEqual(SCORE);
    expect(profile.thesis.bigDomino).toEqual(['Cash flow is designed']);
    expect(profile.scope).toBe('founder');
  });

  it('keeps operator edits, unions lists, and replaces the interview-owned thesis', async () => {
    store.profiles.push(
      storedProfile({
        content: {
          audience: ['Operators'],
          guardrails: ['Operator guardrail'],
          platforms: ['x'],
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
        label: 'Operator label',
        scope: 'brand',
      }),
    );

    const profile = await service.upsertPositioningDraftForBrand({
      draft: buildDraft(),
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(store.profiles).toHaveLength(1);
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
    store.profiles.push(storedProfile({ content: { positioning: SCORE } }));

    const profile = await service.update(
      'profile-1',
      { label: 'Renamed' },
      'org-1',
    );

    expect(profile.positioning).toEqual(SCORE);
    expect(profile.label).toBe('Renamed');
  });

  it('drops a malformed stored scorecard instead of surfacing it', async () => {
    store.profiles.push(
      storedProfile({
        content: { positioning: { rating: 'unknown', totalScore: 'high' } },
      }),
    );

    const profile = await service.getActiveForBrand('org-1', 'brand-1');

    expect(profile?.positioning).toBeUndefined();
  });

  it('returns the contributing profile id and revision for brief receipts', async () => {
    store.profiles.push(
      storedProfile({
        content: {
          thesis: {
            bigDomino: ['Cash flow is designed'],
            originStory: ['I ran finance at a startup'],
          },
        },
        currentVersion: 4,
      }),
    );

    const resolved = await service.resolveContributionForBrand(
      'org-1',
      'brand-1',
    );

    expect(resolved?.profileId).toBe('profile-1');
    expect(resolved?.profileRevision).toBe(4);
    expect(resolved?.contribution.systemDirectives?.join(' ')).toContain(
      'Big Domino',
    );
    expect(resolved?.contribution.systemDirectives?.join(' ')).toContain(
      'Origin story',
    );
  });

  it("reads only the brand's own profiles in its organization", async () => {
    store.profiles.push(
      storedProfile({ id: 'mine' }),
      storedProfile({ brandId: 'brand-2', id: 'other-brand' }),
      storedProfile({ id: 'other-org', organizationId: 'org-2' }),
      storedProfile({ id: 'deleted', isDeleted: true }),
    );

    const profiles = await service.findForBrand('org-1', 'brand-1');

    expect(profiles.map((profile) => profile.id)).toEqual(['mine']);
  });
});

describe('HarnessProfilesService revisions', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  let store: ReturnType<typeof createHarnessProfileStore>;
  let service: HarnessProfilesService;

  async function createProfile() {
    return service.create(
      {
        brandId: 'brand-1',
        guardrails: ['No hype'],
        label: 'Brand voice',
        scope: 'brand',
      },
      'org-1',
      'user-1',
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    store = createHarnessProfileStore({ 'brand-1': 'org-1' });
    service = new HarnessProfilesService(store.prisma, logger);
  });

  it('records creation as revision 1 with its actor', async () => {
    const profile = await createProfile();

    expect(profile.currentVersion).toBe(1);
    expect(store.revisions).toMatchObject([
      {
        actorUserId: 'user-1',
        harnessProfileId: profile.id,
        source: 'USER_EDIT',
        version: 1,
      },
    ]);
  });

  it('appends one revision per change, naming its source and actor', async () => {
    const profile = await createProfile();

    await service.update(
      profile.id,
      { guardrails: ['No hype', 'No emoji'] },
      'org-1',
      {},
      { actorUserId: 'user-2', source: 'USER_EDIT' },
    );
    const updated = await service.update(
      profile.id,
      { examples: { avoid: ['Buy now!!!'] } },
      'org-1',
      {},
      { actorLabel: 'review-feedback', source: 'REVIEW_FEEDBACK' },
    );

    expect(updated.currentVersion).toBe(3);
    expect(
      store.revisions.map((revision) => [
        revision.version,
        revision.source,
        revision.actorUserId,
        revision.actorLabel,
      ]),
    ).toEqual([
      [1, 'USER_EDIT', 'user-1', null],
      [2, 'USER_EDIT', 'user-2', null],
      [3, 'REVIEW_FEEDBACK', null, 'review-feedback'],
    ]);
  });

  it('lists the history newest first', async () => {
    const profile = await createProfile();
    await service.update(profile.id, { label: 'Renamed' }, 'org-1');

    const history = await service.listRevisions(profile.id, 'org-1');

    expect(history.map((revision) => revision.version)).toEqual([2, 1]);
  });

  it('rolls back to an earlier revision as a new revision that generation reads', async () => {
    const profile = await createProfile();
    await service.update(
      profile.id,
      { guardrails: ['Bad promoted rule'] },
      'org-1',
    );

    const restored = await service.rollback(profile.id, 1, 'org-1', 'user-3');

    expect(restored.currentVersion).toBe(3);
    expect(restored.guardrails).toEqual(['No hype']);
    await expect(
      service.buildContributionForBrand('org-1', 'brand-1'),
    ).resolves.toMatchObject({ guardrails: ['No hype'] });
    expect(store.revisions.at(-1)).toMatchObject({
      actorUserId: 'user-3',
      rolledBackToVersion: 1,
      source: 'ROLLBACK',
      version: 3,
    });
    expect(store.revisions).toHaveLength(3);
  });

  it('refuses to roll back to a revision that does not exist', async () => {
    const profile = await createProfile();

    await expect(
      service.rollback(profile.id, 9, 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.revisions).toHaveLength(1);
  });

  it("refuses another organization's profile for history and rollback", async () => {
    const profile = await createProfile();

    await expect(
      service.listRevisions(profile.id, 'org-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.rollback(profile.id, 1, 'org-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a removal as a revision and hides the profile', async () => {
    const profile = await createProfile();

    await service.remove(profile.id, 'org-1', 'user-1');

    await expect(service.findForBrand('org-1', 'brand-1')).resolves.toEqual([]);
    expect(store.revisions.at(-1)).toMatchObject({
      snapshot: { isDeleted: true },
      version: 2,
    });
  });

  it('records the default switch on the profile that lost the default', async () => {
    const first = await createProfile();
    const second = await service.create(
      { brandId: 'brand-1', isDefault: true, label: 'Second', scope: 'brand' },
      'org-1',
      'user-1',
    );

    const profiles = await service.findForBrand('org-1', 'brand-1');

    expect(profiles.find((p) => p.id === first.id)?.isDefault).toBe(false);
    expect(profiles.find((p) => p.id === second.id)?.isDefault).toBe(true);
    expect(
      store.revisions.filter((r) => r.harnessProfileId === first.id),
    ).toHaveLength(2);
  });
});
