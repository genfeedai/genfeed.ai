import {
  Platform,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';

const PLATFORM_VALUES = new Set<string>(Object.values(Platform));
const POST_STATUS_VALUES = new Set<string>(Object.values(PostStatus));
const POST_VISIBILITY_VALUES = new Set<string>(Object.values(PostVisibility));
const TARGET_EXECUTION_STATE_VALUES = new Set<string>(
  Object.values(TargetExecutionState),
);

export function isPlatform(value: string): value is Platform {
  return PLATFORM_VALUES.has(value);
}

export function toPostVisibility(value: unknown): PostVisibility | undefined {
  return typeof value === 'string' && POST_VISIBILITY_VALUES.has(value)
    ? (value as PostVisibility)
    : undefined;
}

export function toTargetExecutionState(
  value: unknown,
): TargetExecutionState | undefined {
  return typeof value === 'string' && TARGET_EXECUTION_STATE_VALUES.has(value)
    ? (value as TargetExecutionState)
    : undefined;
}

export function toPlatform(value: unknown): Platform | undefined {
  return typeof value === 'string' && isPlatform(value) ? value : undefined;
}

export function toPostStatus(value: unknown): PostStatus | undefined {
  return typeof value === 'string' && POST_STATUS_VALUES.has(value)
    ? (value as PostStatus)
    : undefined;
}
