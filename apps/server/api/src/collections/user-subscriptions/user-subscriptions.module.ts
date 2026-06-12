/**
 * User subscriptions collection module.
 *
 * OSS-native: composes its `@Module()` metadata from the `@billing-providers`
 * alias (EE fragment in the SaaS image, OSS stub fragment in the community
 * image). See `subscriptions.module.ts` for the full rationale.
 */

import { userSubscriptions } from '@billing-providers';
import { Module } from '@nestjs/common';

@Module(userSubscriptions)
export class UserSubscriptionsModule {}
