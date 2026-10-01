import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { buildCrunContract } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_PRICING_SNAPSHOT,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import type { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import type { CrunQuotePreparation } from '@api/services/integrations/crun/crun-task.schema';

const now = new Date('2026-10-01T12:00:00.000Z');
function preparation(
  overrides: Partial<CrunQuotePreparation> = {},
): CrunQuotePreparation {
  const contract = buildCrunContract(CRUN_IMAGE_MANIFEST[0]);
  return {
    contract,
    profile: billableProfile({
      key: 'crun/google/nano-banana-pro',
      provider: 'crun',
      rateVersion: contract.version,
      cost: 3,
    }),
    pricingEvidence: CRUN_PRICING_SNAPSHOT,
    request: {
      model: 'google/nano-banana-pro',
      input: {
        prompt: 'private fixture',
        resolution: '1K',
        aspect_ratio: '1:1',
        output_format: 'png',
      },
    },
    credential: {
      apiKey: 'private-key',
      credentialSource: 'hosted',
      credentialId: null,
      credentialFingerprint: 'a'.repeat(64),
    },
    outputs: 1,
    creditsPerUsd: '1000',
    acquisitionRateVersion: 'fixture-rate-1',
    marginMultiplier: 3.3,
    ...overrides,
  };
}

describe('Crun exact fixed account quote', () => {
  const estimate = vi.fn();
  const service = new CrunQuoteService({ estimate } as unknown as CrunClient);
  beforeEach(() => {
    estimate.mockReset().mockResolvedValue({
      isValid: true,
      data: { credits: '8', estimated: false },
    });
  });
  it('freezes exact input/contract/rate/credential and rounds the group once for four tasks', async () => {
    const single = await service.quote(preparation(), now);
    const four = await service.quote(preparation({ outputs: 4 }), now);
    expect(single.isAvailable).toBe(true);
    expect(four.isAvailable).toBe(true);
    if (!single.isAvailable || !four.isAvailable)
      throw new Error('Quote unavailable');
    expect(single.snapshot.credits).toBe(3);
    expect(four.snapshot.credits).toBe(11);
    expect(four.snapshot.allocatedCredits).toEqual([3, 3, 3, 2]);
    expect(four.snapshot.providerCostUsd).toBe(0.032);
    expect(four.snapshot.providerQuote).toMatchObject({
      providerCreditsPerTask: '8',
      estimated: false,
      creditsPerUsd: '1000',
      acquisitionRateVersion: 'fixture-rate-1',
      credentialSource: 'hosted',
    });
    expect(
      modelBillableQuoteSnapshotSchema.safeParse(four.snapshot).success,
    ).toBe(true);
    expect(JSON.stringify(four.snapshot)).not.toContain('private');
    expect(estimate).toHaveBeenCalledWith(
      preparation().credential,
      preparation().request,
    );
  });
  it.each([null, '0', 'bad'])(
    'requires an explicit valid hosted acquisition rate %s',
    async (rate) => {
      expect(
        await service.quote(preparation({ creditsPerUsd: rate }), now),
      ).toEqual({ isAvailable: false, reasonCode: 'PRICING_UNAVAILABLE' });
      expect(estimate).not.toHaveBeenCalled();
    },
  );
  it('requires supported operator version and blocks stale/different contract before provider read', async () => {
    expect(
      (await service.quote(preparation({ acquisitionRateVersion: null }), now))
        .isAvailable,
    ).toBe(false);
    const args = preparation();
    args.profile.hasPendingRate = true;
    expect(await service.quote(args, now)).toEqual({
      isAvailable: false,
      reasonCode: 'CRUN_CONTRACT_UNAVAILABLE',
    });
    expect(estimate).not.toHaveBeenCalled();
  });
  it.each([
    { credits: '8', estimated: true },
    { credits: '7.5', estimated: false },
    { credits: '9', estimated: false },
  ])('rejects estimated or mismatched provider tariff', async (data) => {
    estimate.mockResolvedValue({ isValid: true, data });
    expect(await service.quote(preparation(), now)).toEqual({
      isAvailable: false,
      reasonCode: 'PRICING_UNAVAILABLE',
    });
  });
  it('BYOK needs no platform acquisition configuration, preserves existing usage quote and frozen source', async () => {
    const args = preparation({
      creditsPerUsd: null,
      acquisitionRateVersion: null,
      marginMultiplier: null,
    });
    args.credential = {
      ...args.credential,
      credentialSource: 'byok',
      credentialId: null,
    };
    const result = await service.quote(args, now);
    expect(result.isAvailable).toBe(true);
    if (!result.isAvailable) throw new Error('Quote unavailable');
    expect(result.snapshot.providerQuote).toMatchObject({
      creditsPerUsd: null,
      acquisitionRateVersion: null,
      credentialId: null,
      credentialSource: 'byok',
    });
    expect(result.snapshot.credits).toBe(3);
    expect(
      modelBillableQuoteSnapshotSchema.safeParse(result.snapshot).success,
    ).toBe(true);
  });
  it('selected Nano4K uses exact reviewed ten-credit tariff', async () => {
    const args = preparation();
    args.request.input.resolution = '4K';
    estimate.mockResolvedValue({
      isValid: true,
      data: { credits: '10.00', estimated: false },
    });
    const result = await service.quote(args, now);
    expect(result.isAvailable).toBe(true);
    if (result.isAvailable)
      expect(result.snapshot.providerQuote?.providerCreditsPerTask).toBe(
        '10.00',
      );
  });
  it('fractional reviewed tariff is supported without integer assumptions', async () => {
    estimate.mockResolvedValue({
      isValid: true,
      data: { credits: '1.5', estimated: false },
    });
    const result = await service.quote(
      preparation({
        pricingEvidence: {
          ...CRUN_PRICING_SNAPSHOT,
          rates: [
            {
              endpoint: 'google/nano-banana-pro',
              when: {},
              providerCredits: '1.5',
            },
          ],
        },
      }),
      now,
    );
    expect(result.isAvailable).toBe(true);
  });
  it('changed input/account/rate produces a new frozen identity', async () => {
    const a = await service.quote(preparation(), now);
    const changed = preparation({ acquisitionRateVersion: 'fixture-rate-2' });
    changed.request.input.prompt = 'new fixture';
    const b = await service.quote(changed, now);
    if (!a.isAvailable || !b.isAvailable) throw new Error('Quote unavailable');
    expect(a.snapshot.providerQuote?.quoteHash).not.toBe(
      b.snapshot.providerQuote?.quoteHash,
    );
    expect(a.snapshot.providerQuote?.inputHash).not.toBe(
      b.snapshot.providerQuote?.inputHash,
    );
  });
  it('returns account throttle unavailability without fabricated zero', async () => {
    estimate.mockResolvedValue({
      isValid: false,
      reasonCode: 'CRUN_RATE_LIMITED',
      disposition: 'deferred',
      retryAfterMs: 5000,
    });
    expect(await service.quote(preparation(), now)).toEqual({
      isAvailable: false,
      reasonCode: 'CRUN_RATE_LIMITED',
    });
  });
});
