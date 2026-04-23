import type { ISetting } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildGenfeedCloudSignupUrl,
  buildOnboardingAccessSettingsPatch,
  deriveBrandNameFromDomain,
  extractBrandDomain,
  getSelectedOnboardingAccessMode,
  ONBOARDING_ACCESS_SOURCE,
  ONBOARDING_STORAGE_KEYS,
  persistOnboardingHandoffParams,
} from '@/lib/onboarding/onboarding-access.util';

describe('buildOnboardingAccessSettingsPatch', () => {
  it('preserves existing dashboard scopes while setting the onboarding access choice', () => {
    const currentSettings = {
      dashboardPreferences: {
        scopes: {
          organization: {
            blocks: [],
            isAgentModified: false,
            updatedAt: '2026-04-01T10:00:00.000Z',
            version: 1,
          },
        },
      },
    } satisfies Pick<ISetting, 'dashboardPreferences'>;

    const patch = buildOnboardingAccessSettingsPatch({
      accessMode: 'byok',
      currentSettings,
      selectedAt: '2026-04-22T09:30:00.000Z',
    });

    expect(patch).toEqual({
      dashboardPreferences: {
        onboarding: {
          accessMode: 'byok',
          selectedAt: '2026-04-22T09:30:00.000Z',
          source: ONBOARDING_ACCESS_SOURCE,
        },
        scopes: currentSettings.dashboardPreferences?.scopes,
      },
    });
  });
});

describe('getSelectedOnboardingAccessMode', () => {
  it('returns the saved onboarding access mode when present', () => {
    expect(
      getSelectedOnboardingAccessMode({
        dashboardPreferences: {
          onboarding: {
            accessMode: 'cloud',
          },
          scopes: {},
        },
      }),
    ).toBe('cloud');
  });

  it('returns null when no onboarding choice is saved', () => {
    expect(
      getSelectedOnboardingAccessMode({
        dashboardPreferences: {
          scopes: {},
        },
      }),
    ).toBeNull();
  });
});

describe('extractBrandDomain', () => {
  it('normalizes website inputs down to a bare hostname', () => {
    expect(extractBrandDomain('https://www.genfeed.ai/pricing')).toBe(
      'genfeed.ai',
    );
    expect(extractBrandDomain('acme.co')).toBe('acme.co');
  });
});

describe('deriveBrandNameFromDomain', () => {
  it('converts domains into readable brand labels', () => {
    expect(deriveBrandNameFromDomain('genfeed-ai.com')).toBe('Genfeed Ai');
    expect(deriveBrandNameFromDomain('studio.acme.io')).toBe('Studio Acme');
  });
});

describe('buildGenfeedCloudSignupUrl', () => {
  it('builds a real cloud signup URL with onboarding handoff parameters', () => {
    const signupUrl = buildGenfeedCloudSignupUrl({
      brandDomain: 'https://www.acme.co/products',
      brandName: 'Acme',
    });
    const parsedUrl = new URL(signupUrl);

    expect(parsedUrl.origin).toBe('https://app.genfeed.ai');
    expect(parsedUrl.pathname).toBe('/sign-up');
    expect(parsedUrl.searchParams.get('accessMode')).toBe('cloud');
    expect(parsedUrl.searchParams.get('brandDomain')).toBe('acme.co');
    expect(parsedUrl.searchParams.get('brandName')).toBe('Acme');
    expect(parsedUrl.searchParams.get('source')).toBe(ONBOARDING_ACCESS_SOURCE);
  });
});

describe('persistOnboardingHandoffParams', () => {
  it('normalizes valid cloud handoff params before writing storage', () => {
    const storedValues = new Map<string, string>();

    persistOnboardingHandoffParams(
      '?plan= price_123 &credits=0500&brandDomain=https://www.acme.co/products&brandName= Acme &accessMode=cloud&source= oss-onboarding ',
      {
        setItem: (key, value) => {
          storedValues.set(key, value);
        },
      },
    );

    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.selectedPlan)).toBe(
      'price_123',
    );
    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.selectedCredits)).toBe(
      '500',
    );
    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(
      'acme.co',
    );
    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.brandName)).toBe('Acme');
    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.accessMode)).toBe('cloud');
    expect(storedValues.get(ONBOARDING_STORAGE_KEYS.source)).toBe(
      ONBOARDING_ACCESS_SOURCE,
    );
  });

  it('ignores invalid access mode and malformed credit values', () => {
    const storedValues = new Map<string, string>();

    persistOnboardingHandoffParams(
      new URLSearchParams('credits=500abc&accessMode=admin&brandDomain='),
      {
        setItem: (key, value) => {
          storedValues.set(key, value);
        },
      },
    );

    expect(storedValues.has(ONBOARDING_STORAGE_KEYS.selectedCredits)).toBe(
      false,
    );
    expect(storedValues.has(ONBOARDING_STORAGE_KEYS.accessMode)).toBe(false);
    expect(storedValues.has(ONBOARDING_STORAGE_KEYS.brandDomain)).toBe(false);
  });
});
