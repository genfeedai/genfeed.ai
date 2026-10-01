import { reviewedOpenrouterTextContractSchema } from '@api/collections/models/utils/openrouter-text-contract.schema';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { assertWorkflowCanonicalJson } from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import {
  calculateAgentExactCredits,
  calculateAgentProviderCostUsd,
} from '@genfeedai/contracts/constants';
import { getRuntimeAgentChatMarginMultiplier } from '@genfeedai/pricing';
import { z } from 'zod';

const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const money = z.number().finite().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const frozenTextMessagesSchema = z
  .array(
    z.strictObject({
      role: z.enum(['system', 'user']),
      content: z
        .string()
        .min(1)
        .refine((content) => content.trim().length > 0),
    }),
  )
  .min(1);
export type FrozenTextMessage = z.infer<
  typeof frozenTextMessagesSchema
>[number];
const shared = {
  version: z.literal(1),
  contractVersion: hash,
  contract: reviewedOpenrouterTextContractSchema,
  requestHash: hash,
  maximumInputTokens: positiveInteger,
  maximumOutputTokens: positiveInteger,
  maximumCredits: money,
  quotedAt: z.iso.datetime(),
  preparedHash: hash,
};
export const preparedOpenrouterTextLineSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...shared,
    kind: z.literal('openrouter-text-platform-quote'),
    marginMultiplier: z.number().finite().positive(),
    maximumProviderCostUsd: money,
    costPolicy: z.literal('reported-account-cost-only'),
  }),
  z.strictObject({
    ...shared,
    kind: z.literal('openrouter-text-byok-quote'),
    maximumCredits: z.literal(0),
    credentialId: z.string().min(1),
  }),
]);
export type PreparedOpenRouterTextLine = z.infer<
  typeof preparedOpenrouterTextLineSchema
>;
type UnhashedTextLine<
  T extends PreparedOpenRouterTextLine = PreparedOpenRouterTextLine,
> = T extends PreparedOpenRouterTextLine ? Omit<T, 'preparedHash'> : never;

function unavailable(detail: string): never {
  throw new BusinessLogicException(detail);
}
export function openrouterTextRequestHash(
  messages: readonly FrozenTextMessage[],
  maximumOutputTokens: number,
): string {
  assertWorkflowCanonicalJson(messages);
  const parsed = frozenTextMessagesSchema.parse(messages);
  positiveInteger.parse(maximumOutputTokens);
  return quoteSnapshotHash({ messages: parsed, maximumOutputTokens });
}
function maximumCost(
  prepared: Pick<
    PreparedOpenRouterTextLine,
    'contract' | 'maximumOutputTokens'
  >,
): number {
  const pricing = prepared.contract.snapshot.pricing;
  if (pricing.kind === 'unavailable')
    unavailable('PRICING_UNAVAILABLE: reviewed text tariff is missing');
  if (pricing.kind === 'explicit-free') return 0;
  const cost =
    calculateAgentProviderCostUsd(
      {
        promptPerMillion: pricing.inputUsdPerMillionCeiling,
        completionPerMillion: pricing.completionUsdPerMillionCeiling,
      },
      {
        promptTokens: prepared.contract.snapshot.openapi.contextLength,
        completionTokens: prepared.maximumOutputTokens,
      },
    ) + pricing.requestUsdCeiling;
  if (!Number.isFinite(cost) || cost <= 0)
    unavailable('PRICING_UNAVAILABLE: text cost ceiling is unresolved');
  return cost;
}
export function validatePreparedOpenRouterTextLine(
  value: PreparedOpenRouterTextLine,
): PreparedOpenRouterTextLine {
  assertWorkflowCanonicalJson(value);
  const prepared = preparedOpenrouterTextLineSchema.parse(value);
  const descriptor = prepared.contract.snapshot.openapi;
  const { preparedHash, ...preimage } = prepared;
  if (
    prepared.contractVersion !== prepared.contract.version ||
    quoteSnapshotHash(prepared.contract.snapshot) !==
      prepared.contractVersion ||
    quoteSnapshotHash(preimage) !== preparedHash ||
    prepared.maximumInputTokens !== descriptor.contextLength ||
    prepared.maximumOutputTokens > descriptor.maximumCompletionTokens
  )
    unavailable('Frozen text contract or limits changed');
  if (prepared.kind === 'openrouter-text-platform-quote') {
    const cost = maximumCost(prepared);
    const credits = calculateAgentExactCredits(cost, prepared.marginMultiplier);
    if (
      cost !== prepared.maximumProviderCostUsd ||
      credits !== prepared.maximumCredits ||
      (prepared.contract.snapshot.pricing.kind === 'bounded' && credits <= 0)
    )
      unavailable('Frozen text price ceiling changed');
  }
  return prepared;
}
export function prepareOpenRouterTextLine(input: {
  contract: PreparedOpenRouterTextLine['contract'];
  messages: readonly FrozenTextMessage[];
  maximumOutputTokens: number;
  route: { kind: 'platform' } | { kind: 'byok'; credentialId: string };
}): PreparedOpenRouterTextLine {
  assertWorkflowCanonicalJson(input.contract);
  const contract = reviewedOpenrouterTextContractSchema.parse(input.contract);
  const sharedValue = {
    version: 1 as const,
    contractVersion: contract.version,
    contract,
    requestHash: openrouterTextRequestHash(
      input.messages,
      input.maximumOutputTokens,
    ),
    maximumInputTokens: contract.snapshot.openapi.contextLength,
    maximumOutputTokens: input.maximumOutputTokens,
    quotedAt: new Date().toISOString(),
  };
  let value: UnhashedTextLine;
  if (input.route.kind === 'byok')
    value = {
      ...sharedValue,
      kind: 'openrouter-text-byok-quote' as const,
      credentialId: input.route.credentialId,
      maximumCredits: 0 as const,
    };
  else {
    const marginMultiplier = getRuntimeAgentChatMarginMultiplier();
    if (!Number.isFinite(marginMultiplier) || marginMultiplier <= 0)
      unavailable('Text margin is unresolved');
    const maximumProviderCostUsd = maximumCost({
      contract,
      maximumOutputTokens: input.maximumOutputTokens,
    });
    value = {
      ...sharedValue,
      kind: 'openrouter-text-platform-quote' as const,
      marginMultiplier,
      maximumProviderCostUsd,
      maximumCredits: calculateAgentExactCredits(
        maximumProviderCostUsd,
        marginMultiplier,
      ),
      costPolicy: 'reported-account-cost-only' as const,
    };
  }
  return validatePreparedOpenRouterTextLine({
    ...value,
    preparedHash: quoteSnapshotHash(value),
  });
}
