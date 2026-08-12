import { describe, expect, it } from 'vitest';
import {
  claimNodeOnce,
  completeNodeClaim,
  resolveNodeClaimDecision,
} from './workflow-node-idempotency.util';

describe('workflow-node-idempotency (#2359)', () => {
  it('lets the first claim win and marks the node running', () => {
    const claims = new Map();
    const first = claimNodeOnce(claims, 'exec-1', 'publish');
    expect(first.action).toBe('claim');
    expect(claims.get(first.key)?.status).toBe('running');
  });

  it('duplicate insert loses cleanly once the first claim completed', () => {
    const claims = new Map();
    const first = claimNodeOnce(claims, 'exec-1', 'publish');
    completeNodeClaim(claims, first.key, {
      output: { postId: 'p1' },
      status: 'completed',
    });

    const second = claimNodeOnce(claims, 'exec-1', 'publish');
    expect(second.action).toBe('skip');
    if (second.action === 'skip') {
      expect(second.record.output).toEqual({ postId: 'p1' });
    }
  });

  it('treats an in-flight running claim as busy, not a free re-run', () => {
    const claims = new Map();
    claimNodeOnce(claims, 'exec-1', 'dm');
    const second = claimNodeOnce(claims, 'exec-1', 'dm');
    expect(second.action).toBe('busy');
  });

  it('resolveNodeClaimDecision is pure for completed failures', () => {
    expect(
      resolveNodeClaimDecision({
        error: 'provider 429',
        nodeId: 'n1',
        status: 'failed',
      }),
    ).toEqual({
      action: 'skip',
      record: {
        error: 'provider 429',
        nodeId: 'n1',
        status: 'failed',
      },
    });
  });

  it('pending prior claim is treated as free to claim again', () => {
    expect(
      resolveNodeClaimDecision({
        nodeId: 'n1',
        status: 'pending',
      }),
    ).toEqual({ action: 'claim' });
  });

  it('missing claim is free to claim', () => {
    expect(resolveNodeClaimDecision(undefined)).toEqual({ action: 'claim' });
  });

  it('scopes claim keys by executionId so nodes do not collide across runs', () => {
    const claims = new Map();
    const a = claimNodeOnce(claims, 'exec-1', 'publish');
    const b = claimNodeOnce(claims, 'exec-2', 'publish');
    expect(a.action).toBe('claim');
    expect(b.action).toBe('claim');
    expect(a.key).not.toBe(b.key);
    expect(claims.size).toBe(2);
  });

  it('completeNodeClaim is a no-op when the key was never claimed', () => {
    const claims = new Map();
    completeNodeClaim(claims, 'missing:key', {
      status: 'failed',
      error: 'boom',
    });
    expect(claims.size).toBe(0);
  });

  it('failed terminal claim is skipped with the stored error on re-entry', () => {
    const claims = new Map();
    const first = claimNodeOnce(claims, 'exec-1', 'publish');
    completeNodeClaim(claims, first.key, {
      error: 'publish timed out',
      status: 'failed',
    });

    const second = claimNodeOnce(claims, 'exec-1', 'publish');
    expect(second.action).toBe('skip');
    if (second.action === 'skip') {
      expect(second.record.error).toBe('publish timed out');
      expect(second.record.status).toBe('failed');
    }
  });
});
