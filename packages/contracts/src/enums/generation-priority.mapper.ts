/**
 * Two vocabularies for the same idea, on purpose:
 *
 * - `settings.generationPriority` is the Prisma enum column
 *   {@link GenerationPriority} — SCREAMING labels (`QUALITY`, `BALANCED`).
 * - `prioritize` on the image / video / music / select-model DTOs is
 *   {@link RouterPriority} — lowercase, validated by `@IsEnum(RouterPriority)`
 *   and compared as lowercase literals inside `RouterService.scorePriority`.
 *
 * Always map at the boundary where a persisted setting becomes a router
 * request (agent run resolution) or a router value is persisted as a setting.
 * Reading the column straight into `body.prioritize` silently drops the user's
 * preference: `'QUALITY' === 'quality'` is false, so every router branch misses.
 *
 * Both mappers accept either spelling and return `undefined` for unknown input
 * — they never throw and never cast.
 *
 * @see packages/prisma/prisma/schema.prisma `enum GenerationPriority`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
import { RouterPriority } from './router.enum';
import { GenerationPriority } from './setting.enum';

/** Prisma label → router request value. 1:1, both directions total. */
const GENERATION_TO_ROUTER: Readonly<
  Record<GenerationPriority, RouterPriority>
> = {
  [GenerationPriority.QUALITY]: RouterPriority.QUALITY,
  [GenerationPriority.SPEED]: RouterPriority.SPEED,
  [GenerationPriority.COST]: RouterPriority.COST,
  [GenerationPriority.BALANCED]: RouterPriority.BALANCED,
};

const ROUTER_TO_GENERATION: Readonly<
  Record<RouterPriority, GenerationPriority>
> = {
  [RouterPriority.QUALITY]: GenerationPriority.QUALITY,
  [RouterPriority.SPEED]: GenerationPriority.SPEED,
  [RouterPriority.COST]: GenerationPriority.COST,
  [RouterPriority.BALANCED]: GenerationPriority.BALANCED,
};

/**
 * Normalize free text into the persisted {@link GenerationPriority} label.
 * Accepts the Prisma label (`QUALITY`) and the router value (`quality`).
 */
export function toGenerationPriority(
  input: string | null | undefined,
): GenerationPriority | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const candidate = input.trim().toUpperCase();

  return candidate in GENERATION_TO_ROUTER
    ? (candidate as GenerationPriority)
    : undefined;
}

/**
 * Normalize free text into the router request value {@link RouterPriority}.
 * Accepts the Prisma label (`QUALITY`) and the router value (`quality`).
 */
export function toRouterPriority(
  input: string | null | undefined,
): RouterPriority | undefined {
  const generationPriority = toGenerationPriority(input);

  return generationPriority
    ? GENERATION_TO_ROUTER[generationPriority]
    : undefined;
}

/** Map a router request value back to the persisted Prisma label. */
export function fromRouterPriority(value: RouterPriority): GenerationPriority {
  return ROUTER_TO_GENERATION[value];
}

export function isGenerationPriority(
  value: unknown,
): value is GenerationPriority {
  return typeof value === 'string' && value in GENERATION_TO_ROUTER;
}
