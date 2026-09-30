import type { AdminModelPricingReport } from '@genfeedai/contracts/interfaces';

function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? 'Unresolved'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A faithful snapshot projection: no spreadsheet pricing formulas. */
export function exportModelPricingCsv(report: AdminModelPricingReport): string {
  const columns = [
    'Retrieved at',
    'Source',
    'Model',
    'Provider',
    'Category',
    'Active',
    'Lifecycle',
    'Explicit free designation',
    'Configured pricing type',
    'Configured provider USD per unit',
    'Stored credits',
    'Stored credits per unit',
    'Stored minimum credits',
    'Effective configured credits per unit',
    'Effective configured sample credits',
    'Sample duration (seconds)',
    'Configured input USD per million tokens',
    'Configured output USD per million tokens',
    'Supported dimensions',
    'Reviewed provider currency',
    'Reviewed provider unit',
    'Reviewed provider price per unit',
    'Reviewed provider conditions',
    'Reviewed provider rate bands',
    'Provider observed at',
    'Reviewed evidence version',
    'Reviewed evidence review status',
    'Reviewed evidence mapping status',
    'Reviewed evidence provenance',
    'Reviewed evidence source URL',
    'Provider rate verified at',
    'Pending provider evidence',
    'Reconciliation status',
    'Unresolved / discrepancy reasons',
  ];
  const rows = report.rows.map((row) => [
    report.retrievedAt,
    report.source,
    row.key,
    row.provider,
    row.category,
    row.isActive,
    row.lifecycle,
    row.isFree,
    row.pricingType ?? 'flat (runtime fallback)',
    row.configuredProviderCostUsd,
    row.configuredCost,
    row.configuredCostPerUnit,
    row.configuredMinCost,
    row.effectiveUnitCredits,
    row.effectiveSampleCredits,
    row.sampleDuration,
    row.inputCostPerMillionTokens,
    row.outputCostPerMillionTokens,
    row.dimensions,
    row.reviewed?.currency,
    row.reviewed?.billingUnit,
    row.reviewed?.unitPrice,
    row.reviewed?.conditionalDimensions,
    row.reviewed?.rates,
    row.reviewed?.observedAt,
    row.reviewed?.version,
    row.reviewed?.reviewStatus,
    row.reviewed?.mappingStatus,
    row.reviewed?.source,
    row.reviewed?.sourceUrl,
    row.reviewed?.verifiedAt,
    row.pending,
    row.status,
    row.reasons.join('; '),
  ]);
  return [columns, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}
