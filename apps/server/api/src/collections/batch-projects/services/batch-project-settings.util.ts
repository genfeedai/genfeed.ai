import {
  BATCH_IDEA_FORMATS,
  BATCH_IDEA_MAX_COUNT,
  BATCH_IDEA_MIN_COUNT,
} from '@api/collections/batch-projects/dto/generate-batch-ideas.dto';
import type {
  BatchIdeaFormat,
  IBatchProjectIdeaSettings,
  IBatchProjectScheduledTarget,
  IBatchProjectScheduleSettings,
  IBatchProjectScheduleTarget,
  IBatchProjectSettings,
} from '@genfeedai/contracts/interfaces';
import {
  readRecordOrNull,
  readString,
} from '@genfeedai/utils/data/extract.util';

const MAX_ANGLE_LENGTH = 300;
const MAX_SCHEDULE_TARGETS = 10;

export const DEFAULT_IDEA_SETTINGS: IBatchProjectIdeaSettings = {
  count: 6,
  formats: ['image', 'video'],
};

function parseIdeaSettings(
  value: unknown,
): IBatchProjectIdeaSettings | undefined {
  const record = readRecordOrNull(value);
  if (!record) {
    return undefined;
  }
  const formats = Array.isArray(record.formats)
    ? record.formats.filter((format): format is BatchIdeaFormat =>
        (BATCH_IDEA_FORMATS as readonly unknown[]).includes(format),
      )
    : [];
  const count =
    typeof record.count === 'number' && Number.isInteger(record.count)
      ? Math.min(
          BATCH_IDEA_MAX_COUNT,
          Math.max(BATCH_IDEA_MIN_COUNT, record.count),
        )
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
  const record = readRecordOrNull(value);
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
  const record = readRecordOrNull(value);
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
  const record = readRecordOrNull(value) ?? {};
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

const SCHEDULE_BINDING_STATUSES = new Set<string>([
  'failed',
  'pending',
  'scheduled',
]);

/** Parse an item's destination bindings and their outcomes. */
export function parseScheduledTargets(
  value: unknown,
): IBatchProjectScheduledTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): IBatchProjectScheduledTarget[] => {
    const record = readRecordOrNull(entry);
    const credentialId = readString(record?.credentialId);
    const postId = readString(record?.postId);
    const status = readString(record?.status);
    if (!credentialId || !postId || !status) {
      return [];
    }
    if (!SCHEDULE_BINDING_STATUSES.has(status)) {
      return [];
    }
    const scheduledAt = readString(record?.scheduledAt);
    return [
      {
        credentialId,
        postId,
        status: status as IBatchProjectScheduledTarget['status'],
        ...(scheduledAt ? { scheduledAt } : {}),
      },
    ];
  });
}
