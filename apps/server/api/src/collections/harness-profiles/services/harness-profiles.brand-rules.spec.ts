import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface StoredProfile {
  data: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
}

/** A tiny in-memory profile table so saved rules can be read back. */
function createStore(brandOrganizations: Record<string, string>) {
  const rows: StoredProfile[] = [];
  const prisma = {
    brand: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id: string; isDeleted: boolean; organizationId: string };
        }) =>
          brandOrganizations[where.id] === where.organizationId &&
          where.isDeleted === false
            ? { id: where.id }
            : null,
      ),
    },
    profile: {
      create: vi.fn(
        async ({ data }: { data: Omit<StoredProfile, 'id'> }) => {
          const row = { ...data, id: `profile-${rows.length + 1}` };
          rows.push(row);
          return row;
        },
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; organizationId: string } }) =>
          rows.find(
            (row) =>
              row.id === where.id && row.organizationId === where.organizationId,
          ) ?? null,
      ),
      findMany: vi.fn(
        async ({ where }: { where: { organizationId: string } }) =>
          rows.filter((row) => row.organizationId === where.organizationId),
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: { data: Record<string, unknown> };
          where: { id: string };
        }) => {
          const row = rows.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error('missing row');
          row.data = data.data;
          return row;
        },
      ),
    },
  };
  return { prisma: prisma as unknown as PrismaService, rows };
}

describe('HarnessProfilesService.saveAcceptedRules', () => {
  const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  let store: ReturnType<typeof createStore>;
  let service: HarnessProfilesService;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore({ 'brand-1': 'org-1' });
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
    expect(store.rows).toHaveLength(1);
  });

  it('writes nothing when every rule is already saved', async () => {
    await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });
    store.prisma.profile.update = vi.fn();

    const result = await service.saveAcceptedRules({
      brandId: 'brand-1',
      organizationId: 'org-1',
      rules: ['Never use "synergy".'],
    });

    expect(result.added).toEqual([]);
    expect(store.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('refuses a brand that belongs to another organization and saves nothing', async () => {
    await expect(
      service.saveAcceptedRules({
        brandId: 'brand-1',
        organizationId: 'org-2',
        rules: ['Never use "synergy".'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(store.rows).toEqual([]);
  });

  it('keeps the guardrails the brand already had', async () => {
    store.rows.push({
      data: {
        brandId: 'brand-1',
        guardrails: ['Avoid generic AI phrasing'],
        isDefault: true,
        label: 'Content rules',
        profileType: 'harness',
        scope: 'brand',
        status: 'active',
      },
      id: 'profile-existing',
      isDeleted: false,
      organizationId: 'org-1',
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
});
