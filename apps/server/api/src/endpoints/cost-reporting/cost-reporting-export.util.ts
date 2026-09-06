import type { WorkflowCostReportExecution } from '@genfeedai/contracts/interfaces';
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
  const safe =
    typeof value === 'string'
      ? neutralizeFormula(value)
      : value === null
        ? ''
        : String(value);
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

export function buildWorkflowCostCsv(
  entries: WorkflowCostReportExecution[],
): string {
  const headers = [
    'execution_id',
    'workflow_id',
    'created_at',
    'estimated_credits',
    'actual_credits',
    'known_actual_credits',
    'variance_credits',
    'provider_cost_micros',
    'known_provider_cost_micros',
    'estimated_provider_cost_micros',
    'variance_provider_cost_micros',
    'accounting_states',
    'unresolved_reasons',
    'node_breakdown',
  ];
  return [
    headers.join(','),
    ...entries.map((entry) =>
      [
        entry.id,
        entry.workflowId,
        entry.createdAt,
        entry.accounting?.estimatedCredits ?? null,
        entry.accounting?.actualCredits ?? null,
        entry.accounting?.knownActualCredits ?? null,
        entry.accounting?.varianceCredits ?? null,
        entry.accounting?.actualProviderCostMicros ?? null,
        entry.accounting?.knownProviderCostMicros ?? null,
        entry.accounting?.estimatedProviderCostMicros ?? null,
        entry.accounting?.varianceProviderCostMicros ?? null,
        entry.accounting?.nodes
          .map((node) => `${node.nodeId}:${node.state}`)
          .join('; ') ?? 'unavailable',
        entry.accounting?.nodes
          .flatMap((node) =>
            node.unresolvedReasons.map((reason) => `${node.nodeId}:${reason}`),
          )
          .join('; ') ?? 'unavailable',
        entry.accounting ? JSON.stringify(entry.accounting.nodes) : null,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
}
