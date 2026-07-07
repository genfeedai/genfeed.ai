'use client';

import { hasMarketingConsent, type MarketingConsentState } from './consent';
import {
  BROWSER_AND_SERVER_MARKETING_EVENTS,
  createMarketingEventId,
  type WebsiteMarketingEvent,
} from './events';

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

export interface MarketingTrackingConfig {
  gtmContainerId?: string;
}

export interface TrackWebsiteMarketingEventOptions {
  config: MarketingTrackingConfig;
  consent: MarketingConsentState | null;
}

const loadedScripts = new Set<string>();

function appendScript(id: string, src: string): void {
  if (loadedScripts.has(id) || document.getElementById(id)) {
    loadedScripts.add(id);
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.id = id;
  script.src = src;
  document.head.appendChild(script);
  loadedScripts.add(id);
}

function pushDataLayer(payload: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export function setGoogleConsent({
  adStorage,
  analyticsStorage,
}: {
  adStorage: 'denied' | 'granted';
  analyticsStorage: 'denied' | 'granted';
}): void {
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    ((...args: unknown[]) => {
      window.dataLayer?.push(args as unknown as Record<string, unknown>);
    });

  window.gtag('consent', 'update', {
    ad_storage: adStorage,
    ad_user_data: adStorage,
    ad_personalization: adStorage,
    analytics_storage: analyticsStorage,
  });
}

export function loadMarketingTags(
  config: MarketingTrackingConfig,
  consent: MarketingConsentState | null,
): void {
  if (!hasMarketingConsent(consent)) {
    return;
  }

  if (config.gtmContainerId) {
    pushDataLayer({
      event: 'gtm.js',
      'gtm.start': Date.now(),
    });
    appendScript(
      'genfeed-gtm',
      `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
        config.gtmContainerId,
      )}`,
    );
  }
}

function pushMarketingDataLayerEvent(
  event: Required<Pick<WebsiteMarketingEvent, 'eventId' | 'name'>> &
    WebsiteMarketingEvent,
  consent: MarketingConsentState,
): void {
  const payload = event.payload ?? {};
  const eventUrl =
    event.url || (typeof window !== 'undefined' ? window.location.href : '');

  pushDataLayer({
    event: 'genfeed_marketing_event',
    event_id: event.eventId,
    event_name: event.name,
    event_source_url: eventUrl,
    marketing_consent_ad_storage: consent.adStorage,
    marketing_consent_analytics_storage: consent.analyticsStorage,
    ...payload,
  });
}

function sendServerConversion(event: WebsiteMarketingEvent): void {
  if (!BROWSER_AND_SERVER_MARKETING_EVENTS.has(event.name)) {
    return;
  }

  const body = JSON.stringify({
    eventId: event.eventId,
    name: event.name,
    payload: event.payload ?? {},
    url: event.url || window.location.href,
  });

  if (
    navigator.sendBeacon?.(
      '/api/marketing/conversions',
      new Blob([body], { type: 'application/json' }),
    )
  ) {
    return;
  }

  void fetch('/api/marketing/conversions', {
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  });
}

export function trackWebsiteMarketingEvent(
  event: WebsiteMarketingEvent,
  options: TrackWebsiteMarketingEventOptions,
): string | null {
  if (!hasMarketingConsent(options.consent)) {
    return null;
  }

  const eventId = event.eventId || createMarketingEventId(event.name);
  const nextEvent = { ...event, eventId };

  pushMarketingDataLayerEvent(nextEvent, options.consent);
  sendServerConversion(nextEvent);

  return eventId;
}
