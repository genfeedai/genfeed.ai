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

/** One row's metrics plus identity; the database has already ordered the rows. */
export function buildUnitEconomicsRow(
  input: UnitEconomicsRowInput,
): IUnitEconomicsRow {
  return {
    ...toUnitEconomicsMetrics(input.aggregate),
    id: input.id,
    label: input.label,
    topModels: input.topModels,
  };
}
