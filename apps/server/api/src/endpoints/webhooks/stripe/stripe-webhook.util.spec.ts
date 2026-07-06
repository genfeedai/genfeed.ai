import {
  buildCombinedMetadata,
  extractAttributionMetadata,
  extractInvoiceSubscriptionId,
  getEmailDomainForLog,
  getEmailLogMetadata,
  normalizeObjectId,
} from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import type { StripeInvoice } from '@api/services/integrations/stripe/services/stripe.service';
import { describe, expect, it, vi } from 'vitest';

function invoiceWith(overrides: Record<string, unknown>): StripeInvoice {
  return { id: 'in_1', ...overrides } as unknown as StripeInvoice;
}

describe('normalizeObjectId', () => {
  it('returns "unknown" for missing values', () => {
    expect(normalizeObjectId(undefined)).toBe('unknown');
  });

  it('stringifies present values', () => {
    expect(normalizeObjectId('org_1' as never)).toBe('org_1');
  });
});

describe('getEmailLogMetadata', () => {
  it('keeps only the normalized email domain for log correlation', () => {
    expect(getEmailDomainForLog('Ada@Example.COM')).toBe('example.com');
    expect(getEmailLogMetadata('Ada@Example.COM')).toEqual({
      emailDomain: 'example.com',
    });
  });

  it('omits malformed or missing email addresses', () => {
    expect(getEmailLogMetadata('ada')).toEqual({});
    expect(getEmailLogMetadata(undefined)).toEqual({});
  });
});

describe('extractInvoiceSubscriptionId', () => {
  it('reads the v22 parent path', () => {
    expect(
      extractInvoiceSubscriptionId(
        invoiceWith({
          parent: { subscription_details: { subscription: 'sub_parent' } },
        }),
      ),
    ).toBe('sub_parent');
  });

  it('falls back to the legacy top-level path', () => {
    expect(
      extractInvoiceSubscriptionId(invoiceWith({ subscription: 'sub_legacy' })),
    ).toBe('sub_legacy');
  });

  it('unwraps expanded subscription objects', () => {
    expect(
      extractInvoiceSubscriptionId(
        invoiceWith({
          parent: {
            subscription_details: { subscription: { id: 'sub_expanded' } },
          },
        }),
      ),
    ).toBe('sub_expanded');
  });

  it('prefers the parent path over the legacy path', () => {
    expect(
      extractInvoiceSubscriptionId(
        invoiceWith({
          parent: { subscription_details: { subscription: 'sub_parent' } },
          subscription: 'sub_legacy',
        }),
      ),
    ).toBe('sub_parent');
  });

  it('returns undefined when no path carries a subscription', () => {
    expect(extractInvoiceSubscriptionId(invoiceWith({}))).toBeUndefined();
  });
});

describe('buildCombinedMetadata', () => {
  it('keeps non-empty string values only', () => {
    const onWarn = vi.fn();

    expect(buildCombinedMetadata({ a: 'x', b: '', c: '  ' }, onWarn)).toEqual({
      a: 'x',
    });
    expect(onWarn).not.toHaveBeenCalled();
  });

  it('merges a JSON attribution payload into the metadata', () => {
    const onWarn = vi.fn();

    expect(
      buildCombinedMetadata(
        {
          attribution: JSON.stringify({ utm_source: 'newsletter' }),
          plain: 'kept',
        },
        onWarn,
      ),
    ).toEqual({
      attribution: JSON.stringify({ utm_source: 'newsletter' }),
      plain: 'kept',
      utm_source: 'newsletter',
    });
  });

  it('reports invalid JSON payloads through the warning callback', () => {
    const onWarn = vi.fn();

    buildCombinedMetadata({ attribution: '{not-json' }, onWarn);

    expect(onWarn).toHaveBeenCalledWith('attribution', expect.any(String));
  });
});

describe('extractAttributionMetadata', () => {
  const noWarn = vi.fn();

  it('returns an empty object for missing metadata', () => {
    expect(extractAttributionMetadata(null, noWarn)).toEqual({});
    expect(extractAttributionMetadata(undefined, noWarn)).toEqual({});
  });

  it('maps snake_case and camelCase keys to attribution fields', () => {
    expect(
      extractAttributionMetadata(
        {
          contentId: 'content_1',
          session_id: 'sess_1',
          source_platform: 'youtube',
          sourceLinkId: 'link_1',
          utm_campaign: 'launch',
          utmSource: 'newsletter',
        },
        noWarn,
      ),
    ).toEqual({
      sessionId: 'sess_1',
      sourceContentId: 'content_1',
      sourceContentType: undefined,
      sourceLinkId: 'link_1',
      sourcePlatform: 'youtube',
      utm: { campaign: 'launch', source: 'newsletter' },
    });
  });

  it('omits the utm object when no utm keys are present', () => {
    expect(
      extractAttributionMetadata({ sourcePlatform: 'youtube' }, noWarn).utm,
    ).toBeUndefined();
  });
});
