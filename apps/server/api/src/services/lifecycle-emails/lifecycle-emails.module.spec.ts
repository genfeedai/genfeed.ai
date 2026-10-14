import { EmailProductSignalsModule } from '@api/services/email-product-signals/email-product-signals.module';
import { describe, expect, it } from 'vitest';
import { LifecycleEmailsModule } from './lifecycle-emails.module';

describe('LifecycleEmailsModule', () => {
  it('registers the product-signal executors wherever the organization workflow is registered', () => {
    // The API process loads this module without the workers' cron module, and
    // its bootstrap rejects a workflow node whose action has no executor.
    const imports: unknown[] =
      Reflect.getMetadata('imports', LifecycleEmailsModule) ?? [];
    expect(imports).toContain(EmailProductSignalsModule);
  });
});
