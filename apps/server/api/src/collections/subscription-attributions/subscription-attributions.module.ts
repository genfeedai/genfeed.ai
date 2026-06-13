/**
 * Subscription attributions collection module.
 *
 * OSS-native: composes its `@Module()` metadata from the `@billing-providers`
 * alias (EE fragment in the SaaS image, OSS stub fragment in the community
 * image). See `subscriptions.module.ts` for the full rationale.
 */

import { subscriptionAttributions } from '@billing-providers';
import { Module } from '@nestjs/common';

@Module(subscriptionAttributions)
export class SubscriptionAttributionsModule {}
