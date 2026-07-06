import type { StripeInvoice } from '@api/services/integrations/stripe/services/stripe.service';
import type { SubscriptionRefId } from '@genfeedai/interfaces/billing';

export type StripeWebhookEvent = {
  data: { object: unknown };
  type: string;
};

export type StripeMetadata = Record<string, string>;

export type StripeRecurringInterval = 'day' | 'week' | 'month' | 'year';

export type AttributionUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export type AttributionMetadata = {
  sourceContentId?: string;
  sourceContentType?: string;
  sourcePlatform?: string;
  sourceLinkId?: string;
  sessionId?: string;
  utm?: AttributionUtm;
};

export type MetadataParseWarning = (
  key: string,
  reason: string | undefined,
) => void;

export function getEmailDomainForLog(
  email: string | null | undefined,
): string | undefined {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return domain || undefined;
}

export function getEmailLogMetadata(email: string | null | undefined): {
  emailDomain?: string;
} {
  const emailDomain = getEmailDomainForLog(email);
  return emailDomain ? { emailDomain } : {};
}

export function normalizeObjectId(
  value: SubscriptionRefId | undefined,
): string {
  if (!value) {
    return 'unknown';
  }

  if (value === '__never__') {
    return value.toString();
  }

  return String(value);
}

/**
 * Stripe SDK v22 moved the invoice→subscription link to
 * `invoice.parent.subscription_details.subscription`; the pre-v22
 * top-level `invoice.subscription` is kept as a fallback for replayed
 * historical events. The value may also arrive as an expanded object.
 */
export function extractInvoiceSubscriptionId(
  invoice: StripeInvoice,
): string | undefined {
  const parentPath = (
    invoice as unknown as {
      parent?: {
        subscription_details?: { subscription?: string | { id?: string } };
      };
    }
  ).parent?.subscription_details?.subscription;
  const legacyPath = (
    invoice as unknown as { subscription?: string | { id?: string } }
  ).subscription;

  const candidate = parentPath ?? legacyPath;

  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }

  if (candidate && typeof candidate === 'object' && candidate.id) {
    return candidate.id;
  }

  return undefined;
}

export function buildCombinedMetadata(
  metadata: StripeMetadata,
  onParseWarning: MetadataParseWarning,
): Record<string, string> {
  const combined: Record<string, string> = {};

  // Filter non-empty string values
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      combined[key] = value;
    }
  }

  // Parse JSON attribution payload if present
  const jsonPayloadKey = Object.keys(combined).find((key) =>
    ['subscriptionAttribution', 'attribution'].includes(key),
  );

  if (jsonPayloadKey) {
    try {
      const parsed = JSON.parse(combined[jsonPayloadKey]);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && value.trim().length > 0) {
            combined[key] = value;
          }
        }
      }
    } catch (error) {
      onParseWarning(jsonPayloadKey, (error as Error)?.message);
    }
  }

  return combined;
}

export function extractAttributionMetadata(
  metadata: StripeMetadata | null | undefined,
  onParseWarning: MetadataParseWarning,
): AttributionMetadata {
  if (!metadata) {
    return {};
  }

  const combined = buildCombinedMetadata(metadata, onParseWarning);

  const getValue = (...keys: string[]): string | undefined => {
    const foundKey = keys.find((k) => combined[k]);
    return foundKey ? combined[foundKey] : undefined;
  };

  const utm = {
    campaign: getValue('utm_campaign', 'utmCampaign'),
    content: getValue('utm_content', 'utmContent'),
    medium: getValue('utm_medium', 'utmMedium'),
    source: getValue('utm_source', 'utmSource'),
  };

  const sanitizedUtm = Object.fromEntries(
    Object.entries(utm).filter(([, value]) => Boolean(value)),
  );

  return {
    sessionId: getValue('sessionId', 'session_id', 'trackingSessionId'),
    sourceContentId: getValue(
      'sourceContentId',
      'contentId',
      'source_content_id',
    ),
    sourceContentType: getValue(
      'sourceContentType',
      'contentType',
      'source_content_type',
    ),
    sourceLinkId: getValue('sourceLinkId', 'linkId', 'source_link_id'),
    sourcePlatform: getValue('sourcePlatform', 'platform', 'source_platform'),
    utm: Object.keys(sanitizedUtm).length
      ? (sanitizedUtm as AttributionUtm)
      : undefined,
  };
}
