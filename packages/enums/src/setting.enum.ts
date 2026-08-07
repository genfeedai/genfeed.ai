/**
 * Cadence at which a user receives trend digest notifications. Values match
 * Prisma `TrendNotificationFrequency` exactly.
 *
 * `settings.trendNotificationsFrequency` is a Postgres enum column
 * (`@default(DAILY)`), so these are Prisma labels. The workflow-template
 * vocabulary `TrendNotificationCadence` (`daily` / `hourly` / `weekly`) is a
 * separate, lowercase product vocabulary stored in workflow trigger config —
 * map between them, never merge them.
 *
 * @see packages/prisma/prisma/schema.prisma `enum TrendNotificationFrequency`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const TrendNotificationFrequency = {
  REALTIME: 'REALTIME',
  HOURLY: 'HOURLY',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
} as const;

export type TrendNotificationFrequency =
  (typeof TrendNotificationFrequency)[keyof typeof TrendNotificationFrequency];
