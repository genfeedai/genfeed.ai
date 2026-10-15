import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelBillableQuoteSnapshot } from '@genfeedai/contracts/interfaces';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Speech is billed per submitted character through the model's reviewed
 * `character` rate. Any other cost source reads `providerCostUsd` as a
 * per-run price and would undercharge long text, so it is refused. Shared by
 * Studio Voice and avatar renders whose speech the platform provides.
 */
export async function quoteSpeechSnapshot(
  modelCreditQuote: Pick<ModelCreditQuoteService, 'quoteSnapshotByKey'>,
  params: {
    characters: number;
    modelKey: string;
    organizationId: string;
    provider: string;
  },
): Promise<ModelBillableQuoteSnapshot> {
  const snapshot = await modelCreditQuote.quoteSnapshotByKey(params.modelKey, {
    characters: params.characters,
    organizationId: params.organizationId,
    provider: params.provider,
  });
  if (snapshot.costSource !== 'reviewed-provider')
    throw new ServiceUnavailableException({
      code: 'PRICING_UNAVAILABLE',
      detail: `${params.modelKey} has no reviewed per-character rate`,
      message: 'Speech pricing is unavailable right now',
      modelKey: params.modelKey,
      title: 'Pricing unavailable',
    });
  return snapshot;
}
