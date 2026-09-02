import {
  DEFAULT_CAMPAIGN_SCHEDULE_VERSION,
  isScheduledBlastDueForDispatch,
  persistScheduledBlastSchedule,
  readCampaignScheduleDueAt,
  readCampaignScheduleVersion,
  requireScheduledBlastSchedule,
} from '@api/collections/outreach-campaigns/services/outreach-campaign-schedule.util';
import { CampaignType } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

const FIXED_NOW = new Date('2026-08-24T12:00:00.000Z');

describe('outreach campaign schedule util', () => {
  it('resolves a valid future schedule to a persisted UTC due instant', () => {
    const dueTime = requireScheduledBlastSchedule(
      {
        localDateTime: '2026-08-25T09:00',
        timezone: 'America/New_York',
      },
      FIXED_NOW,
    );

    expect(dueTime.dueAt.toISOString()).toBe('2026-08-25T13:00:00.000Z');
    expect(
      persistScheduledBlastSchedule(dueTime, DEFAULT_CAMPAIGN_SCHEDULE_VERSION),
    ).toEqual({
      dueAt: '2026-08-25T13:00:00.000Z',
      localDateTime: '2026-08-25T09:00',
      timezone: 'America/New_York',
      version: 1,
    });
  });

  it('rejects missing, past, and DST-gap schedules before persistence', () => {
    expect(() => requireScheduledBlastSchedule(undefined, FIXED_NOW)).toThrow(
      BadRequestException,
    );

    try {
      requireScheduledBlastSchedule(
        { localDateTime: '2026-08-24T08:00', timezone: 'America/New_York' },
        FIXED_NOW,
      );
      throw new Error('expected not_in_the_future');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'outreach_schedule.not_in_the_future',
      });
    }

    try {
      requireScheduledBlastSchedule(
        { localDateTime: '2026-03-08T02:30', timezone: 'America/New_York' },
        new Date('2026-03-01T12:00:00.000Z'),
      );
      throw new Error('expected dst_gap');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'outreach_schedule.dst_gap',
      });
    }
  });

  it('treats schedule-less Scheduled Blast campaigns as not due', () => {
    expect(
      isScheduledBlastDueForDispatch(
        { campaignType: CampaignType.SCHEDULED_BLAST },
        FIXED_NOW,
      ),
    ).toBe(false);
    expect(
      isScheduledBlastDueForDispatch(
        {
          campaignType: CampaignType.SCHEDULED_BLAST,
          schedule: { dueAt: '2026-08-25T13:00:00.000Z' },
        },
        FIXED_NOW,
      ),
    ).toBe(false);
    expect(
      isScheduledBlastDueForDispatch(
        {
          campaignType: CampaignType.SCHEDULED_BLAST,
          schedule: { dueAt: '2026-08-24T12:00:00.000Z' },
        },
        FIXED_NOW,
      ),
    ).toBe(true);
    expect(
      isScheduledBlastDueForDispatch(
        { campaignType: CampaignType.MANUAL },
        FIXED_NOW,
      ),
    ).toBe(true);
  });

  it('defaults missing schedule versions to 1', () => {
    expect(readCampaignScheduleVersion(undefined)).toBe(1);
    expect(readCampaignScheduleVersion({ version: 3 })).toBe(3);
    expect(readCampaignScheduleDueAt({ dueAt: 'not-a-date' })).toBeNull();
    expect(
      readCampaignScheduleDueAt({ dueAt: '2026-08-25T13:00:00.000Z' }),
    ).toEqual(new Date('2026-08-25T13:00:00.000Z'));
  });
});
