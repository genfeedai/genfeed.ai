import { createHash } from 'node:crypto';
import { stableStringify } from '@genfeedai/contracts/constants/canonical-json.constant';

export interface MutationApprovalScope {
  brandId?: string;
  contextVersion: number;
}

export function buildLogicalWriteKey(input: {
  arguments: Record<string, unknown>;
  organizationId: string;
  threadId?: string;
  scope?: MutationApprovalScope;
  toolName: string;
  userId: string;
}): string {
  return createHash('sha256')
    .update(
      stableStringify({
        arguments: omitUndefinedKeys(input.arguments),
        organizationId: input.organizationId,
        threadId: input.threadId ?? '',
        ...(input.scope
          ? {
              scope: {
                brandId: input.scope.brandId ?? null,
                contextVersion: input.scope.contextVersion,
              },
            }
          : {}),
        toolName: input.toolName,
        userId: input.userId,
      }),
    )
    .digest('hex');
}

/**
 * Drops undefined-valued object keys at every depth (the key is removed, not
 * mapped to null), matching what a JSON round-trip of the stored approval
 * arguments produces. Array items are left alone: JSON turns them into null,
 * which the canonical serializer already does.
 */
function omitUndefinedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedKeys(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefinedKeys(entry)]),
    );
  }
  return value;
}
