import type {
  IMediaVendorCostGroupRow,
  IMediaVendorCostModelAggregate,
} from '@genfeedai/interfaces';

function readSum(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Fold Prisma `groupBy(model, provider, isByok)` rows into per-model aggregates.
 * Platform vendor cost ignores BYOK rows even if they were stored non-zero.
 */
export function foldMediaVendorCostGroups(
  rows: IMediaVendorCostGroupRow[],
): IMediaVendorCostModelAggregate[] {
  const aggregates = new Map<string, IMediaVendorCostModelAggregate>();

  for (const row of rows) {
    const key = `${row.provider}::${row.model}`;
    const current = aggregates.get(key) ?? {
      byokGenerationCount: 0,
      generationCount: 0,
      model: row.model,
      platformGenerationCount: 0,
      provider: row.provider,
      units: 0,
      vendorCostMicros: 0,
    };

    current.generationCount += row._count._all;
    current.units += readSum(row._sum.units);

    if (row.isByok) {
      current.byokGenerationCount += row._count._all;
    } else {
      current.platformGenerationCount += row._count._all;
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
