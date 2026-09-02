vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    body: 'Built with Genfeed.',
    brandId: 'brand-1',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    id: 'sig-1',
    isDeleted: false,
    isEnabled: true,
    label: 'X footer',
    organizationId: 'org-1',
    placement: 'append',
    platforms: [CredentialPlatform.TWITTER],
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: 'user-1',
    ...overrides,
  };
}

describe('PostingSignaturesService', () => {
  const postingSignature = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const prisma = { postingSignature };
  let service: PostingSignaturesService;

  beforeEach(() => {
    vi.clearAllMocks();
    postingSignature.create.mockImplementation(async ({ data }) =>
      makeRow({ ...data, id: 'sig-1' }),
    );
    postingSignature.findFirst.mockResolvedValue(makeRow());
    postingSignature.findMany.mockResolvedValue([makeRow()]);
    postingSignature.count.mockResolvedValue(1);
    postingSignature.update.mockImplementation(async ({ data }) =>
      makeRow(data),
    );
    service = new PostingSignaturesService(prisma as unknown as PrismaService);
  });

  it('creates a tenant-scoped signature', async () => {
    const created = await service.createScoped(
      {
        body: 'Built with Genfeed.',
        label: 'X footer',
        platforms: [CredentialPlatform.TWITTER],
      },
      context,
    );

    expect(postingSignature.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          platforms: [CredentialPlatform.TWITTER],
          userId: 'user-1',
        }),
      }),
    );
    expect(created.organizationId).toBe('org-1');
  });

  it('reads through organization + isDeleted scope', async () => {
    await service.findOneScoped('sig-1', context);

    expect(postingSignature.findFirst).toHaveBeenCalledWith({
      where: scopedWhere('org-1', { id: 'sig-1' }),
    });
  });

  it("does not return another organization's signature", async () => {
    postingSignature.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneScoped('sig-1', {
        ...context,
        organizationId: 'org-foreign',
      }),
    ).rejects.toThrow("Posting signature with identifier 'sig-1' not found");
  });

  it('soft-deletes instead of hard-deleting', async () => {
    await service.removeScoped('sig-1', context);

    expect(postingSignature.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: scopedWhere('org-1', { id: 'sig-1' }),
    });
  });
});
