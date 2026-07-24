/**
 * Subscription request DTOs.
 *
 * Canonical in the OSS API (`@api/collections/subscriptions/dto`) — the OSS
 * side owns these because `IsEntityId` and the Stripe controller live there,
 * and `ee/` already resolves `@api/*`. Re-exported (value, not type) so
 * `PartialType(CreateSubscriptionDto)`, `@Body()` metadata, and the barrel all
 * keep working from this path.
 */
export {
  CreateCheckoutSessionDto,
  CreateSubscriptionDto,
  CreateSubscriptionPreviewDto,
} from '@api/collections/subscriptions/dto/create-subscription.dto';
