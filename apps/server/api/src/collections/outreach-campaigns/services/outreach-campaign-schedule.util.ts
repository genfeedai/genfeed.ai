import { OutreachCampaignScheduleDto } from '@api/collections/outreach-campaigns/dto/outreach-campaign-schedule.dto';
import type { CampaignSchedule } from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { CampaignType } from '@genfeedai/enums';
import {
  resolveScheduledBlastDueTime,
  type ScheduledBlastDueTime,
  type ScheduledBlastDueTimeError,
} from '@helpers/formatting/timezone/scheduled-blast-due-time';
import { BadRequestException } from '@nestjs/common';

export const DEFAULT_CAMPAIGN_SCHEDULE_VERSION = 1;

export const OUTREACH_SCHEDULE_ERRORS: Record<
  ScheduledBlastDueTimeError,
  { code: string; message: string }
> = {
  dst_gap: {
    code: 'outreach_schedule.dst_gap',
    message:
      'That local time does not exist in the selected timezone because of a daylight-saving transition.',
  },
  invalid_local_date_time: {
    code: 'outreach_schedule.invalid_local_date_time',
    message: 'Delivery time must be a valid local date and time.',
  },
  invalid_timezone: {
    code: 'outreach_schedule.invalid_timezone',
    message: 'Delivery timezone must be a valid IANA timezone.',
  },
  missing_schedule: {
    code: 'outreach_schedule.missing',
    message: 'Scheduled Blast requires a future delivery time and timezone.',
  },
  not_in_the_future: {
    code: 'outreach_schedule.not_in_the_future',
    message: 'Delivery time must be in the future.',
  },
};

export type PersistedCampaignSchedule = {
  dueAt: string;
  localDateTime: string;
  timezone: string;
  version: number;
};

export function readCampaignScheduleVersion(
  schedule: CampaignSchedule | null | undefined,
): number {
  const version = schedule?.version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : DEFAULT_CAMPAIGN_SCHEDULE_VERSION;
}

export function readCampaignScheduleDueAt(
  schedule: CampaignSchedule | null | undefined,
): Date | null {
  if (typeof schedule?.dueAt !== 'string' || schedule.dueAt.length === 0) {
    return null;
  }

  const dueAt = new Date(schedule.dueAt);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
}

export function isScheduledBlastDueForDispatch(
  campaign: {
    campaignType?: string | null;
    schedule?: CampaignSchedule | null;
  },
  now: Date = new Date(),
): boolean {
  if (campaign.campaignType !== CampaignType.SCHEDULED_BLAST) {
    return true;
  }

  const dueAt = readCampaignScheduleDueAt(campaign.schedule);
  if (!dueAt) {
    return false;
  }

  return dueAt.getTime() <= now.getTime();
}

export function persistScheduledBlastSchedule(
  dueTime: ScheduledBlastDueTime,
  version: number,
): PersistedCampaignSchedule {
  return {
    dueAt: dueTime.dueAt.toISOString(),
    localDateTime: dueTime.localDateTime,
    timezone: dueTime.timezone,
    version,
  };
}

export function requireScheduledBlastSchedule(
  schedule: OutreachCampaignScheduleDto | CampaignSchedule | undefined,
  now: Date = new Date(),
): ScheduledBlastDueTime {
  const localDateTime =
    typeof schedule?.localDateTime === 'string'
      ? schedule.localDateTime
      : undefined;
  const timezone =
    typeof schedule?.timezone === 'string' ? schedule.timezone : undefined;
  const resolved = resolveScheduledBlastDueTime({
    localDateTime,
    now,
    timezone,
  });

  if (!resolved.ok) {
    throw toOutreachScheduleException(resolved.error);
  }

  return resolved.value;
}

export function toOutreachScheduleException(
  error: ScheduledBlastDueTimeError,
): BadRequestException {
  return new BadRequestException(OUTREACH_SCHEDULE_ERRORS[error]);
}
