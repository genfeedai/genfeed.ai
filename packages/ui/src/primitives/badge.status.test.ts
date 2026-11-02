import { describe, expect, it } from 'vitest';
import { getBadgeStatus } from './badge.status';

describe('getBadgeStatus', () => {
  it.each([
    ['onboarding', 'Onboarding', 'warning'],
    ['free', 'Free', 'secondary'],
    ['trial', 'Trial', 'info'],
    ['subscribed', 'Subscribed', 'success'],
    ['pastdue', 'Past Due', 'warning'],
    ['cancelled', 'Cancelled', 'secondary'],
    ['provisioning', 'Provisioning', 'info'],
    ['provisioned', 'Provisioned', 'success'],
    ['invited', 'Invited', 'warning'],
    ['claimed', 'Claimed', 'success'],
    ['failed', 'Failed', 'destructive'],
    ['verified', 'Verified', 'success'],
    ['discrepant', 'Discrepant', 'destructive'],
    ['unresolved', 'Unresolved', 'warning'],
  ])('maps %s to the %s label and %s variant', (status, label, variant) => {
    expect(getBadgeStatus(status)).toMatchObject({ label, variant });
  });

  it('names an unknown status instead of rendering it blank', () => {
    expect(getBadgeStatus('on_hold')).toMatchObject({
      label: 'On Hold',
      variant: 'default',
    });
  });
});
