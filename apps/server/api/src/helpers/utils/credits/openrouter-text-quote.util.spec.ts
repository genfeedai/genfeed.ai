import { openrouterTextContractFixture } from '@api/collections/models/utils/openrouter-text-contract.fixture';
import {
  prepareOpenRouterTextLine as prepare,
  validatePreparedOpenRouterTextLine as validate,
} from '@api/helpers/utils/credits/openrouter-text-quote.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { calculateAgentExactCredits } from '@genfeedai/contracts/constants';
import {
  getRuntimeAgentChatMarginMultiplier,
  setRuntimeAgentChatMarginMultiplier,
} from '@genfeedai/pricing';
import { describe, expect, it } from 'vitest';

const messages = [
  { role: 'user' as const, content: 'A synthetic planning brief' },
];
const failure = expect.objectContaining({
  response: expect.objectContaining({ detail: expect.any(String) }),
});
describe('strict frozen context-ceiling text quote', () => {
  it('uses full context ceiling plus capped completion and request fee, preserving fractional credits and frozen margin', () => {
    const initial = getRuntimeAgentChatMarginMultiplier();
    try {
      const prepared = prepare({
        contract: openrouterTextContractFixture(),
        messages,
        maximumOutputTokens: 2000,
        route: { kind: 'platform' },
      });
      if (prepared.kind !== 'openrouter-text-platform-quote')
        throw new Error('platform fixture');
      expect(prepared.maximumInputTokens).toBe(10000);
      expect(prepared.maximumProviderCostUsd).toBeCloseTo(0.0141);
      expect(prepared.maximumCredits).toBe(
        calculateAgentExactCredits(0.0141, initial),
      );
      setRuntimeAgentChatMarginMultiplier(3);
      expect(validate(prepared)).toEqual(prepared);
    } finally {
      setRuntimeAgentChatMarginMultiplier(initial);
    }
  });
  it('pins BYOK without a platform tariff or fabricated vendor cost', () => {
    const prepared = prepare({
      contract: openrouterTextContractFixture({
        kind: 'unavailable',
        version: 1,
        reason: 'synthetic missing tariff',
      }),
      messages,
      maximumOutputTokens: 100,
      route: { kind: 'byok', credentialId: 'credential-1' },
    });
    expect(prepared.maximumCredits).toBe(0);
    expect(prepared).not.toHaveProperty('marginMultiplier');
    expect(prepared).not.toHaveProperty('maximumProviderCostUsd');
    expect(() =>
      prepare({
        contract: prepared.contract,
        messages,
        maximumOutputTokens: 100,
        route: { kind: 'platform' },
      }),
    ).toThrow(failure);
  });
  it.each([0, -1, 2001, Number.POSITIVE_INFINITY, 12.5])(
    'rejects unsupported output bound %s',
    (maximumOutputTokens) => {
      expect(() =>
        prepare({
          contract: openrouterTextContractFixture(),
          messages,
          maximumOutputTokens,
          route: { kind: 'platform' },
        }),
      ).toThrow();
    },
  );
  it('requires explicit reviewed free evidence and rejects hash/ceiling changes', () => {
    const contract = openrouterTextContractFixture({
      kind: 'explicit-free',
      version: 1,
      currency: 'USD',
      evidence: 'synthetic free contract',
    });
    const prepared = prepare({
      contract,
      messages,
      maximumOutputTokens: 100,
      route: { kind: 'platform' },
    });
    expect(prepared.maximumCredits).toBe(0);
    const changed = structuredClone(prepared);
    changed.maximumOutputTokens++;
    expect(() => validate(changed)).toThrow(failure);
    changed.preparedHash = quoteSnapshotHash({
      ...changed,
      preparedHash: undefined,
    });
    if (changed.kind === 'openrouter-text-platform-quote')
      changed.maximumProviderCostUsd = 99;
    expect(() => validate(changed)).toThrow(failure);
  });
  it('rejects tool/multimodal/extra fields and non-JSON request hooks', () => {
    const contract = openrouterTextContractFixture();
    const extraMessages = [{ ...messages[0], extra: true }];
    const hooked = [...messages];
    Object.setPrototypeOf(hooked, { map: () => [] });
    expect(() =>
      prepare({
        contract,
        messages: hooked,
        maximumOutputTokens: 100,
        route: { kind: 'platform' },
      }),
    ).toThrow(failure);
    expect(() =>
      prepare({
        contract,
        messages: extraMessages,
        maximumOutputTokens: 100,
        route: { kind: 'platform' },
      }),
    ).toThrow();
  });
});
