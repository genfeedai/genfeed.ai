import { PostGroupsQueryDto } from '@api/collections/post-groups/dto/post-groups-query.dto';
import { ReleaseStatus } from '@genfeedai/enums';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('PostGroupsQueryDto', () => {
  it('accepts a bounded ISO window and normalizes one status to an array', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate: '2026-07-27T00:00:00.000Z',
      startDate: '2026-07-20T00:00:00.000Z',
      status: ReleaseStatus.SCHEDULED,
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.status).toEqual([ReleaseStatus.SCHEDULED]);
  });

  it('preserves repeated valid status filters', async () => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate: '2026-07-27T00:00:00.000Z',
      startDate: '2026-07-20T00:00:00.000Z',
      status: [ReleaseStatus.SCHEDULED, ReleaseStatus.FAILED],
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.status).toEqual([
      ReleaseStatus.SCHEDULED,
      ReleaseStatus.FAILED,
    ]);
  });

  it.each([
    {
      endDate: undefined,
      name: 'a missing end date',
      startDate: '2026-07-20T00:00:00.000Z',
    },
    {
      endDate: '2026-07-19T00:00:00.000Z',
      name: 'an inverted range',
      startDate: '2026-07-20T00:00:00.000Z',
    },
    {
      endDate: '2027-07-22T00:00:00.000Z',
      name: 'a range longer than 366 days',
      startDate: '2026-07-20T00:00:00.000Z',
    },
  ])('rejects $name', async ({ endDate, startDate }) => {
    const query = plainToInstance(PostGroupsQueryDto, {
      endDate,
      startDate,
    });

    await expect(validate(query)).resolves.not.toEqual([]);
  });

  it.each([
    {
      name: 'a malformed start date',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: 'not-a-date',
      },
    },
    {
      name: 'an unknown release status',
      value: {
        endDate: '2026-07-27T00:00:00.000Z',
        startDate: '2026-07-20T00:00:00.000Z',
        status: 'unknown',
      },
    },
  ])('rejects $name', async ({ value }) => {
    const query = plainToInstance(PostGroupsQueryDto, value);

    await expect(validate(query)).resolves.not.toEqual([]);
  });
});
