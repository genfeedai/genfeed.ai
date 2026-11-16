import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { createHarnessProfileStore } from '@api/shared/testing/harness-profile-store';
import type { LoggerService } from '@libs/logger/logger.service';

describe('HarnessProfilesService.saveAcceptedRules', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  let store: ReturnType<typeof createHarnessProfileStore>;
  let service: HarnessProfilesService;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createHarnessProfileStore({ 'brand-1': 'org-1' });
    service = new HarnessProfilesService(
      store.prisma,
      logger as unknown as LoggerService,
    );
  });

  it('creates the brand harness and shows accepted rules in what generation reads', async () => {
    const result = await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".', 'Prefer "help" over "empower".'],
      userId: 'user-1',
    });

    expect(result.added).toEqual([
      'Never use "synergy".',
      'Prefer "help" over "empower".',
    ]);
    const contribution = await service.buildContributionForBrand(
      'org-1',
      'brand-1',
    );
    expect(contribution?.guardrails).toEqual([
      'Never use "synergy".',
      'Prefer "help" over "empower".',
    ]);
  });

  it('adds to the existing rules and skips one already saved, ignoring case and punctuation', async () => {
    await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });

    const result = await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['never use synergy', 'Never use "leverage".'],
    });

    expect(result.added).toEqual(['Never use "leverage".']);
    expect(result.profile.guardrails).toEqual([
      'Never use "synergy".',
      'Never use "leverage".',
    ]);
    expect(store.profiles).toHaveLength(1);
  });

  it('writes nothing when every rule is already saved', async () => {
    await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });
    const revisionsBefore = store.revisions.length;

    const result = await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });

    expect(result.added).toEqual([]);
    expect(store.revisions).toHaveLength(revisionsBefore);
  });

  it('refuses a brand that belongs to another organization and saves nothing', async () => {
    await expect(
      service.saveAcceptedRules({
        brandId: 'brand-1',
        organizationId: 'org-2',
        rules: ['Never use "synergy".'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(store.profiles).toEqual([]);
  });

  it('keeps the guardrails the brand already had', async () => {
    store.profiles.push({
      brandId: 'brand-1',
      content: { guardrails: ['Avoid generic AI phrasing'] },
      createdAt: new Date(),
      createdById: null,
      currentVersion: 1,
      description: null,
      id: 'profile-existing',
      isDefault: true,
      isDeleted: false,
      label: 'Content rules',
      organizationId: 'org-1',
      scope: 'brand',
      status: 'active',
      updatedAt: new Date(),
    });

    const result = await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });

    expect(result.profile.id).toBe('profile-existing');
    expect(result.profile.guardrails).toEqual([
      'Avoid generic AI phrasing',
      'Never use "synergy".',
    ]);
  });

  it('records the accepted rules as a rule-proposal revision by the user', async () => {
    await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
      userId: 'user-1',
    });

    expect(
      store.revisions.map((revision) => [
        revision.version,
        revision.source,
        revision.actorUserId,
      ]),
    ).toEqual([
      [1, 'RULE_PROPOSAL', 'user-1'],
      [2, 'RULE_PROPOSAL', 'user-1'],
    ]);
  });
});
