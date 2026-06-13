/**
 * Subscriptions collection module.
 *
 * OSS-native: the module class lives in the api tree and never imports
 * enterprise billing code. Its `@Module()` metadata is composed from the
 * `@billing-providers` alias, which webpack swaps for the EE fragment
 * (`billing.providers.ee.ts`) in the SaaS image or the OSS stub fragment
 * (`billing.providers.oss.ts`) in the community image. Nest reads decorator
 * metadata at definition time, so handing it the imported fragment object is
 * equivalent to writing the metadata inline.
 */

import { subscriptions } from '@billing-providers';
import { Module } from '@nestjs/common';

@Module(subscriptions)
export class SubscriptionsModule {}
