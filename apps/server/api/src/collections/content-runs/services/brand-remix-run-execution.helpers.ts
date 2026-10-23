import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { BrandRemixExecution } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';

export type BrandRemixGenerateRuntime = {
  request: Request;
  seenCopy: Set<string>;
  user: User;
};

export type BrandRemixVariantCredit = {
  amount: number;
  isByokBypass: boolean;
  variantId: string;
};

export function runtimeOf(
  request: SystemWorkflowActionRequest,
): BrandRemixGenerateRuntime {
  const runtime = request.runtimeContext as
    | BrandRemixGenerateRuntime
    | undefined;
  if (!runtime?.request || !runtime.user) {
    throw new ConflictException(
      'Brand remix generation requires the originating request context.',
    );
  }
  return runtime;
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException('Brand remix workflow requires an object.');
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConflictException(`Brand remix workflow requires ${field}.`);
  }
  return value.trim();
}

export function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConflictException(
      `Brand remix workflow requires numeric ${field}.`,
    );
  }
  return value;
}

export function readDispatchSuccesses(value: unknown): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const result = (entry as { result?: unknown }).result;
    if (
      result === null ||
      typeof result !== 'object' ||
      Array.isArray(result)
    ) {
      return [];
    }
    const record = result as Record<string, unknown>;
    if (record.success !== true || typeof record.variantId !== 'string') {
      return [];
    }
    return [record.variantId];
  });
}

export function readVariantCredits(value: unknown): BrandRemixVariantCredit[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const result = (entry as { result?: unknown }).result;
    if (
      result === null ||
      typeof result !== 'object' ||
      Array.isArray(result)
    ) {
      return [];
    }
    const record = result as Record<string, unknown>;
    if (typeof record.variantId !== 'string') return [];
    return [
      {
        amount: typeof record.amount === 'number' ? record.amount : 0,
        isByokBypass: record.isByokBypass === true,
        variantId: record.variantId,
      },
    ];
  });
}

export function matchOrphanVariant(
  orphan: { groupIndex: number | null; id: string },
  variants: BrandRemixExecution['variants'],
  resumableVariantIds: Set<string>,
  adoptedVariantIds: Set<string>,
): BrandRemixExecution['variants'][number] | undefined {
  const indexedVariant =
    orphan.groupIndex == null ? undefined : variants[orphan.groupIndex];
  if (
    indexedVariant &&
    resumableVariantIds.has(indexedVariant.id) &&
    indexedVariant.assetIds.length === 0 &&
    !adoptedVariantIds.has(indexedVariant.id)
  ) {
    return indexedVariant;
  }
  if (orphan.groupIndex != null) return undefined;
  return variants.find(
    (candidate) =>
      resumableVariantIds.has(candidate.id) &&
      candidate.assetIds.length === 0 &&
      !adoptedVariantIds.has(candidate.id),
  );
}
