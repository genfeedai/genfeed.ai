import type {
  IUnitEconomicsMetrics,
  IUnitEconomicsRow,
  IUnitEconomicsTopModel,
} from '@genfeedai/contracts/interfaces';

const MICROS_PER_USD = 1_000_000;
const MINOR_UNITS_PER_USD = 100;

/** One grouping key's raw aggregates, straight from the ledgers. */
export interface UnitEconomicsAggregate {
  agentChatCredits: number;
  agentTurns: number;
  generationCredits: number;
  llmProviderCostMicros: number;
  mediaProviderCostMicros: number;
  revenueMinor: number;
}

export interface UnitEconomicsRowInput {
  aggregate: UnitEconomicsAggregate;
  id: string;
  label: string;
  topModels: IUnitEconomicsTopModel[];
}

export const EMPTY_UNIT_ECONOMICS_AGGREGATE: UnitEconomicsAggregate = {
  agentChatCredits: 0,
  agentTurns: 0,
  generationCredits: 0,
  llmProviderCostMicros: 0,
  mediaProviderCostMicros: 0,
  revenueMinor: 0,
};

/** Money rounded to cents only at the reporting edge. */
function toUsd(value: number, unitsPerUsd: number): number {
  return Number((value / unitsPerUsd).toFixed(6));
}

function roundCredits(value: number): number {
  return Number(value.toFixed(6));
}

export function toUnitEconomicsMetrics(
  aggregate: UnitEconomicsAggregate,
): IUnitEconomicsMetrics {
  const revenueUsd = toUsd(aggregate.revenueMinor, MINOR_UNITS_PER_USD);
  const llmProviderCostUsd = toUsd(
    aggregate.llmProviderCostMicros,
    MICROS_PER_USD,
  );
  const mediaProviderCostUsd = toUsd(
    aggregate.mediaProviderCostMicros,
    MICROS_PER_USD,
  );
  const grossMarginUsd = Number(
    (revenueUsd - llmProviderCostUsd - mediaProviderCostUsd).toFixed(6),
  );

  return {
    agentChatCredits: roundCredits(aggregate.agentChatCredits),
    agentTurns: aggregate.agentTurns,
    generationCredits: roundCredits(aggregate.generationCredits),
    grossMarginPercent:
      revenueUsd > 0
        ? Number(((grossMarginUsd / revenueUsd) * 100).toFixed(2))
        : null,
    grossMarginUsd,
    llmProviderCostUsd,
    mediaProviderCostUsd,
    revenueUsd,
  };
}

export function sumUnitEconomicsAggregates(
  aggregates: readonly UnitEconomicsAggregate[],
): UnitEconomicsAggregate {
  return aggregates.reduce<UnitEconomicsAggregate>(
    (total, aggregate) => ({
      agentChatCredits: total.agentChatCredits + aggregate.agentChatCredits,
      agentTurns: total.agentTurns + aggregate.agentTurns,
      generationCredits: total.generationCredits + aggregate.generationCredits,
      llmProviderCostMicros:
        total.llmProviderCostMicros + aggregate.llmProviderCostMicros,
      mediaProviderCostMicros:
        total.mediaProviderCostMicros + aggregate.mediaProviderCostMicros,
      revenueMinor: total.revenueMinor + aggregate.revenueMinor,
    }),
    { ...EMPTY_UNIT_ECONOMICS_AGGREGATE },
  );
}

/**
 * Rows plus a totals row. Totals re-derive the margin from summed money —
 * averaging per-row percentages would weight a $1 org like a $10k one.
 * Rows sort by provider cost, the number an operator scans first.
 */
export function buildUnitEconomicsRows(inputs: readonly UnitEconomicsRowInput[]): {
  rows: IUnitEconomicsRow[];
  totals: IUnitEconomicsMetrics;
} {
  const rows = inputs
    .map((input) => ({
      ...toUnitEconomicsMetrics(input.aggregate),
      id: input.id,
      label: input.label,
      topModels: input.topModels,
    }))
    .sort(
      (left, right) =>
        right.llmProviderCostUsd +
          right.mediaProviderCostUsd -
          (left.llmProviderCostUsd + left.mediaProviderCostUsd) ||
        right.revenueUsd - left.revenueUsd ||
        left.label.localeCompare(right.label),
    );

  return {
    rows,
    totals: toUnitEconomicsMetrics(
      sumUnitEconomicsAggregates(inputs.map((input) => input.aggregate)),
    ),
  };
}
