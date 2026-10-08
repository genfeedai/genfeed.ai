import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutCapacityInput,
  BreakoutCapacityLimit,
  BreakoutCapacityPlan,
  BreakoutFormatCostEstimate,
  BreakoutKnownFormatCostEstimate,
} from '@genfeedai/contracts/interfaces';

const BUDGET_FIELDS = [
  'remainingDailyCredits',
  'remainingWeeklyCredits',
  'remainingMonthlyCredits',
  'availableOrganizationCredits',
  'remainingPlatformCredits',
  'remainingPacingCredits',
] as const;
function validCredits(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}
function usableCost(
  cost: Readonly<BreakoutFormatCostEstimate> | undefined,
): cost is BreakoutKnownFormatCostEstimate {
  return (
    cost !== undefined &&
    validCredits(cost.generationCredits) &&
    validCredits(cost.qualityCredits) &&
    validCredits(cost.generationCredits + cost.qualityCredits)
  );
}

/** A bounded estimate, never paid generation or publication authorization. */
export function planBreakoutCapacity(
  input: Readonly<BreakoutCapacityInput>,
): BreakoutCapacityPlan {
  if (
    !Number.isInteger(input.requestedTotalOutputs) ||
    input.requestedTotalOutputs < 1 ||
    input.requestedTotalOutputs > 5
  )
    throw new RangeError(
      'Breakout planning requests one to five total outputs',
    );
  const result: BreakoutCapacityPlan = {
    version: 1,
    status: 'held',
    requestedTotalOutputs: input.requestedTotalOutputs,
    selectedTotalOutputs: 0,
    slots: [],
    estimatedCredits: 0,
    limits: [],
  };
  function held(reason: BreakoutCapacityLimit): BreakoutCapacityPlan {
    return { ...result, limits: [reason] };
  }
  if (input.source.isResponse) return held('response_source');
  const quote = input.source.platform === Platform.TWITTER;
  if (!input.supportedFormats.includes(input.source.format))
    return held('unsupported_format');
  if (quote && !input.supportedFormats.includes('text'))
    return held('quote_unsupported');
  if (
    input.remainingPublicationSlots === null ||
    !Number.isSafeInteger(input.remainingPublicationSlots) ||
    input.remainingPublicationSlots < 0
  )
    return held('quota_unavailable');
  if (input.remainingPublicationSlots === 0) return held('quota_exhausted');
  const budgets = BUDGET_FIELDS.map((key) => input.budget[key]);
  if (!budgets.every(validCredits)) return held('budget_unavailable');
  const spendByFormat = new Map<string, number>();
  const maximum = Math.min(
    input.requestedTotalOutputs,
    input.remainingPublicationSlots,
  );
  for (let index = 0; index < maximum; index += 1) {
    const kind = quote && index === 0 ? 'quote' : 'follow_up';
    const format = kind === 'quote' ? 'text' : input.source.format;
    const cost = input.costsByFormat[format];
    if (!usableCost(cost)) {
      result.limits.push('cost_unavailable');
      break;
    }
    const formatCap = input.budget.remainingFormatCredits[format];
    if (formatCap !== undefined && !validCredits(formatCap)) {
      result.limits.push('budget_unavailable');
      break;
    }
    const estimatedCredits = cost.generationCredits + cost.qualityCredits;
    const total = result.estimatedCredits + estimatedCredits;
    if (
      !validCredits(total) ||
      budgets.some((remaining) => total > remaining)
    ) {
      result.limits.push('budget_exhausted');
      break;
    }
    const formatSpend = (spendByFormat.get(format) ?? 0) + estimatedCredits;
    if (formatCap !== undefined && formatSpend > formatCap) {
      result.limits.push('format_cap_exhausted');
      break;
    }
    result.slots.push({
      ordinal: index + 1,
      kind,
      format,
      generationCredits: cost.generationCredits,
      qualityCredits: cost.qualityCredits,
      estimatedCredits,
      quoteExternalId: kind === 'quote' ? input.source.externalId : null,
    });
    result.estimatedCredits = total;
    spendByFormat.set(format, formatSpend);
  }
  if (input.remainingPublicationSlots < input.requestedTotalOutputs)
    result.limits.push('quota_exhausted');
  result.limits = [...new Set(result.limits)];
  result.selectedTotalOutputs = result.slots.length;
  result.status = result.slots.length ? 'planned' : 'held';
  return result;
}
