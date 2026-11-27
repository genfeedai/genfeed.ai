import { describe, expect, it } from 'vitest';
import {
  evaluateMutationPolicy,
  hasReadOnlyToolPrefix,
  POLICY_REVOKED_ERROR,
  UNSUPPORTED_APPROVAL_ERROR,
} from './mutation-policy';

describe('read-only prefixes', () => {
  it.each([
    ['get_account', true],
    ['find_tools', true],
    ['describe_tool', true],
    ['create_post', false],
    ['save_post', false],
    ['forget_this', false],
  ] as const)('%s is a read: %s', (name, expected) => {
    expect(hasReadOnlyToolPrefix(name)).toBe(expected);
  });
});

describe('evaluateMutationPolicy', () => {
  it('executes direct mutations without an approval host', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: false,
        isAvailableOnSurface: true,
        policy: 'direct',
      }),
    ).toEqual({ kind: 'execute' });
  });

  it.each(['direct', undefined] as const)(
    'executes policy %s when host capability is omitted',
    (policy) => {
      expect(
        evaluateMutationPolicy({
          hasTrustedApproval: false,
          isAvailableOnSurface: true,
          policy,
        }),
      ).toEqual({ kind: 'execute' });
    },
  );

  it('rejects approval-required calls when host capability is omitted', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ error: UNSUPPORTED_APPROVAL_ERROR, kind: 'reject' });
  });

  it('queues approval-required calls on a host that can approve', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ kind: 'queue' });
  });

  it('rejects approval-required calls when the host cannot approve', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: false,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ error: UNSUPPORTED_APPROVAL_ERROR, kind: 'reject' });
  });

  it.each([true, false, undefined])(
    'executes after a trusted approval with host capability %s',
    (hostSupportsApproval) => {
      expect(
        evaluateMutationPolicy({
          hasTrustedApproval: true,
          hostSupportsApproval,
          isAvailableOnSurface: true,
          policy: 'approval-required',
        }),
      ).toEqual({ kind: 'execute' });
    },
  );

  it('replays an already-executed approved logical write', () => {
    expect(
      evaluateMutationPolicy({
        existing: { result: { id: 'post-1' }, status: 'APPROVED' },
        hasTrustedApproval: true,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'approval-required',
      }),
    ).toEqual({ kind: 'replay', result: { id: 'post-1' } });
  });

  it('refreshes availability before a subsequent call executes', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: true,
        hostSupportsApproval: true,
        isAvailableOnSurface: false,
        policy: 'approval-required',
      }),
    ).toEqual({ error: POLICY_REVOKED_ERROR, kind: 'reject' });
  });

  it('executes when policy is no longer approval-required', () => {
    expect(
      evaluateMutationPolicy({
        hasTrustedApproval: false,
        hostSupportsApproval: true,
        isAvailableOnSurface: true,
        policy: 'direct',
      }),
    ).toEqual({ kind: 'execute' });
  });
});
