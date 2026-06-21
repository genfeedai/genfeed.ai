/**
 * Re-export shim: `SubscriptionsService` as a concrete class token.
 *
 * The OSS API uses the `SUBSCRIPTIONS_SERVICE` injection token (a string
 * constant) so that the EE billing package can swap in its own implementation
 * without this file existing at all. However, the test suite
 * (`test/integration/payment-processing.integration.spec.ts`) was written
 * before the token-based pattern landed and imports `SubscriptionsService`
 * directly from this path to use it as a NestJS `provide:` token in its
 * `useValue` mock.
 *
 * This shim exposes a plain class of the same name so the import resolves and
 * the DI token works. Nothing instantiates this class in OSS code — it is
 * only used as a reference value in `Test.createTestingModule({ providers:
 * [{ provide: SubscriptionsService, useValue: mockObject }] })`.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class SubscriptionsService {
  // Intentionally empty — this class exists only as a DI token shim.
  // Real subscription logic lives in ee/packages/billing (EE) or
  // OssSubscriptionsService (OSS), both bound to SUBSCRIPTIONS_SERVICE.
}
