'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  loadMarketingTags,
  type MarketingTrackingConfig,
  setGoogleConsent,
  trackWebsiteMarketingEvent,
} from './browser';
import {
  createConsentState,
  MARKETING_CONSENT_STORAGE_KEY,
  type MarketingConsentState,
  parseMarketingConsent,
} from './consent';
import {
  deriveMarketingEventsFromCta,
  type MarketingEventPayload,
  WEBSITE_MARKETING_EVENTS,
} from './events';

export interface MarketingTrackingProviderProps {
  children: ReactNode;
  config: MarketingTrackingConfig;
  consentDefault?: 'denied' | 'granted';
}

interface ButtonTrackedMarketingEventDetail {
  trackingData?: MarketingEventPayload;
  trackingName: string;
}

const hasConfiguredMarketingTag = (config: MarketingTrackingConfig): boolean =>
  Boolean(
    config.gaId ||
      config.gtmContainerId ||
      config.linkedinPartnerId ||
      config.metaPixelId ||
      config.xPixelId,
  );

export default function MarketingTrackingProvider({
  children,
  config,
  consentDefault = 'denied',
}: MarketingTrackingProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<MarketingConsentState | null>(null);
  const [hasConsentChoice, setHasConsentChoice] = useState(false);
  const search = searchParams.toString();
  const shouldShowBanner =
    !hasConsentChoice && hasConfiguredMarketingTag(config);

  const currentUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return pathname;
    }

    return window.location.href;
  }, [pathname]);

  useEffect(() => {
    const stored = parseMarketingConsent(
      window.localStorage.getItem(MARKETING_CONSENT_STORAGE_KEY),
    );
    const initialConsent = stored ?? createConsentState(consentDefault);
    setHasConsentChoice(Boolean(stored) || consentDefault === 'granted');
    setConsent(initialConsent);
    setGoogleConsent({
      adStorage: initialConsent.adStorage,
      analyticsStorage: initialConsent.analyticsStorage,
    });

    if (
      initialConsent.adStorage === 'granted' ||
      initialConsent.analyticsStorage === 'granted'
    ) {
      loadMarketingTags(config);
    }
  }, [config, consentDefault]);

  useEffect(() => {
    if (
      consent?.adStorage !== 'granted' &&
      consent?.analyticsStorage !== 'granted'
    ) {
      return;
    }

    trackWebsiteMarketingEvent(
      {
        name: WEBSITE_MARKETING_EVENTS.PAGE_VIEW,
        payload: {
          path: pathname,
          search,
        },
        url: currentUrl,
      },
      config,
    );

    if (pathname === '/pricing') {
      trackWebsiteMarketingEvent(
        {
          name: WEBSITE_MARKETING_EVENTS.VIEW_PRICING,
          payload: { path: pathname },
          url: currentUrl,
        },
        config,
      );
    }
  }, [config, consent, currentUrl, pathname, search]);

  useEffect(() => {
    const handleTrackedButton = (event: Event) => {
      if (
        consent?.adStorage !== 'granted' &&
        consent?.analyticsStorage !== 'granted'
      ) {
        return;
      }

      const detail = (event as CustomEvent<ButtonTrackedMarketingEventDetail>)
        .detail;

      if (!detail?.trackingName) {
        return;
      }

      const payload = {
        ...(detail.trackingData ?? {}),
        trackingName: detail.trackingName,
      };

      for (const name of deriveMarketingEventsFromCta(payload)) {
        trackWebsiteMarketingEvent(
          {
            name,
            payload,
            url: currentUrl,
          },
          config,
        );
      }
    };

    window.addEventListener(
      'genfeed:marketing:button-click',
      handleTrackedButton,
    );

    return () => {
      window.removeEventListener(
        'genfeed:marketing:button-click',
        handleTrackedButton,
      );
    };
  }, [config, consent, currentUrl]);

  const persistConsent = (nextConsent: MarketingConsentState) => {
    setHasConsentChoice(true);
    setConsent(nextConsent);
    window.localStorage.setItem(
      MARKETING_CONSENT_STORAGE_KEY,
      JSON.stringify(nextConsent),
    );
    setGoogleConsent({
      adStorage: nextConsent.adStorage,
      analyticsStorage: nextConsent.analyticsStorage,
    });

    if (
      nextConsent.adStorage === 'granted' ||
      nextConsent.analyticsStorage === 'granted'
    ) {
      loadMarketingTags(config);
    }
  };

  return (
    <>
      {children}
      {shouldShowBanner ? (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-border bg-background p-4 text-sm text-foreground shadow-xl">
          <p className="mb-3 text-sm leading-6 text-muted-foreground">
            We use optional marketing cookies to measure campaigns and improve
            ads. You can continue without them.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              className="h-9 px-3 text-xs"
              variant={ButtonVariant.OUTLINE}
              type="button"
              onClick={() => persistConsent(createConsentState('denied'))}
            >
              Reject
            </Button>
            <Button
              className="h-9 px-3 text-xs"
              type="button"
              onClick={() => persistConsent(createConsentState('granted'))}
            >
              Accept
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
