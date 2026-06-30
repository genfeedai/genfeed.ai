'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadMarketingTags,
  type MarketingTrackingConfig,
  setGoogleConsent,
  trackWebsiteMarketingEvent,
} from './browser';
import {
  createConsentState,
  hasMarketingConsent,
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

interface MarketingPageTrackerProps {
  config: MarketingTrackingConfig;
  consent: MarketingConsentState | null;
  pathname: string;
}

const hasConfiguredMarketingTag = (config: MarketingTrackingConfig): boolean =>
  Boolean(
    config.gaId ||
      config.gtmContainerId ||
      config.linkedinPartnerId ||
      config.metaPixelId ||
      config.xPixelId,
  );

/**
 * Renders no UI — owns the page-view and CTA tracking effects that depend on
 * `useSearchParams`. Isolated behind a <Suspense> boundary so calling
 * `useSearchParams` does not opt the whole route into client-side rendering.
 */
function MarketingPageTracker({
  config,
  consent,
  pathname,
}: MarketingPageTrackerProps) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const currentUrl = useMemo(() => {
    const pathWithSearch = search ? `${pathname}?${search}` : pathname;

    if (typeof window === 'undefined') {
      return pathWithSearch;
    }

    return `${window.location.origin}${pathWithSearch}${window.location.hash}`;
  }, [pathname, search]);

  // Keep a stable ref to the latest consent so the event listener and page-view
  // effect can read it without re-registering on every consent update.
  const consentRef = useRef(consent);
  consentRef.current = consent;

  useEffect(() => {
    if (!hasMarketingConsent(consent)) {
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
      const currentConsent = consentRef.current;
      if (!hasMarketingConsent(currentConsent)) {
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
  }, [config, currentUrl]);

  return null;
}

export default function MarketingTrackingProvider({
  children,
  config,
  consentDefault = 'denied',
}: MarketingTrackingProviderProps) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<MarketingConsentState | null>(null);
  const hasStoredConsentRef = useRef(false);
  // Derive: banner shows when no stored/accepted choice has been made yet and tags are configured.
  // Before mount effect runs, consent is null so we treat it as "no choice".
  const hasConsentChoice =
    hasStoredConsentRef.current || consentDefault === 'granted';
  const shouldShowBanner =
    consent !== null && !hasConsentChoice && hasConfiguredMarketingTag(config);

  useEffect(() => {
    const stored = parseMarketingConsent(
      window.localStorage.getItem(MARKETING_CONSENT_STORAGE_KEY),
    );
    hasStoredConsentRef.current = Boolean(stored);
    const initialConsent = stored ?? createConsentState(consentDefault);
    setConsent(initialConsent);
    setGoogleConsent({
      adStorage: initialConsent.adStorage,
      analyticsStorage: initialConsent.analyticsStorage,
    });

    if (hasMarketingConsent(initialConsent)) {
      loadMarketingTags(config);
    }
  }, [config, consentDefault]);

  const persistConsent = (nextConsent: MarketingConsentState) => {
    hasStoredConsentRef.current = true;
    setConsent(nextConsent);
    window.localStorage.setItem(
      MARKETING_CONSENT_STORAGE_KEY,
      JSON.stringify(nextConsent),
    );
    setGoogleConsent({
      adStorage: nextConsent.adStorage,
      analyticsStorage: nextConsent.analyticsStorage,
    });

    if (hasMarketingConsent(nextConsent)) {
      loadMarketingTags(config);
    }
  };

  return (
    <>
      {children}
      <Suspense fallback={null}>
        <MarketingPageTracker
          config={config}
          consent={consent}
          pathname={pathname}
        />
      </Suspense>
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
