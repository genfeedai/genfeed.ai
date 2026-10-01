import type { PreparedOpenRouterTextLine } from '@api/helpers/utils/credits/openrouter-text-quote.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { OpenRouterChatCompletionParams } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { z } from 'zod';

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const money = z.number().finite().nonnegative();
const generationCostSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  total_cost: money,
  is_byok: z.boolean().optional(),
});
const textResponseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  choices: z.array(
    z.object({
      finish_reason: z.string().min(1),
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().min(1),
        tool_calls: z.array(z.unknown()).optional(),
      }),
    }),
  ),
  usage: z.object({
    prompt_tokens: tokenCount,
    completion_tokens: tokenCount,
    total_tokens: tokenCount,
    cost: money.optional(),
    cost_details: z
      .object({ upstream_inference_cost: money.optional() })
      .optional(),
    is_byok: z.boolean().optional(),
  }),
});
export const openrouterTextResponseEvidenceSchema = z.strictObject({
  kind: z.literal('openrouter-text-response-evidence'),
  version: z.literal(1),
  contractVersion: z.string().regex(/^[a-f0-9]{64}$/),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  responseId: z.string().min(1),
  responseModelKey: z.string().min(1),
  responseHash: z.string().regex(/^[a-f0-9]{64}$/),
  generationMetadataHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  finishReason: z.string().min(1),
  promptTokens: tokenCount,
  completionTokens: tokenCount,
  totalTokens: tokenCount,
  accountCostUsd: money.nullable(),
  upstreamInferenceCostUsd: money.nullable(),
  costSource: z.enum(['usage', 'generation']).nullable(),
  providerByok: z.boolean().nullable(),
  observedAt: z.iso.datetime(),
});
export type OpenRouterTextResponseEvidence = z.infer<
  typeof openrouterTextResponseEvidenceSchema
>;
export type ObservedOpenRouterTextResult =
  | {
      status: 'observed';
      response: unknown;
      generationMetadata: unknown | null;
      evidence: OpenRouterTextResponseEvidence;
    }
  | {
      status: 'uncertain';
      response: unknown;
      generationMetadata: unknown | null;
      responseId: string | null;
      reason: string;
    };

export function buildOpenRouterPreparedTextParams(
  prepared: PreparedOpenRouterTextLine,
  messages: OpenRouterChatCompletionParams['messages'],
): OpenRouterChatCompletionParams {
  const snapshot = prepared.contract.snapshot;
  const pricing = snapshot.pricing;
  return {
    model: snapshot.openapi.modelKey,
    messages,
    max_tokens: prepared.maximumOutputTokens,
    stream: false,
    provider: {
      order: [snapshot.openapi.endpointSlug],
      only: [snapshot.openapi.endpointSlug],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: 'deny',
      zdr: true,
      ...(prepared.kind === 'openrouter-text-platform-quote' &&
      pricing.kind !== 'unavailable'
        ? {
            max_price:
              pricing.kind === 'explicit-free'
                ? { prompt: 0, completion: 0, request: 0 }
                : {
                    prompt: pricing.inputUsdPerMillionCeiling,
                    completion: pricing.completionUsdPerMillionCeiling,
                    request: pricing.requestUsdCeiling,
                  },
          }
        : {}),
    },
    plugins: [{ id: 'context-compression', enabled: false }],
    ...(snapshot.inputSchema.reasoning === 'disabled'
      ? { reasoning: { enabled: false } }
      : {}),
  };
}

export function observePreparedOpenRouterText(
  prepared: PreparedOpenRouterTextLine,
  rawResponse: unknown,
  generationMetadata: unknown | null,
): ObservedOpenRouterTextResult {
  const identity = z.object({ id: z.string().min(1) }).safeParse(rawResponse);
  const uncertain = (reason: string): ObservedOpenRouterTextResult => ({
    status: 'uncertain',
    response: rawResponse,
    generationMetadata,
    responseId: identity.success ? identity.data.id : null,
    reason,
  });
  const parsed = textResponseSchema.safeParse(rawResponse);
  if (!parsed.success) return uncertain('text_response_shape_invalid');
  const response = parsed.data;
  const choice = response.choices[0];
  const snapshot = prepared.contract.snapshot;
  if (
    response.model !== snapshot.outputSchema.responseModelKey ||
    response.choices?.length !== 1 ||
    typeof choice?.message?.content !== 'string' ||
    choice.message.content.length === 0 ||
    choice.message.tool_calls?.length
  )
    return uncertain('text_response_identity_or_shape_changed');
  const usage = response.usage;
  const metadata =
    generationMetadata === null
      ? null
      : generationCostSchema.safeParse(generationMetadata);
  if (
    metadata &&
    (!metadata.success ||
      metadata.data.id !== response.id ||
      metadata.data.model !== response.model)
  )
    return uncertain('text_generation_metadata_identity_or_cost_invalid');
  const generationCost = metadata?.success ? metadata.data : null;
  let responseHash: string;
  let generationMetadataHash: string | null;
  try {
    responseHash = quoteSnapshotHash(rawResponse);
    generationMetadataHash =
      generationMetadata === null
        ? null
        : quoteSnapshotHash(generationMetadata);
  } catch {
    return uncertain('text_response_hash_unavailable');
  }
  const evidence = openrouterTextResponseEvidenceSchema.safeParse({
    kind: 'openrouter-text-response-evidence',
    version: 1,
    contractVersion: prepared.contractVersion,
    requestHash: prepared.requestHash,
    responseId: response.id,
    responseModelKey: response.model,
    responseHash,
    generationMetadataHash,
    contentHash: quoteSnapshotHash(choice.message.content),
    finishReason: choice.finish_reason,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    accountCostUsd: usage?.cost ?? generationCost?.total_cost ?? null,
    upstreamInferenceCostUsd:
      usage?.cost_details?.upstream_inference_cost ?? null,
    costSource:
      usage?.cost !== undefined
        ? 'usage'
        : generationCost
          ? 'generation'
          : null,
    providerByok: usage?.is_byok ?? generationCost?.is_byok ?? null,
    observedAt: new Date().toISOString(),
  });
  if (!evidence.success)
    return uncertain('text_response_billing_evidence_invalid');
  const proof = evidence.data;
  if (
    proof.promptTokens > prepared.maximumInputTokens ||
    proof.completionTokens > prepared.maximumOutputTokens ||
    proof.totalTokens !== proof.promptTokens + proof.completionTokens
  )
    return uncertain('text_response_usage_exceeds_frozen_bound');
  if (
    prepared.kind === 'openrouter-text-platform-quote' &&
    (proof.accountCostUsd === null ||
      proof.costSource === null ||
      proof.providerByok === true ||
      proof.accountCostUsd > prepared.maximumProviderCostUsd)
  )
    return uncertain('text_response_account_cost_unresolved');
  return {
    status: 'observed',
    response: rawResponse,
    generationMetadata,
    evidence: proof,
  };
}
