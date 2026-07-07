import { describe, expect, it } from 'vitest';
import {
  buildLifecycleSystemEmailAction,
  getLifecycleSystemEmailDefinition,
  LIFECYCLE_SYSTEM_EMAILS,
  renderLifecycleSystemEmailParagraphs,
} from './lifecycle-emails.constant';

describe('lifecycle-emails.constant', () => {
  it('registers the lifecycle system emails surfaced in admin', () => {
    expect(LIFECYCLE_SYSTEM_EMAILS.map((email) => email.step)).toEqual([
      'welcome-day-0',
      'welcome-day-2',
      'welcome-day-7',
      'activation-nudge',
      'checkout-recovery',
      'win-back',
    ]);
    expect(
      LIFECYCLE_SYSTEM_EMAILS.every(
        (email) => email.visibility === 'admin-only',
      ),
    ).toBe(true);
  });

  it('renders personalized copy from the shared registry', () => {
    const welcome = getLifecycleSystemEmailDefinition('welcome-day-0');

    expect(welcome).toBeDefined();
    if (!welcome) {
      return;
    }

    expect(welcome?.subject).toBe('Welcome to Genfeed.ai');
    expect(renderLifecycleSystemEmailParagraphs(welcome, 'Hi Vincent')[0]).toBe(
      'Hi Vincent, welcome to Genfeed.ai.',
    );
  });

  it('resolves checkout recovery actions with a checkout URL fallback', () => {
    const checkout = getLifecycleSystemEmailDefinition('checkout-recovery');

    expect(checkout).toBeDefined();
    if (!checkout) {
      return;
    }

    expect(
      buildLifecycleSystemEmailAction(
        checkout,
        'https://app.genfeed.ai/',
        'https://billing.example/checkout',
      ),
    ).toEqual({
      label: 'Return to checkout',
      url: 'https://billing.example/checkout',
    });

    expect(
      buildLifecycleSystemEmailAction(checkout, 'https://app.genfeed.ai/'),
    ).toEqual({
      label: 'Open Genfeed',
      url: 'https://app.genfeed.ai',
    });
  });
});
