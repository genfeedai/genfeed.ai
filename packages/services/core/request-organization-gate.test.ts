import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  RequestOrganizationGate,
  RequestOrganizationNotConfirmedError,
} from '@services/core/request-organization-gate';
import { describe, expect, it } from 'vitest';

type Outcome = 'pending' | 'sent' | 'cancelled';

/** Starts a held request and reports what became of it. */
function hold(gate: RequestOrganizationGate): {
  headers: () => Record<string, string> | null;
  outcome: () => Promise<Outcome>;
} {
  let state: Outcome = 'pending';
  let received: Record<string, string> | null = null;
  gate.whenSettledHeaders().then(
    (headers) => {
      state = 'sent';
      received = headers;
    },
    (error: unknown) => {
      state =
        error instanceof RequestOrganizationNotConfirmedError
          ? 'cancelled'
          : 'pending';
    },
  );
  return {
    headers: () => received,
    outcome: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return state;
    },
  };
}

describe('RequestOrganizationGate', () => {
  it('lets a request through at once while no organization is routed', async () => {
    const gate = new RequestOrganizationGate();

    await expect(gate.whenSettledHeaders()).resolves.toEqual({});
  });

  it('sends the confirmed organization on every request', async () => {
    const gate = new RequestOrganizationGate();
    gate.setConfirmed('org-a');

    await expect(gate.whenSettledHeaders()).resolves.toEqual({
      [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
    });
    expect(gate.getHeaders()).toEqual({
      [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
    });
  });

  it('holds a request while the organization is provisional', async () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');

    const request = hold(gate);

    expect(await request.outcome()).toBe('pending');
    expect(gate.isProvisional()).toBe(true);
    expect(gate.getConfirmedOrganizationId()).toBeNull();
  });

  it('releases a held request once, with the header, when the same organization is confirmed', async () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');
    const first = hold(gate);
    const second = hold(gate);

    gate.setConfirmed('org-a');

    expect(await first.outcome()).toBe('sent');
    expect(await second.outcome()).toBe('sent');
    expect(first.headers()).toEqual({ [ORGANIZATION_CONTEXT_HEADER]: 'org-a' });
    expect(second.headers()).toEqual({
      [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
    });
  });

  it('cancels a held request when another organization is confirmed', async () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');
    const request = hold(gate);

    gate.setConfirmed('org-b');

    expect(await request.outcome()).toBe('cancelled');
    expect(request.headers()).toBeNull();
  });

  it.each([
    [
      'the check is refused or fails',
      (gate: RequestOrganizationGate) => gate.setUnscoped(),
    ],
    [
      'the route moves to another provisional organization',
      (gate: RequestOrganizationGate) => gate.setProvisional('org-b', 'user-1'),
    ],
  ])('cancels a held request when %s', async (_name, change) => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');
    const request = hold(gate);

    change(gate);

    expect(await request.outcome()).toBe('cancelled');
  });

  it('keeps a held request waiting while the same organization stays provisional', async () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');
    const request = hold(gate);

    gate.setProvisional('org-a', 'user-1');

    expect(await request.outcome()).toBe('pending');
  });

  it('never releases a request made after a refusal for the organization that was refused', async () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');
    const held = hold(gate);
    gate.setUnscoped();

    // A later confirmation of the same id does not revive the cancelled one.
    gate.setConfirmed('org-a');

    expect(await held.outcome()).toBe('cancelled');
  });

  it('makes the synchronous headers fail closed while provisional', () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('org-a', 'user-1');

    expect(() => gate.getHeaders()).toThrow('provisional');
  });

  it('changes its revision when the confirmed organization changes, and only then', () => {
    const gate = new RequestOrganizationGate();
    const initial = gate.getRevision();

    gate.setProvisional('org-a', 'user-1');
    expect(gate.getRevision()).toBe(initial);

    gate.setConfirmed('org-a');
    const confirmed = gate.getRevision();
    expect(confirmed).not.toBe(initial);

    gate.setConfirmed('org-a');
    expect(gate.getRevision()).toBe(confirmed);

    gate.setUnscoped();
    expect(gate.getRevision()).not.toBe(confirmed);
  });

  it('tells a subscriber when the phase changes, not when it stays the same', () => {
    const gate = new RequestOrganizationGate();
    let changes = 0;
    const unsubscribe = gate.subscribe(() => {
      changes += 1;
    });

    gate.setProvisional('org-a', 'user-1');
    gate.setProvisional('org-a', 'user-1');
    gate.setConfirmed('org-a');
    unsubscribe();
    gate.setUnscoped();

    expect(changes).toBe(2);
  });

  it('treats a blank organization id as no organization', () => {
    const gate = new RequestOrganizationGate();
    gate.setProvisional('   ', 'user-1');

    expect(gate.getPhase()).toEqual({ kind: 'unscoped' });
  });
});
