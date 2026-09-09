import { EmailPerformanceReportService } from '@api/services/email-performance/email-performance-report.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('EmailPerformanceReportService', () => {
  const groupBy = vi.fn();
  const transaction = vi.fn((queries: Promise<unknown>[]) =>
    Promise.all(queries),
  );
  let service: EmailPerformanceReportService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EmailPerformanceReportService,
        {
          provide: PrismaService,
          useValue: { emailMessage: { groupBy }, $transaction: transaction },
        },
      ],
    }).compile();
    service = module.get(EmailPerformanceReportService);
  });

  it.each([
    { from: 'invalid', to: '2026-09-01' },
    { from: '2026-09-02', to: '2026-09-01' },
    { from: '2026-09-01', to: '2026-09-01' },
    { from: '2026-01-01', to: '2026-09-01' },
  ])(
    'rejects invalid or unbounded periods before querying: %j',
    async (query) => {
      await expect(service.getReport(query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(groupBy).not.toHaveBeenCalled();
    },
  );

  it('reports unique messages in the requested cohort and counts converted messages once', async () => {
    groupBy
      .mockResolvedValueOnce([
        {
          templateKey: 'welcome-day-0',
          _count: {
            _all: 10,
            acceptedAt: 9,
            deliveredAt: 8,
            bouncedAt: 1,
            complainedAt: 0,
            openedAt: 7,
            clickedAt: 4,
          },
        },
        {
          templateKey: 'weekly-recap',
          _count: {
            _all: 2,
            acceptedAt: 2,
            deliveredAt: 2,
            bouncedAt: 0,
            complainedAt: 0,
            openedAt: 1,
            clickedAt: 0,
          },
        },
      ])
      .mockResolvedValueOnce([
        { templateKey: 'welcome-day-0', _count: { _all: 2 } },
      ]);
    const report = await service.getReport({
      from: '2026-08-01',
      to: '2026-09-01',
    });
    expect(report.rows).toEqual([
      {
        templateKey: 'welcome-day-0',
        queued: 10,
        accepted: 9,
        delivered: 8,
        bounced: 1,
        complained: 0,
        opened: 7,
        clicked: 4,
        converted: 2,
      },
      {
        templateKey: 'weekly-recap',
        queued: 2,
        accepted: 2,
        delivered: 2,
        bounced: 0,
        complained: 0,
        opened: 1,
        clicked: 0,
        converted: 0,
      },
    ]);
    expect(groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-08-01'),
            lt: new Date('2026-09-01'),
          },
          isDeleted: false,
        },
      }),
    );
    expect(groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          conversions: {
            some: { isDeleted: false, occurredAt: { lte: expect.any(Date) } },
          },
        }),
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('returns an empty report when the cohort has no tracked messages', async () => {
    groupBy.mockResolvedValue([]);
    await expect(service.getReport({})).resolves.toMatchObject({ rows: [] });
  });
});
