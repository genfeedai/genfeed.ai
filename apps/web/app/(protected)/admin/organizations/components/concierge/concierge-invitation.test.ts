import type { IWarmupAccount } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  canResendInvitation,
  canRevokeInvitation,
  canSendInvitation,
  getInvitationStatusKey,
  isConciergeClosed,
} from './concierge-invitation';

function account(overrides: Partial<IWarmupAccount>): IWarmupAccount {
  return {
    readiness: { availableCredits: 1, blockers: [], ready: true },
    status: 'PROVISIONED',
    ...overrides,
  } as IWarmupAccount;
}

const invitation = (status: string) =>
  ({ status }) as IWarmupAccount['invitation'];

describe('concierge invitation rules', () => {
  it.each([
    ['PROVISIONED', false],
    ['INVITED', false],
    ['CLAIMED', true],
    ['ARCHIVED', true],
  ] as const)('treats a %s account as closed: %s', (status, expected) => {
    expect(isConciergeClosed(account({ status }))).toBe(expected);
  });

  it.each([
    ['a ready account with no invitation', account({}), true],
    [
      'a ready failed account with no invitation',
      account({ status: 'FAILED' }),
      true,
    ],
    [
      'an account that is not ready',
      account({
        readiness: { availableCredits: 0, blockers: ['x'], ready: false },
      }),
      false,
    ],
    [
      'an account that already has an invitation',
      account({ invitation: invitation('pending') }),
      false,
    ],
    ['a claimed account', account({ status: 'CLAIMED' }), false],
    ['a draft account', account({ status: 'DRAFT' }), false],
  ])('send is allowed for %s: %s', (_name, value, expected) => {
    expect(canSendInvitation(value)).toBe(expected);
  });

  it.each([
    ['pending', true],
    ['delivered', true],
    ['delivery-failed', true],
    ['expired', true],
    ['accepted', false],
    ['revoked', false],
  ])('resend of a %s invitation is allowed: %s', (status, expected) => {
    expect(
      canResendInvitation(account({ invitation: invitation(status) })),
    ).toBe(expected);
  });

  it.each([
    ['pending', true],
    ['delivered', true],
    ['accepted', false],
    ['revoked', false],
  ])('revoking a %s invitation is allowed: %s', (status, expected) => {
    expect(
      canRevokeInvitation(account({ invitation: invitation(status) })),
    ).toBe(expected);
  });

  it('cannot revoke an invitation that does not exist', () => {
    expect(canRevokeInvitation(account({}))).toBe(false);
  });

  it.each([
    ['accepted', 'statusAccepted'],
    ['delivered', 'statusDelivered'],
    ['delivery-failed', 'statusDeliveryFailed'],
    ['expired', 'statusExpired'],
    ['revoked', 'statusRevoked'],
    ['pending', 'statusPending'],
  ] as const)('names a %s invitation with %s', (status, key) => {
    expect(getInvitationStatusKey(status)).toBe(key);
  });
});
