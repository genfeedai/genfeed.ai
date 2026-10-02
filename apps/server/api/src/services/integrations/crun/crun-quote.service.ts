import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import type { CrunQuotePreparation } from '@api/services/integrations/crun/crun-task.schema';
import type {
  CrunQuoteReasonCode,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import {
  crunCreditsEqual,
  crunCreditsToUsd,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const tariff = z.object({
  currency: z.literal('CRUN_CREDITS'),
  sourceUrl: z.url().refine((value) => value.startsWith('https://')),
  verifiedAt: z.iso.datetime(),
  rates: z.array(
    z.object({
      endpoint: z.string().min(1),
      when: z.record(
        z.string(),
        z.union([z.string(), z.number().finite(), z.boolean()]),
      ),
      providerCredits: z.string().regex(/^\d+(?:\.\d+)?$/),
    }),
  ),
});
export type CrunQuoteResult =
  | { isAvailable: true; snapshot: ModelBillableQuoteSnapshot }
  | { isAvailable: false; reasonCode: CrunQuoteReasonCode };

/** Core pricing only: callers provide already authorized reviewed model and billing inputs. */
@Injectable()
export class CrunQuoteService {
  constructor(private readonly client: CrunClient) {}

  async quote(
    args: CrunQuotePreparation,
    now = new Date(),
  ): Promise<CrunQuoteResult> {
    const unavailable = (reasonCode: CrunQuoteReasonCode): CrunQuoteResult => ({
      isAvailable: false,
      reasonCode,
    });
    if (
      !args.profile.isActive ||
      args.profile.isDeleted ||
      args.profile.provider !== 'crun' ||
      args.profile.key !== `crun/${args.request.model}`
    )
      return unavailable('CRUN_MODEL_UNAVAILABLE');
    if (
      args.profile.hasPendingRate ||
      !args.profile.rateVersion ||
      args.profile.rateVersion !== args.contract.version ||
      args.request.model !== args.contract.endpoint
    )
      return unavailable('CRUN_CONTRACT_UNAVAILABLE');
    if (
      !Number.isSafeInteger(args.outputs) ||
      args.outputs < 1 ||
      args.outputs > 4
    )
      return unavailable('PRICING_UNAVAILABLE');
    const parsed = tariff.safeParse(args.pricingEvidence);
    if (!parsed.success) return unavailable('PRICING_UNAVAILABLE');
    const age = now.getTime() - Date.parse(parsed.data.verifiedAt);
    if (age < 0 || age > 30 * 86400000)
      return unavailable('PRICING_UNAVAILABLE');
    const matches = parsed.data.rates.filter(
      (rate) =>
        rate.endpoint === args.request.model &&
        Object.entries(rate.when).every(
          ([key, value]) => args.request.input[key] === value,
        ),
    );
    if (matches.length !== 1) return unavailable('PRICING_UNAVAILABLE');
    const providerCredits = matches[0].providerCredits;
    const isByok = args.credential.credentialSource === 'byok';
    const costUsd = isByok
      ? null
      : args.creditsPerUsd
        ? crunCreditsToUsd(providerCredits, args.creditsPerUsd)
        : null;
    if (!isByok && (costUsd === null || !args.acquisitionRateVersion))
      return unavailable('PRICING_UNAVAILABLE');
    const estimate = await this.client.estimate(args.credential, args.request);
    if (!estimate.isValid)
      return unavailable(
        estimate.reasonCode === 'CRUN_RATE_LIMITED'
          ? 'CRUN_RATE_LIMITED'
          : 'CRUN_PROVIDER_UNAVAILABLE',
      );
    if (
      estimate.data.estimated ||
      !crunCreditsEqual(estimate.data.credits, providerCredits)
    )
      return unavailable('PRICING_UNAVAILABLE');
    const profile = isByok
      ? {
          ...args.profile,
          providerCostUsd: null,
          reviewedPricing: null,
          requiresReviewedRates: false,
          requiredSelectorKeys: [],
        }
      : {
          ...args.profile,
          reviewedPricing: {
            version: args.contract.version,
            currency: 'USD',
            sourceUrl: parsed.data.sourceUrl,
            verifiedAt: parsed.data.verifiedAt,
            reviewStatus: 'approved',
            isFree: args.profile.isFree,
            rates: [
              {
                component: 'crun-output',
                unit: 'request' as const,
                unitPriceUsd: costUsd ?? 0,
                when: {},
              },
            ],
            invariantSelectors: Object.keys(args.request.input).filter(
              (key) => typeof args.request.input[key] !== 'object',
            ),
          },
          requiresReviewedRates: true,
          requiredSelectorKeys: [],
          requestCompletionPolicy: 'successful-request' as const,
        };
    const quote = quoteModelBillablePricing(
      profile,
      {
        modelKey: args.profile.key,
        provider: 'crun',
        requests: args.outputs,
        outputs: args.outputs,
      },
      args.marginMultiplier,
      now.toISOString(),
    );
    if (quote.status !== 'priced') return unavailable('PRICING_UNAVAILABLE');
    const inputHash = quoteSnapshotHash(args.request);
    const providerQuote = {
      provider: 'crun' as const,
      estimated: false as const,
      providerCreditsPerTask: estimate.data.credits,
      inputHash,
      contractVersion: args.contract.version,
      creditsPerUsd: isByok ? null : args.creditsPerUsd,
      acquisitionRateVersion: isByok ? null : args.acquisitionRateVersion,
      credentialSource: args.credential.credentialSource,
      credentialId: args.credential.credentialId,
      credentialFingerprint: args.credential.credentialFingerprint,
    };
    return {
      isAvailable: true,
      snapshot: {
        ...quote.snapshot,
        providerQuote: {
          ...providerQuote,
          quoteHash: quoteSnapshotHash({
            snapshot: quote.snapshot,
            providerQuote,
          }),
        },
      },
    };
  }
}
