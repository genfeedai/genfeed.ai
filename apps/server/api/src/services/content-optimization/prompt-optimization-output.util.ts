import {
  buildStructuredResponseFormat,
  toStructuredJsonSchema,
} from '@api/services/integrations/llm/structured-output.util';
import {
  createLenientPromptOptimizationSchema,
  PROMPT_OPTIMIZATION_SCHEMA_NAME,
  promptOptimizationSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

/** Strict JSON schema sent to the model; the parse side stays lenient. */
export const PROMPT_OPTIMIZATION_RESPONSE_FORMAT =
  buildStructuredResponseFormat(
    PROMPT_OPTIMIZATION_SCHEMA_NAME,
    toStructuredJsonSchema(promptOptimizationSchema),
  );

/** Drops blank suggestions per item instead of rejecting the whole result. */
export function createPromptOptimizationOutputSchema(logger: LoggerService) {
  return createLenientPromptOptimizationSchema((dropped) =>
    logger.warn('Dropped invalid prompt optimization suggestions', {
      code: 'prompt_optimization_items_dropped',
      dropped,
      droppedCount: dropped.length,
    }),
  );
}
