import {
  META_EVENT_NAMES,
  WEBSITE_MARKETING_EVENTS,
  type WebsiteMarketingEventName,
  X_EVENT_NAMES,
} from './events';

export type MarketingRetargetingProvider = 'linkedin' | 'meta' | 'x';

export type MarketingRetargetingConversionIds = Partial<
  Record<WebsiteMarketingEventName, string>
>;

export type MarketingRetargetingProviderConfig =
  | {
      provider: 'meta';
      pixelId: string;
    }
  | {
      conversionIds?: MarketingRetargetingConversionIds;
      partnerId: string;
      provider: 'linkedin';
    }
  | {
      eventIds?: MarketingRetargetingConversionIds;
      pixelId: string;
      provider: 'x';
    };

export interface MarketingRetargetingRoute {
  accountId: string;
  conversionId?: string;
  eventName: string;
  provider: MarketingRetargetingProvider;
}

export const LINKEDIN_EVENT_NAMES: Record<WebsiteMarketingEventName, string> = {
  [WEBSITE_MARKETING_EVENTS.BOOK_CALL]: 'book_call',
  [WEBSITE_MARKETING_EVENTS.CTA_CLICK]: 'click',
  [WEBSITE_MARKETING_EVENTS.LEAD_SUBMIT]: 'lead',
  [WEBSITE_MARKETING_EVENTS.PAGE_VIEW]: 'page_view',
  [WEBSITE_MARKETING_EVENTS.SIGNUP_COMPLETE]: 'signup',
  [WEBSITE_MARKETING_EVENTS.START_SIGNUP]: 'start_signup',
  [WEBSITE_MARKETING_EVENTS.VIEW_PRICING]: 'view_pricing',
};

const getValue = (value: string | undefined): string | null => {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
};

export function getRetargetingRoutes(
  eventName: WebsiteMarketingEventName,
  providers: MarketingRetargetingProviderConfig[] = [],
): MarketingRetargetingRoute[] {
  const routes: MarketingRetargetingRoute[] = [];

  for (const providerConfig of providers) {
    if (providerConfig.provider === 'meta') {
      const pixelId = getValue(providerConfig.pixelId);

      if (!pixelId) {
        continue;
      }

      routes.push({
        accountId: pixelId,
        eventName: META_EVENT_NAMES[eventName],
        provider: providerConfig.provider,
      });
      continue;
    }

    if (providerConfig.provider === 'linkedin') {
      const partnerId = getValue(providerConfig.partnerId);

      if (!partnerId) {
        continue;
      }

      const conversionId = getValue(providerConfig.conversionIds?.[eventName]);

      routes.push({
        accountId: partnerId,
        ...(conversionId ? { conversionId } : {}),
        eventName: LINKEDIN_EVENT_NAMES[eventName],
        provider: providerConfig.provider,
      });
      continue;
    }

    const pixelId = getValue(providerConfig.pixelId);

    if (!pixelId) {
      continue;
    }

    const conversionId = getValue(providerConfig.eventIds?.[eventName]);

    routes.push({
      accountId: pixelId,
      ...(conversionId ? { conversionId } : {}),
      eventName: X_EVENT_NAMES[eventName],
      provider: providerConfig.provider,
    });
  }

  return routes;
}
