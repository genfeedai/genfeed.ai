import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';

describe('StripeCoreModule', () => {
  it('should be defined', () => {
    expect(StripeCoreModule).toBeDefined();
  });

  it('exports the Stripe client without importing billing modules', () => {
    const source = readFileSync(
      join(__dirname, 'stripe-core.module.ts'),
      'utf8',
    );

    expect(source).toContain('exports: [StripeService]');
    expect(source).not.toContain('SubscriptionsModule');
    expect(source).not.toMatch(
      /from '@api\/services\/integrations\/stripe\/stripe\.module'/,
    );
  });
});
