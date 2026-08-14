import type {
  ILlmVendorCostGroupRow,
  ILlmVendorCostModelAggregate,
} from '@genfeedai/interfaces';

function readSum(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Fold Prisma `groupBy(model, provider, isByok)` rows into per-model aggregates.
 * Platform vendor cost ignores BYOK rows even if they were stored non-zero.
 */
export function foldLlmVendorCostGroups(
  rows: ILlmVendorCostGroupRow[],
): ILlmVendorCostModelAggregate[] {
  const aggregates = new Map<string, ILlmVendorCostModelAggregate>();

  for (const row of rows) {
    const key = `${row.provider}::${row.model}`;
    const current = aggregates.get(key) ?? {
      byokCallCount: 0,
      callCount: 0,
      completionTokens: 0,
      model: row.model,
      platformCallCount: 0,
      promptTokens: 0,
      provider: row.provider,
      vendorCostMicros: 0,
    };

    current.callCount += row._count._all;
    current.promptTokens += readSum(row._sum.promptTokens);
    current.completionTokens += readSum(row._sum.completionTokens);

    if (row.isByok) {
      current.byokCallCount += row._count._all;
    } else {
      current.platformCallCount += row._count._all;
      current.vendorCostMicros += readSum(row._sum.vendorCostMicros);
    }

    aggregates.set(key, current);
  }

  return [...aggregates.values()].sort((left, right) => {
    if (left.provider !== right.provider) {
      return left.provider.localeCompare(right.provider);
    }
    return left.model.localeCompare(right.model);
  });
}
