import {
  FASTLANE_FORMATS,
  FASTLANE_MAX_IDEAS,
  FASTLANE_MIN_IDEAS,
} from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import type {
  FastlaneFormat,
  IBatchProjectIdeaSettings,
  IBatchProjectScheduleSettings,
  IBatchProjectScheduleTarget,
  IBatchProjectSettings,
} from '@genfeedai/contracts/interfaces';

const MAX_ANGLE_LENGTH = 300;
const MAX_SCHEDULE_TARGETS = 10;

export const DEFAULT_IDEA_SETTINGS: IBatchProjectIdeaSettings = {
  count: 6,
  formats: ['image', 'video'],
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseIdeaSettings(
  value: unknown,
): IBatchProjectIdeaSettings | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  const formats = Array.isArray(record.formats)
    ? record.formats.filter((format): format is FastlaneFormat =>
        (FASTLANE_FORMATS as readonly unknown[]).includes(format),
      )
    : [];
  const count =
    typeof record.count === 'number' && Number.isInteger(record.count)
      ? Math.min(FASTLANE_MAX_IDEAS, Math.max(FASTLANE_MIN_IDEAS, record.count))
      : DEFAULT_IDEA_SETTINGS.count;
  const angle = readString(record.angle)?.slice(0, MAX_ANGLE_LENGTH);
  return {
    count,
    formats: formats.length > 0 ? [...new Set(formats)] : [],
    ...(angle ? { angle } : {}),
  };
}

function parseScheduleTarget(
  value: unknown,
): IBatchProjectScheduleTarget | null {
  const record = readRecord(value);
  const credentialId = readString(record?.credentialId);
  const platform = readString(record?.platform)?.toLowerCase();
  if (!record || !credentialId || !platform) {
    return null;
  }
  const scheduledDate = readString(record.scheduledDate);
  const isValidDate =
    scheduledDate !== undefined && !Number.isNaN(Date.parse(scheduledDate));
  return {
    credentialId,
    isSelected: record.isSelected !== false,
    platform,
    ...(isValidDate ? { scheduledDate } : {}),
  };
}

function parseScheduleSettings(
  value: unknown,
): IBatchProjectScheduleSettings | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  const targets = Array.isArray(record.targets)
    ? record.targets.slice(0, MAX_SCHEDULE_TARGETS).flatMap((target) => {
        const parsed = parseScheduleTarget(target);
        return parsed ? [parsed] : [];
      })
    : [];
  const postingSetId = readString(record.postingSetId);
  const timezone = readString(record.timezone);
  return {
    targets,
    ...(postingSetId ? { postingSetId } : {}),
    ...(timezone ? { timezone } : {}),
  };
}

/**
 * Parse stored or requested settings into their contract shape. Unknown keys
 * and malformed sections are dropped rather than persisted.
 */
export function parseBatchProjectSettings(
  value: unknown,
): IBatchProjectSettings {
  const record = readRecord(value) ?? {};
  const ideas = parseIdeaSettings(record.ideas);
  const schedule = parseScheduleSettings(record.schedule);
  return {
    ...(ideas ? { ideas } : {}),
    ...(schedule ? { schedule } : {}),
  };
}

/** Each section present in `update` replaces that section of `current`. */
export function mergeBatchProjectSettings(
  current: unknown,
  update: unknown,
): IBatchProjectSettings {
  return {
    ...parseBatchProjectSettings(current),
    ...parseBatchProjectSettings(update),
  };
}
