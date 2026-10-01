import { createHash } from 'node:crypto';

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
        arguments: input.arguments,
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
