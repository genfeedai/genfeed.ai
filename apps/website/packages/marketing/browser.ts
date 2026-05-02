'use client';

import { track } from '@vercel/analytics';
import {
  BROWSER_AND_SERVER_MARKETING_EVENTS,
  createMarketingEventId,
  LINKEDIN_EVENT_NAMES,
  type MarketingEventPayload,
  META_EVENT_NAMES,
  WEBSITE_MARKETING_EVENTS,
  type WebsiteMarketingEvent,
  X_EVENT_NAMES,
} from './events';

declare global {
  interface Window {
    _linkedin_data_partner_ids?: string[];
    _linkedin_partner_id?: string;
    dataLayer?: Array<Record<string, unknown>>;
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    lintrk?: (command: string, payload: Record<string, unknown>) => void;
    twq?: (...args: unknown[]) => void;
  }
}

export interface MarketingTrackingConfig {
  gaId?: string;
  gtmContainerId?: string;
  linkedinPartnerId?: string;
  metaPixelId?: string;
  xPixelId?: string;
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

export function loadMarketingTags(config: MarketingTrackingConfig): void {
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

  if (config.gaId) {
    appendScript(
      'genfeed-ga4',
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
        config.gaId,
      )}`,
    );
    window.gtag?.('js', new Date());
    window.gtag?.('config', config.gaId, {
      send_page_view: false,
    });
  }

  if (config.metaPixelId) {
    window.fbq =
      window.fbq ||
      ((...args: unknown[]) => {
        pushDataLayer({ event: 'meta.pixel.queue', args });
      });
    appendScript(
      'genfeed-meta-pixel',
      'https://connect.facebook.net/en_US/fbevents.js',
    );
    window.fbq('init', config.metaPixelId);
  }

  if (config.linkedinPartnerId) {
    window._linkedin_partner_id = config.linkedinPartnerId;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    if (!window._linkedin_data_partner_ids.includes(config.linkedinPartnerId)) {
      window._linkedin_data_partner_ids.push(config.linkedinPartnerId);
    }
    appendScript(
      'genfeed-linkedin-insight',
      'https://snap.licdn.com/li.lms-analytics/insight.min.js',
    );
  }

  if (config.xPixelId) {
    window.twq =
      window.twq ||
      ((...args: unknown[]) => {
        pushDataLayer({ event: 'x.pixel.queue', args });
      });
    appendScript('genfeed-x-pixel', 'https://static.ads-twitter.com/uwt.js');
    window.twq('config', config.xPixelId);
  }
}

function dispatchBrowserVendorEvents(
  event: Required<Pick<WebsiteMarketingEvent, 'eventId' | 'name'>> &
    WebsiteMarketingEvent,
  config: MarketingTrackingConfig,
): void {
  const payload = event.payload ?? {};
  const eventUrl =
    event.url || (typeof window !== 'undefined' ? window.location.href : '');

  pushDataLayer({
    event: 'genfeed_marketing_event',
    event_id: event.eventId,
    event_name: event.name,
    event_source_url: eventUrl,
    ...payload,
  });

  if (config.gaId) {
    window.gtag?.('event', event.name, {
      event_id: event.eventId,
      event_source_url: eventUrl,
      ...payload,
    });
  }

  if (config.metaPixelId) {
    window.fbq?.('track', META_EVENT_NAMES[event.name], payload, {
      eventID: event.eventId,
    });
  }

  if (
    config.linkedinPartnerId &&
    event.name !== WEBSITE_MARKETING_EVENTS.PAGE_VIEW
  ) {
    window.lintrk?.('track', {
      conversion_id: LINKEDIN_EVENT_NAMES[event.name],
    });
  }

  if (config.xPixelId) {
    window.twq?.('event', X_EVENT_NAMES[event.name], {
      event_id: event.eventId,
      ...payload,
    });
  }
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

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/marketing/conversions',
      new Blob([body], { type: 'application/json' }),
    );
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
  config: MarketingTrackingConfig,
): string {
  const eventId = event.eventId || createMarketingEventId(event.name);
  const nextEvent = { ...event, eventId };

  track(event.name, {
    eventId,
    ...(event.payload as MarketingEventPayload | undefined),
  });
  dispatchBrowserVendorEvents(nextEvent, config);
  sendServerConversion(nextEvent);

  return eventId;
}
