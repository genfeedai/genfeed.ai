import { TrendRefreshHealthService } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';

const receipt = (
  outcome: TrendRefreshHealth['outcome'],
  time: string,
): TrendRefreshHealth => ({
  completedAt: time,
  dataset: 'trends',
  lastAttemptAt: time,
  lastSuccessfulRefreshAt: outcome.endsWith('failed') ? null : time,
  outcome,
  platform: 'youtube',
  reason: outcome.endsWith('failed') ? 'native_failed' : null,
  scope: 'global',
});

describe('TrendRefreshHealthService', () => {
  it('persists an empty refresh, carries its success through failure, and returns sanitized cache-only evidence', async () => {
    const empty = receipt('native_empty', '2026-09-29T12:15:00.000Z');
    const failed = receipt('native_failed', '2026-09-30T00:15:00.000Z');
    const journal = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    };
    const service = new TrendRefreshHealthService({
      notificationEvent: journal,
    } as never);
    await service.record(null, [empty]);
    expect(journal.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        organizationId: null,
        payload: empty,
        sourceType: 'trend_refresh_health',
      }),
    });
    journal.findFirst.mockResolvedValue({ payload: empty });
    await service.record(null, [failed]);
    expect(journal.create.mock.calls.at(-1)?.[0].data.payload).toEqual({
      ...failed,
      lastSuccessfulRefreshAt: empty.completedAt,
    });
    journal.findFirst.mockImplementation(
      (input: { where: { OR?: unknown; sourceId: string } }) =>
        Promise.resolve(
          input.where.sourceId === 'refresh-health:youtube:trends'
            ? {
                payload: input.where.OR
                  ? empty
                  : { ...failed, reason: 'secret raw provider error' },
              }
            : null,
        ),
    );
    journal.create.mockClear();
    const health = await service.getHealth({ platform: 'youtube' });
    expect(health).toEqual([
      { ...failed, lastSuccessfulRefreshAt: empty.completedAt, reason: null },
    ]);
    expect(journal.create).not.toHaveBeenCalled();
  });

  it('keeps successful concurrent evidence even when a later failure receipt could not carry it forward', async () => {
    const success = receipt('native_available', '2026-09-29T12:15:00.000Z');
    const failed = receipt('native_failed', '2026-09-30T00:15:00.000Z');
    const journal = {
      findFirst: vi
        .fn()
        .mockImplementation(
          (input: { where: { OR?: unknown; sourceId: string } }) =>
            Promise.resolve(
              input.where.sourceId === 'refresh-health:youtube:trends'
                ? { payload: input.where.OR ? success : failed }
                : null,
            ),
        ),
    };
    const service = new TrendRefreshHealthService({
      notificationEvent: journal,
    } as never);
    expect(
      (await service.getHealth({ platform: 'youtube' }))[0]
        ?.lastSuccessfulRefreshAt,
    ).toBe(success.completedAt);
  });

  it('restricts receipts to the public corpus and current tenant and excludes deleted evidence', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TrendRefreshHealthService({
      notificationEvent: { findFirst },
    } as never);
    expect(
      await service.getHealth({ organizationId: 'org-a', platform: 'youtube' }),
    ).toEqual([]);
    expect(
      new Set(
        findFirst.mock.calls.map(([input]) => input.where.organizationId),
      ),
    ).toEqual(new Set([null, 'org-a']));
    for (const [input] of findFirst.mock.calls)
      expect(input.where).toMatchObject({
        isDeleted: false,
        sourceType: 'trend_refresh_health',
      });
  });
});
