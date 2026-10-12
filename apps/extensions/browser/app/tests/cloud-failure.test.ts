import { describe, expect, it } from 'vitest';
import { AgentActionError } from '~services/agent-tools.service';
import { classifyCloudFailure } from '~services/cloud-failure';
import { HttpRequestError } from '~services/http-request-error';

function http(status: number): HttpRequestError {
  return new HttpRequestError(`HTTP ${status}`, 'http', status);
}

describe('classifyCloudFailure', () => {
  it.each([
    ['a request limit (429)', http(429), 'quota_exceeded'],
    ['a payment requirement (402)', http(402), 'credit_limit'],
    [
      'a credit limit reported by the action',
      new AgentActionError('Not enough credits', 'insufficient_credits'),
      'credit_limit',
    ],
    [
      'a provider outage reported by the action',
      new AgentActionError('Provider down', 'provider_unavailable'),
      'service_unavailable',
    ],
  ])('falls back for %s', (_label, error, reason) => {
    expect(classifyCloudFailure(error)).toEqual({ kind: 'fallback', reason });
  });

  it.each([
    [
      'an expired sign-in',
      new HttpRequestError('Sign in', 'unauthorized', 401),
    ],
    ['a forbidden workspace (403)', http(403)],
    ['a missing workspace', new Error('Your workspace changed. Retry.')],
    ['a missing session', new Error('Not authenticated')],
    ['an unknown failure type', 'boom'],
  ])('requires recovery, never fallback, for %s', (_label, error) => {
    expect(classifyCloudFailure(error)).toEqual({ kind: 'recovery_required' });
  });

  it.each([
    ['a network failure', new HttpRequestError('offline', 'network', null)],
    ['a timeout', new HttpRequestError('slow', 'timeout', null)],
    ['a server error (500)', http(500)],
    ['a bad gateway (502)', http(502)],
    ['an unavailable gateway (503)', http(503)],
    [
      'a request still running',
      new AgentActionError('Still running', 'in_progress'),
    ],
  ])('treats %s as uncertain', (_label, error) => {
    expect(classifyCloudFailure(error)).toEqual({ kind: 'uncertain' });
  });

  it.each([
    ['invalid input (400)', http(400)],
    ['a conflict (409)', http(409)],
    ['a refused output', new AgentActionError('Too long', 'limit_exceeded')],
    ['a voice that could not be applied', new AgentActionError('x', 'blocked')],
    [
      'an action without a code',
      new AgentActionError('A brand is required', null),
    ],
    [
      'an approval requirement',
      new AgentActionError('Approve', 'approval_required'),
    ],
  ])('rejects %s without fallback', (_label, error) => {
    expect(classifyCloudFailure(error)).toEqual({ kind: 'rejected' });
  });
});
