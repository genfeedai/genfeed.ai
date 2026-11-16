import { PublishErrorKind } from '@genfeedai/contracts';
import type {
  IShopifyGraphQLError,
  IShopifyProductCreateResponse,
  IShopifyUserError,
} from '@genfeedai/contracts/interfaces';
import { PublishError } from '@genfeedai/contracts/interfaces';

type ShopifyGraphQLResponse = Pick<
  IShopifyProductCreateResponse,
  'errors' | 'extensions'
>;

/**
 * How long until the leaky bucket holds enough points for the rejected query,
 * from the cost and throttle status Shopify returns with it. Undefined when
 * Shopify did not send them.
 */
function readThrottleWaitMs(
  response: ShopifyGraphQLResponse,
): number | undefined {
  const cost = response.extensions?.cost;
  const status = cost?.throttleStatus;
  if (
    cost?.requestedQueryCost === undefined ||
    status === undefined ||
    !(status.restoreRate > 0)
  ) {
    return undefined;
  }
  const missing = cost.requestedQueryCost - status.currentlyAvailable;
  return missing > 0 ? Math.ceil((missing / status.restoreRate) * 1000) : 0;
}

function kindForCode(code: string | undefined): PublishErrorKind {
  switch (code) {
    case 'THROTTLED':
      return PublishErrorKind.RATE_LIMITED;
    case 'ACCESS_DENIED':
    case 'SHOP_INACTIVE':
      return PublishErrorKind.CHANNEL_DISCONNECTED;
    case 'INTERNAL_SERVER_ERROR':
      return PublishErrorKind.OUTCOME_UNKNOWN;
    default:
      // A query Shopify refused to run (bad field, bad argument) published
      // nothing and retrying the same input cannot succeed.
      return PublishErrorKind.CONTENT_REJECTED;
  }
}

/**
 * The typed failure for a GraphQL response whose top-level `errors` array is
 * set. Shopify returns these with HTTP 200, so no HTTP status is available.
 */
export function toShopifyGraphQLPublishError(
  response: ShopifyGraphQLResponse,
  errors: IShopifyGraphQLError[],
): PublishError {
  const [first] = errors;
  const code = first?.extensions?.code;
  const kind = kindForCode(code);
  return new PublishError(
    kind,
    `Shopify answered with ${code ?? 'an error'}: ${errors
      .map((error) => error.message)
      .join('; ')}`,
    {
      cause: errors,
      providerCode: code,
      retryAfterMs:
        kind === PublishErrorKind.RATE_LIMITED
          ? readThrottleWaitMs(response)
          : undefined,
    },
  );
}

/** `userErrors` mean Shopify refused the input; nothing was created. */
export function toShopifyUserErrorsPublishError(
  userErrors: IShopifyUserError[],
): PublishError {
  return new PublishError(
    PublishErrorKind.CONTENT_REJECTED,
    `Shopify rejected the product: ${userErrors
      .map((error) =>
        error.field?.length
          ? `${[error.field].flat().join('.')}: ${error.message}`
          : error.message,
      )
      .join('; ')}`,
    { cause: userErrors },
  );
}
