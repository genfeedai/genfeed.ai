import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { WaitlistService } from '@api/collections/waitlist/services/waitlist.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WaitlistStatus } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = {
  createdAt: Date;
  email: string;
  id: string;
  isDeleted: boolean;
  name: string | null;
  referrerDomain: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  status: string;
  updatedAt: Date;
  useCase: string | null;
  website: string | null;
};

/** One in-memory table that honors the filters and writes the service uses. */
function createFakePrisma() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Partial<Row>): boolean =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof Row] === value,
    );

  const waitlistEntry = {
    count: async ({ where }: { where: Partial<Row> }) =>
      rows.filter((row) => matches(row, where)).length,
    create: async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        createdAt: new Date(),
        email: '',
        id: `entry_${rows.length + 1}`,
        isDeleted: false,
        name: null,
        referrerDomain: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: null,
        status: WaitlistStatus.PENDING,
        updatedAt: new Date(),
        useCase: null,
        website: null,
        ...data,
      };
      rows.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: Partial<Row> }) =>
      rows.find((row) => matches(row, where)) ?? null,
    findMany: async ({
      skip = 0,
      take,
      where,
    }: {
      skip?: number;
      take: number;
      where: Partial<Row>;
    }) => rows.filter((row) => matches(row, where)).slice(skip, skip + take),
    update: async ({
      data,
      where,
    }: {
      data: Partial<Row>;
      where: { id: string };
    }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) {
        throw new Error('row not found');
      }
      Object.assign(row, data);
      return row;
    },
  };

  return { prisma: { waitlistEntry } as unknown as PrismaService, rows };
}

describe('WaitlistService', () => {
  let rows: Row[];
  let service: WaitlistService;

  beforeEach(() => {
    const fake = createFakePrisma();
    rows = fake.rows;
    service = new WaitlistService(fake.prisma, {
      getFeatureSettings: async () => ({ isSignupInviteOnly: true }),
    } as unknown as PlatformSettingsService);
  });

  it('stores a new lead with a lowercase email and trimmed details', async () => {
    await service.join(
      {
        email: '  Creator@Example.COM ',
        name: ' Sam ',
        useCase: 'Short videos',
        website: 'https://example.com',
      },
      'x.com',
    );

    expect(rows).toMatchObject([
      {
        email: 'creator@example.com',
        name: 'Sam',
        referrerDomain: 'x.com',
        status: WaitlistStatus.PENDING,
        useCase: 'Short videos',
        website: 'https://example.com',
      },
    ]);
  });

  it('keeps one entry when the same email joins twice and fills in what was missing', async () => {
    await service.join({ email: 'lead@example.com' });
    await service.join({
      email: 'LEAD@example.com',
      website: 'https://lead.example',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.website).toBe('https://lead.example');
  });

  it('never reopens or edits an entry the operator already decided', async () => {
    await service.join({ email: 'lead@example.com' });
    await service.review('entry_1', 'user_admin', {
      status: WaitlistStatus.REJECTED,
    });

    await service.join({
      email: 'lead@example.com',
      website: 'https://changed.example',
    });

    expect(rows[0]).toMatchObject({
      status: WaitlistStatus.REJECTED,
      website: null,
    });
  });

  it('refuses a throwaway email address', async () => {
    await expect(
      service.join({ email: 'someone@mailinator.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('records who approved an entry and when', async () => {
    await service.join({ email: 'lead@example.com' });

    const entry = await service.review('entry_1', 'user_admin', {
      reviewNote: ' Posts daily ',
      status: WaitlistStatus.APPROVED,
    });

    expect(entry).toMatchObject({
      reviewedByUserId: 'user_admin',
      reviewNote: 'Posts daily',
      status: WaitlistStatus.APPROVED,
    });
    expect(entry.reviewedAt).toBeInstanceOf(Date);
  });

  it('reports an unknown entry as not found', async () => {
    await expect(
      service.review('missing', 'user_admin', {
        status: WaitlistStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only the entries in the requested status', async () => {
    await service.join({ email: 'a@example.com' });
    await service.join({ email: 'b@example.com' });
    await service.review('entry_2', 'user_admin', {
      status: WaitlistStatus.APPROVED,
    });

    const result = await service.list({
      limit: 20,
      page: 1,
      skip: 0,
      status: WaitlistStatus.APPROVED,
    });

    expect(result.docs.map((entry) => entry.email)).toEqual(['b@example.com']);
    expect(result.totalDocs).toBe(1);
  });

  it('reports whether signup is closed', async () => {
    expect(await service.isSignupInviteOnly()).toBe(true);
  });
});
