import { createHash } from 'node:crypto';
import {
  BROWSER_AND_SERVER_MARKETING_EVENTS,
  isWebsiteMarketingEventName,
  type MarketingEventPayload,
  META_EVENT_NAMES,
  type WebsiteMarketingEventName,
  X_EVENT_NAMES,
} from './events';

export interface ServerConversionRequest {
  eventId: string;
  name: WebsiteMarketingEventName;
  payload?: MarketingEventPayload;
  url?: string;
}

export interface ServerConversionContext {
  clientIp?: string;
  userAgent?: string;
}

export interface ServerConversionConfig {
  metaAccessToken?: string;
  metaGraphVersion?: string;
  metaPixelId?: string;
  xApiEndpoint?: string;
  xBearerToken?: string;
  xEventIds?: Partial<Record<WebsiteMarketingEventName, string>>;
}

export interface ServerConversionResult {
  meta: 'configured' | 'failed' | 'skipped';
  x: 'configured' | 'failed' | 'skipped';
}

const CONVERSION_API_TIMEOUT_MS = 5000;

export function parseServerConversionRequest(
  input: unknown,
): ServerConversionRequest | null {
  const body = input as Partial<ServerConversionRequest>;

  if (
    typeof body.eventId !== 'string' ||
    !isWebsiteMarketingEventName(body.name) ||
    !BROWSER_AND_SERVER_MARKETING_EVENTS.has(body.name)
  ) {
    return null;
  }

  return {
    eventId: body.eventId,
    name: body.name,
    payload:
      body.payload && typeof body.payload === 'object' ? body.payload : {},
    url: typeof body.url === 'string' ? body.url : undefined,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function getUserData(
  event: ServerConversionRequest,
  context: ServerConversionContext,
): Record<string, string> {
  const userData: Record<string, string> = {};

  if (context.clientIp) {
    userData.client_ip_address = context.clientIp;
  }

  if (context.userAgent) {
    userData.client_user_agent = context.userAgent;
  }

  if (typeof event.payload?.email === 'string' && event.payload.email) {
    userData.em = sha256(event.payload.email);
  }

  if (typeof event.payload?.phone === 'string' && event.payload.phone) {
    userData.ph = sha256(event.payload.phone);
  }

  return userData;
}

function getMetaEndpoint(config: ServerConversionConfig): string | null {
  if (!config.metaPixelId || !config.metaAccessToken) {
    return null;
  }

  const version = config.metaGraphVersion || 'v25.0';

  return `https://graph.facebook.com/${version}/${config.metaPixelId}/events?access_token=${encodeURIComponent(
    config.metaAccessToken,
  )}`;
}

function getDefaultXEventIds(): Partial<
  Record<WebsiteMarketingEventName, string>
> {
  return {
    book_call: process.env.NEXT_PUBLIC_X_BOOK_CALL_EVENT_ID,
    cta_click: process.env.NEXT_PUBLIC_X_CTA_CLICK_EVENT_ID,
    lead_submit: process.env.NEXT_PUBLIC_X_LEAD_SUBMIT_EVENT_ID,
    signup_complete: process.env.NEXT_PUBLIC_X_SIGNUP_COMPLETE_EVENT_ID,
    start_signup: process.env.NEXT_PUBLIC_X_START_SIGNUP_EVENT_ID,
    view_pricing: process.env.NEXT_PUBLIC_X_VIEW_PRICING_EVENT_ID,
  };
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONVERSION_API_TIMEOUT_MS,
  );

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
  });
}

export async function sendServerConversions(
  event: ServerConversionRequest,
  context: ServerConversionContext,
  config: ServerConversionConfig = {
    metaAccessToken: process.env.META_CONVERSIONS_API_ACCESS_TOKEN,
    metaGraphVersion: process.env.META_CONVERSIONS_API_GRAPH_VERSION,
    metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    xApiEndpoint: process.env.X_CONVERSIONS_API_ENDPOINT,
    xBearerToken: process.env.X_CONVERSIONS_API_BEARER_TOKEN,
    xEventIds: getDefaultXEventIds(),
  },
): Promise<ServerConversionResult> {
  const userData = getUserData(event, context);
  const calls: Array<{
    provider: keyof ServerConversionResult;
    request: Promise<Response>;
  }> = [];
  const result: ServerConversionResult = {
    meta: 'skipped',
    x: 'skipped',
  };
  const metaEndpoint = getMetaEndpoint(config);

  if (metaEndpoint) {
    result.meta = 'configured';
    calls.push({
      provider: 'meta',
      request: fetchWithTimeout(metaEndpoint, {
        body: JSON.stringify({
          data: [
            {
              action_source: 'website',
              event_id: event.eventId,
              event_name: META_EVENT_NAMES[event.name],
              event_source_url: event.url,
              event_time: Math.floor(Date.now() / 1000),
              user_data: userData,
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    });
  }

  if (config.xApiEndpoint && config.xBearerToken) {
    const xEventId =
      config.xEventIds?.[event.name] || X_EVENT_NAMES[event.name];

    result.x = 'configured';
    calls.push({
      provider: 'x',
      request: fetchWithTimeout(config.xApiEndpoint, {
        body: JSON.stringify({
          conversions: [
            {
              conversion_time: new Date().toISOString(),
              event_id: event.eventId,
              event_name: xEventId,
              event_source_url: event.url,
              identifiers: {
                ip_address: context.clientIp,
                user_agent: context.userAgent,
              },
            },
          ],
        }),
        headers: {
          Authorization: `Bearer ${config.xBearerToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    });
  }

  const outcomes = await Promise.allSettled(calls.map((call) => call.request));
  outcomes.forEach((outcome, index) => {
    const provider = calls[index]?.provider;
    if (!provider) {
      return;
    }

    if (
      outcome.status === 'rejected' ||
      (outcome.status === 'fulfilled' && !outcome.value.ok)
    ) {
      result[provider] = 'failed';
    }
  });

  return result;
}
