import {
  ONBOARD_BRAND_SCAN_TIMEOUT_MS,
  resolveOnboardBrandCall,
} from '@mcp/tools/onboarding.tool';

describe('resolveOnboardBrandCall', () => {
  it('creates a brand through the existing API handler without forwarding scope overrides', () => {
    expect(
      resolveOnboardBrandCall({
        action: 'create_from_url',
        url: 'https://example.com',
        label: 'Example',
        approve: false,
        organizationId: 'other-org',
        brandId: 'other-brand',
        userId: 'other-user',
      }),
    ).toEqual({
      agentToolName: 'create_brand_from_url',
      parameters: {
        url: 'https://example.com',
        label: 'Example',
        approve: false,
      },
      timeoutMs: ONBOARD_BRAND_SCAN_TIMEOUT_MS,
    });
  });
  it('maps save_answers onto save_onboarding_answers with only its fields', () => {
    expect(
      resolveOnboardBrandCall({
        action: 'save_answers',
        brandId: 'brand-1',
        cadence: '3 posts a week',
        goals: ['awareness'],
        platforms: ['linkedin'],
        toneAdjustment: 'warmer',
        url: 'https://acme.example',
      }),
    ).toEqual({
      agentToolName: 'save_onboarding_answers',
      parameters: {
        brandId: 'brand-1',
        cadence: '3 posts a week',
        goals: ['awareness'],
        platforms: ['linkedin'],
        toneAdjustment: 'warmer',
      },
    });
  });

  it('maps scan_url onto scan_brand_url and complete onboarding with no input', () => {
    expect(
      resolveOnboardBrandCall({ action: 'scan_url', url: 'acme.example' }),
    ).toEqual({
      agentToolName: 'scan_brand_url',
      parameters: { url: 'acme.example' },
      timeoutMs: ONBOARD_BRAND_SCAN_TIMEOUT_MS,
    });
    // The proxy outlives the API's 45 s scan deadline.
    expect(ONBOARD_BRAND_SCAN_TIMEOUT_MS).toBeGreaterThan(45_000);
    expect(resolveOnboardBrandCall({ action: 'complete' })).toEqual({
      agentToolName: 'complete_onboarding',
      parameters: {},
    });
  });

  it.each([undefined, 'skip', 'toString', 'constructor'])(
    'rejects action %s',
    (action) => {
      expect(() => resolveOnboardBrandCall({ action })).toThrow(
        /onboard_brand action must be one of/,
      );
    },
  );
});
