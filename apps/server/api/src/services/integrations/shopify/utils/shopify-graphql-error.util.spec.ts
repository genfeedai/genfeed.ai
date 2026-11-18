import {
  toShopifyGraphQLPublishError,
  toShopifyUserErrorsPublishError,
} from '@api/services/integrations/shopify/utils/shopify-graphql-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('toShopifyGraphQLPublishError', () => {
  it.each([
    ['ACCESS_DENIED', PublishErrorKind.CHANNEL_DISCONNECTED],
    ['SHOP_INACTIVE', PublishErrorKind.CHANNEL_DISCONNECTED],
    ['INTERNAL_SERVER_ERROR', PublishErrorKind.OUTCOME_UNKNOWN],
    ['argumentLiteralsIncompatible', PublishErrorKind.CONTENT_REJECTED],
  ])('maps %s to %s', (code, kind) => {
    const error = toShopifyGraphQLPublishError({}, [
      { extensions: { code }, message: 'failed' },
    ]);

    expect(error.kind).toBe(kind);
    expect(error.providerCode).toBe(code);
  });

  it('waits for the bucket to refill the points the rejected query needed', () => {
    const error = toShopifyGraphQLPublishError(
      {
        extensions: {
          cost: {
            requestedQueryCost: 100,
            throttleStatus: {
              currentlyAvailable: 50,
              maximumAvailable: 1000,
              restoreRate: 50,
            },
          },
        },
      },
      [{ extensions: { code: 'THROTTLED' }, message: 'Throttled' }],
    );

    expect(error.kind).toBe(PublishErrorKind.RATE_LIMITED);
    expect(error.retryAfterMs).toBe(1000);
  });

  it('reports no wait when Shopify sent no cost', () => {
    const error = toShopifyGraphQLPublishError({}, [
      { extensions: { code: 'THROTTLED' }, message: 'Throttled' },
    ]);

    expect(error.kind).toBe(PublishErrorKind.RATE_LIMITED);
    expect(error.retryAfterMs).toBeUndefined();
  });
});

describe('toShopifyUserErrorsPublishError', () => {
  it('rejects the content and names the field', () => {
    const error = toShopifyUserErrorsPublishError([
      { field: ['input', 'title'], message: 'Title is too long' },
    ]);

    expect(error.kind).toBe(PublishErrorKind.CONTENT_REJECTED);
    expect(error.message).toBe(
      'Shopify rejected the product: input.title: Title is too long',
    );
  });
});
