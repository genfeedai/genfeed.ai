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

/**
 * Model-selection priority persisted on a user's settings. Values match Prisma
 * `GenerationPriority` exactly.
 *
 * `settings.generationPriority` is a Postgres enum column (`@default(QUALITY)`),
 * so these are Prisma labels. The model router's request vocabulary
 * {@link RouterPriority} (`quality` / `speed` / `cost` / `balanced`) is a
 * separate, lowercase API vocabulary validated by `@IsEnum(RouterPriority)` on
 * the image/video/music DTOs — map between them with
 * `toRouterPriority` / `toGenerationPriority`, never merge them.
 *
 * @see packages/prisma/prisma/schema.prisma `enum GenerationPriority`
 * @see packages/contracts/src/enums/generation-priority.mapper.ts
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const GenerationPriority = {
  QUALITY: 'QUALITY',
  SPEED: 'SPEED',
  COST: 'COST',
  BALANCED: 'BALANCED',
} as const;

export type GenerationPriority =
  (typeof GenerationPriority)[keyof typeof GenerationPriority];
