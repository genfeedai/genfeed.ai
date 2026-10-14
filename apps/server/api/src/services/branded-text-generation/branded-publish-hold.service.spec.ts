import {
  BrandedPublishHoldException,
  BrandedPublishHoldService,
} from '@api/services/branded-text-generation/branded-publish-hold.service';
import { describe, expect, it, vi } from 'vitest';

function makeService(input: {
  hasApprovedKit?: boolean;
  post?: { brandId: string } | null;
  receipt?: { id: string; mode: string; state: string } | null;
  receipts?: { id: string; mode: string; state: string }[];
}) {
  const prisma = {
    brandOsRevision: {
      findFirst: vi
        .fn()
        .mockResolvedValue(input.hasApprovedKit ? { id: 'rev-1' } : null),
    },
    brandedGenerationReceipt: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          input.receipts ?? (input.receipt ? [input.receipt] : []),
        ),
    },
    post: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.post === undefined ? { brandId: 'brand-1' } : input.post,
        ),
    },
  };
  return { prisma, service: new BrandedPublishHoldService(prisma as never) };
}

const scope = { organizationId: 'org-1', postId: 'post-1' };

describe('BrandedPublishHoldService', () => {
  it('scopes the receipt lookup to the tenant, the brand and the bound post', async () => {
    const { prisma, service } = makeService({
      receipt: { id: 'r-1', mode: 'approved_brand', state: 'ready' },
    });

    await service.findHold('org-1', 'post-1');

    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'post-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(prisma.brandedGenerationReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          mode: { not: 'raw' },
          organizationId: 'org-1',
          projection: { equals: 'post-1', path: ['artifact', 'id'] },
          state: { not: 'ready' },
        },
      }),
    );
  });

  it('does not hold a post without a receipt or a missing post', async () => {
    expect(
      await makeService({}).service.findHold('org-1', 'post-1'),
    ).toBeNull();
    expect(
      await makeService({ post: null }).service.findHold('org-1', 'post-1'),
    ).toBeNull();
  });

  it('does not hold a cleared receipt or a raw post a member chose', async () => {
    expect(
      await makeService({
        receipt: { id: 'r-1', mode: 'approved_brand', state: 'ready' },
      }).service.findHold('org-1', 'post-1'),
    ).toBeNull();
    expect(
      await makeService({
        receipt: { id: 'r-2', mode: 'raw', state: 'needs_review' },
      }).service.findHold('org-1', 'post-1'),
    ).toBeNull();
  });

  it('holds an approved-brand receipt that needs review', async () => {
    const { service } = makeService({
      receipt: { id: 'r-1', mode: 'approved_brand', state: 'needs_review' },
    });

    expect(await service.findHold('org-1', 'post-1')).toEqual({
      brandId: 'brand-1',
      reason: 'needs_review',
      receiptId: 'r-1',
    });
  });

  it('holds a provisional receipt until the brand has an approved kit', async () => {
    const receipt = {
      id: 'r-1',
      mode: 'provisional_brand',
      state: 'needs_review',
    };

    expect(
      await makeService({ receipt }).service.findHold('org-1', 'post-1'),
    ).toEqual({
      brandId: 'brand-1',
      reason: 'provisional_brand',
      receiptId: 'r-1',
    });
    const { prisma, service } = makeService({ hasApprovedKit: true, receipt });
    expect(await service.findHold('org-1', 'post-1')).toBeNull();
    expect(prisma.brandOsRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'APPROVED',
        }),
      }),
    );
  });

  it('looks up copied text by the hash of its exact bytes within the tenant and brand', async () => {
    const { prisma, service } = makeService({});

    await service.findHoldForText('org-1', 'brand-1', 'Hello');

    expect(prisma.brandedGenerationReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          projection: {
            equals: expect.stringMatching(/^sha256:/),
            path: ['artifact', 'version'],
          },
        },
      }),
    );
  });

  it('does not hold text that any receipt cleared', async () => {
    const { service } = makeService({
      receipts: [
        { id: 'r-2', mode: 'provisional_brand', state: 'needs_review' },
        { id: 'r-1', mode: 'approved_brand', state: 'ready' },
      ],
    });

    expect(
      await service.findHoldForText('org-1', 'brand-1', 'Hello'),
    ).toBeNull();
  });

  it('holds text only an uncleared receipt produced, citing the newest receipt', async () => {
    const { service } = makeService({
      receipts: [
        { id: 'r-2', mode: 'approved_brand', state: 'needs_review' },
        { id: 'r-1', mode: 'provisional_brand', state: 'needs_review' },
      ],
    });

    expect(await service.findHoldForText('org-1', 'brand-1', 'Hello')).toEqual({
      brandId: 'brand-1',
      reason: 'needs_review',
      receiptId: 'r-2',
    });
  });

  it('vetoes an unattended approval with a visible reason and the receipt id', async () => {
    const { service } = makeService({
      receipt: { id: 'r-1', mode: 'provisional_brand', state: 'needs_review' },
    });

    const error = await service
      .assertPostPublishable({ ...scope, isHumanApproval: false })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BrandedPublishHoldException);
    expect(error).toMatchObject({
      reason: 'provisional_brand',
      receiptId: 'r-1',
    });
    expect(
      JSON.stringify((error as BrandedPublishHoldException).getResponse()),
    ).toContain('branded_receipt_held');
    expect(String((error as BrandedPublishHoldException).message)).toBeTruthy();
  });

  it('lets a human approval through without reading the receipt', async () => {
    const { prisma, service } = makeService({
      receipt: { id: 'r-1', mode: 'provisional_brand', state: 'needs_review' },
    });

    await expect(
      service.assertPostPublishable({ ...scope, isHumanApproval: true }),
    ).resolves.toBeUndefined();
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });
});
