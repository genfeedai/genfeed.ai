vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    toPrismaJson: (value: unknown) => value,
  };
});

import { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
import type { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  TargetValidationState,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const target = {
  credentialId: 'cred_x',
  platform: CredentialPlatform.TWITTER,
  signatureIds: ['sig-twitter'],
  targetKey: 'x-primary',
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    description: null,
    id: 'set-1',
    isDeleted: false,
    isEnabled: true,
    label: 'Launch channels',
    organizationId: 'org-1',
    targets: [target],
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: 'user-1',
    ...overrides,
  };
}

describe('PostingSetsService', () => {
  const postingSet = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const credential = {
    findMany: vi.fn(),
  };
  const prisma = {
    credential,
    postingSet,
  };
  const postingSignaturesService = {
    findByIdsScoped: vi.fn(),
  };

  let service: PostingSetsService;

  beforeEach(() => {
    vi.clearAllMocks();
    postingSet.create.mockImplementation(async ({ data }) =>
      makeRow({ ...data, id: 'set-1' }),
    );
    postingSet.findFirst.mockResolvedValue(makeRow());
    postingSet.findMany.mockResolvedValue([makeRow()]);
    postingSet.count.mockResolvedValue(1);
    postingSet.update.mockImplementation(async ({ data }) => makeRow(data));
    credential.findMany.mockResolvedValue([
      {
        id: 'cred_x',
        isConnected: true,
        isDeleted: false,
        platform: 'TWITTER',
      },
    ]);
    postingSignaturesService.findByIdsScoped.mockResolvedValue([
      {
        body: 'Built with Genfeed.',
        brandId: 'brand-1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        id: 'sig-twitter',
        isDeleted: false,
        isEnabled: true,
        label: 'X footer',
        organizationId: 'org-1',
        placement: 'append',
        platforms: [CredentialPlatform.TWITTER],
        updatedAt: new Date('2026-08-19T00:00:00.000Z'),
        userId: 'user-1',
      },
    ]);
    service = new PostingSetsService(
      prisma as unknown as PrismaService,
      postingSignaturesService as unknown as PostingSignaturesService,
    );
  });

  it('creates a tenant-scoped posting set', async () => {
    const created = await service.createScoped(
      {
        label: 'Launch channels',
        targets: [target],
      },
      context,
    );

    expect(postingSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand-1',
          label: 'Launch channels',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
    expect(created.organizationId).toBe('org-1');
    expect(created.validation.state).toBe(TargetValidationState.VALID);
  });

  it('lists and reads through organization + isDeleted scope', async () => {
    await service.findAllScoped(context, { page: 1, limit: 10 } as never);
    await service.findOneScoped('set-1', context);

    expect(postingSet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: scopedWhere('org-1', {}),
      }),
    );
    expect(postingSet.findFirst).toHaveBeenCalledWith({
      where: scopedWhere('org-1', { id: 'set-1' }),
    });
  });

  it("does not return another organization's posting set", async () => {
    postingSet.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneScoped('set-1', {
        ...context,
        organizationId: 'org-foreign',
      }),
    ).rejects.toThrow("Posting set with identifier 'set-1' not found");
  });

  it('soft-deletes instead of hard-deleting', async () => {
    await service.removeScoped('set-1', context);

    expect(postingSet.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: scopedWhere('org-1', { id: 'set-1' }),
    });
  });

  it('degrades a deleted credential without exposing secrets', async () => {
    credential.findMany.mockResolvedValue([
      {
        id: 'cred_x',
        isConnected: true,
        isDeleted: true,
        platform: 'TWITTER',
      },
    ]);

    const postingSetDoc = await service.findOneScoped('set-1', context);

    expect(postingSetDoc.validation.state).toBe(TargetValidationState.INVALID);
    expect(postingSetDoc.validation.targets[0]?.state).toBe('deleted');
    expect(credential.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        isConnected: true,
        isDeleted: true,
        platform: true,
      },
      where: {
        id: { in: ['cred_x'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(JSON.stringify(postingSetDoc)).not.toMatch(
      /oauth|accessToken|refreshToken|tokenSecret/i,
    );
  });

  it('expands through the existing posting-set contract helper', async () => {
    const targets = await service.expandScoped(
      'set-1',
      { scheduledDate: '2026-08-19T10:00:00.000Z', timezone: 'Europe/Malta' },
      context,
    );

    expect(targets).toEqual([
      expect.objectContaining({
        credentialId: 'cred_x',
        platform: CredentialPlatform.TWITTER,
        scheduledDate: '2026-08-19T10:00:00.000Z',
        timezone: 'Europe/Malta',
      }),
    ]);
  });
});
