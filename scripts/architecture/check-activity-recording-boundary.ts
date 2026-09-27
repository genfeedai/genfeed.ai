import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

/**
 * One recording API (#5197). A user-facing event is recorded once, as an
 * Activity, through `ActivityRecorderService`; the alert policy derives the
 * notification event, deliveries and bell item in the same transaction. This
 * guard fails on any write that bypasses that API.
 */

const RECORDING_DIRECTORY = 'apps/server/api/src/services/activity-recording/';
const OUTBOX_WRITER =
  'apps/server/api/src/services/activity-recording/notification-outbox.writer.ts';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/server/**/*.ts',
  'packages/**/*.ts',
  'packages/**/*.tsx',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.e2e-spec.ts',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
  '**/scripts/seeds/**',
  '**/*.seed.ts',
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

export type ActivityRecordingRule =
  | 'activity-row-write'
  | 'activities-service-write'
  | 'outbox-write'
  | 'redis-notifications-publish'
  | 'legacy-send-notification';

type RuleDefinition = {
  rule: ActivityRecordingRule;
  /** Files (repo-relative, `/` separated) where the pattern is the API itself. */
  isOwner: (file: string) => boolean;
  message: string;
  pattern: RegExp;
};

const RULES: RuleDefinition[] = [
  {
    rule: 'activities-service-write',
    isOwner: () => false,
    message:
      'record or update activities through ActivityRecorderService, not ActivitiesService',
    pattern:
      /\b(?:activitiesService|activityService)\??\.(?:create|createMany|patch|patchAll)\s*\(/gu,
  },
  {
    rule: 'activity-row-write',
    isOwner: (file) => file.startsWith(RECORDING_DIRECTORY),
    message:
      'create activity rows through ActivityRecorderService (or activity-recording.core in a transaction)',
    pattern:
      /\.activity\.(?:create|createMany|createManyAndReturn|upsert)\s*\(/gu,
  },
  {
    rule: 'legacy-send-notification',
    isOwner: () => false,
    message:
      'notifications are recorded activities; use ActivityRecorderService.record or dispatch',
    pattern: /\bsendNotification\s*\(/gu,
  },
  {
    rule: 'outbox-write',
    isOwner: (file) => file === OUTBOX_WRITER,
    message:
      'write notification events and deliveries only through notification-outbox.writer (via the recording API)',
    pattern:
      /\.(?:notificationEvent|notificationDelivery|notificationInboxItem)\.(?:create|createMany|createManyAndReturn|upsert)\s*\(/gu,
  },
  {
    rule: 'redis-notifications-publish',
    isOwner: () => false,
    message:
      'the Redis `notifications` channel is retired; deliver through outbox channel deliveries',
    pattern: /\.publish\(\s*['"`]notifications['"`]/gu,
  },
];

export type ActivityRecordingAllowance = {
  file: string;
  reason: string;
  rule: ActivityRecordingRule;
};

/**
 * Deliberate exceptions. Each one names the file, the rule it may break and
 * why. Keep this list short; a new entry needs review.
 */
export const ACTIVITY_RECORDING_ALLOWLIST: ActivityRecordingAllowance[] = [
  {
    file: 'apps/server/api/src/collections/activities/controllers/activities.controller.ts',
    reason:
      'The owner toggles the read flag of their own activity; it raises no alert.',
    rule: 'activities-service-write',
  },
];

export type ActivityRecordingViolation = {
  file: string;
  line: number;
  message: string;
  rule: ActivityRecordingRule;
};

export type ActivityRecordingBoundaryOptions = {
  allowlist?: ActivityRecordingAllowance[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

export function checkActivityRecordingBoundary(
  options: ActivityRecordingBoundaryOptions = {},
): ActivityRecordingViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const allowlist = options.allowlist ?? ACTIVITY_RECORDING_ALLOWLIST;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));
  const violations: ActivityRecordingViolation[] = [];

  for (const file of files) {
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    for (const definition of RULES) {
      const { rule } = definition;
      if (definition.isOwner(file)) continue;
      if (
        allowlist.some((entry) => entry.file === file && entry.rule === rule)
      ) {
        continue;
      }
      for (const match of source.matchAll(definition.pattern)) {
        violations.push({
          file,
          line: lineForOffset(source, match.index),
          message: definition.message,
          rule,
        });
      }
    }
  }

  return violations;
}

/** Allowlist entries whose file no longer breaks their rule are stale. */
export function findStaleAllowances(
  options: ActivityRecordingBoundaryOptions = {},
): ActivityRecordingAllowance[] {
  const allowlist = options.allowlist ?? ACTIVITY_RECORDING_ALLOWLIST;
  const unfiltered = checkActivityRecordingBoundary({
    ...options,
    allowlist: [],
  });
  return allowlist.filter(
    (entry) =>
      !unfiltered.some(
        (violation) =>
          violation.file === entry.file && violation.rule === entry.rule,
      ),
  );
}

if (import.meta.main) {
  const violations = checkActivityRecordingBoundary();
  const stale = findStaleAllowances();

  if (violations.length > 0 || stale.length > 0) {
    console.error('Activity recording boundary violations found (#5197):');
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line} [${violation.rule}]: ${violation.message}.`,
      );
    }
    for (const entry of stale) {
      console.error(
        `- ${entry.file} [${entry.rule}]: stale allowlist entry; remove it.`,
      );
    }
    process.exit(1);
  }

  console.log('Activity recording boundary guard passed.');
}
