import { type ZodType, z } from 'zod';

export interface DroppedStructuredItem {
  index: number;
  reasons: string[];
}

export type DroppedItemsHandler = (dropped: DroppedStructuredItem[]) => void;

/**
 * Wraps an array of LLM-produced items so one malformed item no longer fails
 * the whole response. Each item is validated on its own: valid items are kept
 * (after the optional `normalize` step), invalid ones are dropped and reported
 * to `onDropped`. When items were supplied but none survive, the original
 * array is handed to the strict schema so the response fails with the real
 * per-item issues (and gets the repair turn). The emitted JSON schema is the
 * strict item schema.
 */
export function lenientItems<TItem>(
  itemSchema: ZodType<TItem>,
  options: {
    normalize?: (item: unknown) => unknown;
    onDropped?: DroppedItemsHandler;
  } = {},
) {
  return z.preprocess((raw) => {
    if (!Array.isArray(raw)) {
      return raw;
    }

    const kept: unknown[] = [];
    const dropped: DroppedStructuredItem[] = [];

    raw.forEach((item, index) => {
      const candidate = options.normalize ? options.normalize(item) : item;
      const result = itemSchema.safeParse(candidate);
      if (result.success) {
        kept.push(candidate);
        return;
      }
      dropped.push({
        index,
        reasons: result.error.issues.map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join('.') : '<item>'}: ${issue.message}`,
        ),
      });
    });

    if (kept.length === 0 && raw.length > 0) {
      return raw;
    }
    if (dropped.length > 0) {
      options.onDropped?.(dropped);
    }
    return kept;
  }, z.array(itemSchema));
}
