export const MARKETING_CONSENT_STORAGE_KEY = 'genfeed:marketing-consent';

export type MarketingConsentValue = 'denied' | 'granted';

export interface MarketingConsentState {
  adStorage: MarketingConsentValue;
  analyticsStorage: MarketingConsentValue;
  updatedAt: string;
}

export function createConsentState(
  value: MarketingConsentValue,
): MarketingConsentState {
  return {
    adStorage: value,
    analyticsStorage: value,
    updatedAt: new Date().toISOString(),
  };
}

export function parseMarketingConsent(
  value: string | null,
): MarketingConsentState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MarketingConsentState>;

    if (
      (parsed.adStorage === 'denied' || parsed.adStorage === 'granted') &&
      (parsed.analyticsStorage === 'denied' ||
        parsed.analyticsStorage === 'granted')
    ) {
      return {
        adStorage: parsed.adStorage,
        analyticsStorage: parsed.analyticsStorage,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }

  return null;
}
