import { z } from 'zod';
import { type DroppedItemsHandler, lenientItems } from './lenient-items';

export const promptOptimizationSchema = z.strictObject({
  optimizedPrompt: z.string().trim().min(1),
  reasoning: z.string().trim().min(1),
  suggestions: z.array(z.string().trim().min(1)),
  confidenceScore: z.number().finite().min(0).max(1),
});

const suggestionSchema = z.string().trim().min(1);

/**
 * Same shape as {@link promptOptimizationSchema}, but a blank suggestion is
 * dropped instead of failing the whole optimization.
 */
export function createLenientPromptOptimizationSchema(
  onDropped?: DroppedItemsHandler,
) {
  return z.strictObject({
    optimizedPrompt: z.string().trim().min(1),
    reasoning: z.string().trim().min(1),
    suggestions: lenientItems(suggestionSchema, { onDropped }),
    confidenceScore: z.number().finite().min(0).max(1),
  });
}
export type PromptOptimizationResult = z.infer<typeof promptOptimizationSchema>;
export const PROMPT_OPTIMIZATION_SCHEMA_NAME = 'prompt_optimization';
