import { getActionOriginContext } from '@api/action-origin/action-origin.context';
import { IngredientOrigin } from '@genfeedai/contracts';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
  parseGenerationEntry,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import type { Ingredient } from '@genfeedai/prisma';

function withoutEntry(value: unknown): Record<string, unknown> {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const { generationEntry: _entry, ...rest } = record;
  return rest;
}

/** Overwrite caller hints with this invocation's captured entry at creation only. */
export function stampIngredientGenerationEntry(
  origin: IngredientOrigin,
  providerData: unknown,
): Record<string, unknown> | undefined {
  if (origin !== IngredientOrigin.GENERATED && providerData === undefined)
    return undefined;
  const data = withoutEntry(providerData);
  if (origin !== IngredientOrigin.GENERATED) return data;
  return {
    ...data,
    generationEntry: parseGenerationEntry(
      getActionOriginContext().generationEntry,
    ) ?? {
      channel: GenerationEntryChannel.UNKNOWN,
      attribution: GenerationEntryAttribution.UNKNOWN,
    },
  };
}

/** Completion/edits preserve the original entry, never today's patch context. */
export function preserveIngredientGenerationEntry(
  replacement: unknown,
  current: unknown,
): Record<string, unknown> {
  const data = withoutEntry(replacement);
  const original =
    current && typeof current === 'object' && !Array.isArray(current)
      ? parseGenerationEntry(
          (current as Record<string, unknown>).generationEntry,
        )
      : undefined;
  return original ? { ...data, generationEntry: original } : data;
}

/** Per-asset writes only when replacing metadata; ordinary bulk writes stay grouped. */
export function ingredientGenerationUpdateTargets(
  rows: readonly Pick<Ingredient, 'id' | 'organizationId' | 'providerData'>[],
  replacesProviderData: boolean,
  isTenantRequest: boolean,
) {
  const targets = rows
    .filter((row) => !isTenantRequest || row.organizationId != null)
    .map((row) => ({
      organizationId: row.organizationId ?? null,
      id: replacesProviderData ? row.id : undefined,
      providerData: replacesProviderData ? row.providerData : undefined,
    }));
  return replacesProviderData
    ? targets
    : [
        ...new Map(
          targets.map((target) => [target.organizationId, target]),
        ).values(),
      ];
}
