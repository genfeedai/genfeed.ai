import type { ICostReportEntry } from '@genfeedai/contracts/interfaces/billing';

const CSV_HEADERS = [
  'created_at',
  'entry_type',
  'brand_id',
  'brand',
  'provider',
  'model',
  'category',
  'reference_id',
  'provider_cost_micros',
  'provider_cost_usd',
  'credits_used',
  'is_byok',
] as const;

function neutralizeFormula(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | boolean | null): string {
  const safe = neutralizeFormula(value === null ? '' : String(value));
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function buildCostReportCsv(entries: ICostReportEntry[]): string {
  const rows = entries.map((entry) =>
    [
      entry.createdAt,
      entry.entryType,
      entry.brandId,
      entry.brandLabel,
      entry.provider,
      entry.model,
      entry.category,
      entry.referenceId,
      entry.providerCostMicros,
      entry.providerCostUsd,
      entry.creditsUsed,
      entry.isByok,
    ]
      .map(csvCell)
      .join(','),
  );

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}
