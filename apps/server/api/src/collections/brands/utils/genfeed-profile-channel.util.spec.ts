import {
  createGenfeedProfileChannel,
  syncGenfeedProfileHandle,
} from '@api/collections/brands/utils/genfeed-profile-channel.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

interface ChannelRow {
  brandId: string;
  externalHandle: string;
  externalId: string;
  isConnected: boolean;
  label: string;
  organizationId: string;
  platform: string;
  userId?: string;
}

/** An in-memory credentials table with the partial unique index. */
function createStore() {
  const rows: ChannelRow[] = [];
  const credential = {
    create: async ({ data }: { data: ChannelRow }) => {
      const isTaken = rows.some(
        (row) =>
          row.platform === 'GENFEED' &&
          row.organizationId === data.organizationId &&
          row.brandId === data.brandId,
      );
      if (isTaken) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      rows.push(data);
      return data;
    },
    updateMany: async ({
      data,
      where,
    }: {
      data: Partial<ChannelRow>;
      where: Partial<ChannelRow>;
    }) => {
      const matches = rows.filter(
        (row) =>
          row.brandId === where.brandId &&
          row.organizationId === where.organizationId &&
          row.platform === where.platform,
      );
      for (const row of matches) {
        Object.assign(row, data);
      }
      return { count: matches.length };
    },
  };
  return {
    prisma: { credential } as unknown as Pick<PrismaService, 'credential'>,
    rows,
  };
}

const brand = {
  id: 'brand-1',
  organizationId: 'org-1',
  slug: 'acme',
  userId: 'user-1',
};

describe('createGenfeedProfileChannel', () => {
  it('gives a new brand its connected profile channel', async () => {
    const { prisma, rows } = createStore();

    await createGenfeedProfileChannel(prisma, { error: vi.fn() }, brand);

    expect(rows).toEqual([
      {
        brandId: 'brand-1',
        externalHandle: 'acme',
        externalId: 'brand-1',
        isConnected: true,
        label: 'Genfeed profile',
        organizationId: 'org-1',
        platform: 'GENFEED',
        userId: 'user-1',
      },
    ]);
  });

  it('keeps one channel per brand when it runs twice', async () => {
    const { prisma, rows } = createStore();
    const logger = { error: vi.fn() };

    await createGenfeedProfileChannel(prisma, logger, brand);
    await createGenfeedProfileChannel(prisma, logger, brand);

    expect(rows).toHaveLength(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('syncGenfeedProfileHandle', () => {
  it('moves the channel to the renamed handle', async () => {
    const { prisma, rows } = createStore();
    await createGenfeedProfileChannel(prisma, { error: vi.fn() }, brand);

    await syncGenfeedProfileHandle(prisma, { ...brand, slug: 'acme-studio' });

    expect(rows[0]?.externalHandle).toBe('acme-studio');
  });
});
