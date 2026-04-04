import {
  getActivityLabel,
  getActivityResultType,
} from '@api/helpers/utils/activity-label/activity-label.util';
import { ActivityKey } from '@genfeedai/enums';

export interface CompletionValueParams {
  activityKey: ActivityKey;
  ingredientId: string;
  existingValue?: Record<string, unknown>;
}

export interface FailureValueParams {
  activityKey: ActivityKey;
  ingredientId: string;
  errorMessage?: string;
  existingValue?: Record<string, unknown>;
}

/**
 * Builds a JSON-stringified activity value for successful completions.
 * Replaces 5+ inline JSON.stringify calls in webhooks.service.ts.
 */
export function buildCompletionValue(params: CompletionValueParams): string {
  const { activityKey, ingredientId, existingValue = {} } = params;

  return JSON.stringify({
    ...existingValue,
    ingredientId,
    label: getActivityLabel(activityKey),
    progress: 100,
    resultId: ingredientId,
    resultType: getActivityResultType(activityKey),
    type: existingValue.type || 'generation',
  });
}

/**
 * Builds a JSON-stringified activity value for failed generations.
 * Replaces inline failure value construction in webhooks.service.ts.
 */
export function buildFailureValue(params: FailureValueParams): string {
  const {
    activityKey,
    ingredientId,
    errorMessage = 'Generation failed',
    existingValue = {},
  } = params;

  return JSON.stringify({
    ...existingValue,
    error: errorMessage,
    ingredientId,
    label: getActivityLabel(activityKey),
    type: existingValue.type || 'generation',
  });
}

/**
 * Safely parses an activity value that may be JSON string or object.
 * Replaces repeated try/catch JSON.parse blocks in webhooks.service.ts.
 */
export function parseActivityValue(
  value: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
