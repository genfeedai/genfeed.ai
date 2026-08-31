import { createHmac } from 'node:crypto';
import {
  createThreadsDeletionReceipt,
  verifyThreadsDeletionReceipt,
  verifyThreadsSignedRequest,
} from '@api/services/integrations/threads/services/threads-callback-signature.util';

const SECRET = 'threads-app-secret';

function createSignedRequest(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = createHmac('sha256', SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${signature}.${encodedPayload}`;
}

describe('Threads callback signatures', () => {
  it('verifies Meta signed requests over the encoded payload segment', () => {
    const signedRequest = createSignedRequest({
      algorithm: 'HMAC-SHA256',
      issued_at: 1_700_000_000,
      user_id: 'threads-user-1',
    });

    expect(verifyThreadsSignedRequest(signedRequest, SECRET)).toEqual({
      algorithm: 'HMAC-SHA256',
      issued_at: 1_700_000_000,
      user_id: 'threads-user-1',
    });
  });

  it.each([
    ['wrong secret', (request: string) => request, 'different-secret'],
    [
      'wrong algorithm',
      () =>
        createSignedRequest({
          algorithm: 'none',
          user_id: 'threads-user-1',
        }),
      SECRET,
    ],
    [
      'missing user id',
      () => createSignedRequest({ algorithm: 'HMAC-SHA256' }),
      SECRET,
    ],
    ['extra segment', (request: string) => `${request}.extra`, SECRET],
  ])('rejects a %s', (_label, mutate, secret) => {
    const valid = createSignedRequest({
      algorithm: 'HMAC-SHA256',
      user_id: 'threads-user-1',
    });

    expect(verifyThreadsSignedRequest(mutate(valid), secret)).toBeNull();
  });

  it('creates a user-id-free receipt that verifies to its completion time', () => {
    const completedAtMs = Date.UTC(2026, 7, 31, 18, 30, 0);
    const receipt = createThreadsDeletionReceipt(SECRET, completedAtMs);

    expect(receipt).not.toContain('threads-user');
    expect(
      verifyThreadsDeletionReceipt(receipt, SECRET, completedAtMs),
    ).toEqual(new Date(completedAtMs));
  });

  it('rejects forged and future-dated deletion receipts', () => {
    const nowMs = Date.UTC(2026, 7, 31, 18, 30, 0);
    const receipt = createThreadsDeletionReceipt(SECRET, nowMs);
    const futureReceipt = createThreadsDeletionReceipt(SECRET, nowMs + 1000);

    expect(
      verifyThreadsDeletionReceipt(receipt, 'different-secret', nowMs),
    ).toBeNull();
    expect(
      verifyThreadsDeletionReceipt(futureReceipt, SECRET, nowMs),
    ).toBeNull();
  });
});
