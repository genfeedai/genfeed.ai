import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from './content-security-policy';

function directive(policy: string, name: string): string[] {
  const entry = policy
    .split('; ')
    .find((candidate) => candidate.startsWith(`${name} `));
  return entry ? entry.slice(name.length + 1).split(' ') : [];
}

describe('buildContentSecurityPolicy', () => {
  it('forbids plugins and restricts base, form and framing to the app', () => {
    const policy = buildContentSecurityPolicy();

    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
    expect(directive(policy, 'form-action')).toEqual(["'self'"]);
    expect(directive(policy, 'frame-ancestors')).toEqual(["'self'"]);
  });

  it('allows a configured API origin over http and websocket', () => {
    const policy = buildContentSecurityPolicy({
      connectOrigins: ['https://api.selfhost.test/v1', undefined, 'not a url'],
    });

    expect(directive(policy, 'connect-src')).toEqual(
      expect.arrayContaining([
        'https://api.selfhost.test',
        'wss://api.selfhost.test',
      ]),
    );
  });

  it('reports violations to the same-origin report route', () => {
    expect(directive(buildContentSecurityPolicy(), 'report-uri')).toEqual([
      '/api/csp-report',
    ]);
  });
});

describe('buildSecurityHeaders', () => {
  it('ships the policy report-only in production', () => {
    const headers = buildSecurityHeaders({ isProduction: true });

    expect(headers.map((header) => header.key)).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Content-Security-Policy-Report-Only',
    ]);
  });

  it('never enforces the policy', () => {
    const headers = buildSecurityHeaders({ isProduction: true });

    expect(headers.map((header) => header.key)).not.toContain(
      'Content-Security-Policy',
    );
  });

  it('leaves the policy out of development builds', () => {
    const headers = buildSecurityHeaders({ isProduction: false });

    expect(headers.map((header) => header.key)).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]);
  });

  it('keeps camera and microphone available for recording', () => {
    const permissions = buildSecurityHeaders({ isProduction: false }).find(
      (header) => header.key === 'Permissions-Policy',
    );

    expect(permissions?.value).toContain('microphone=(self)');
    expect(permissions?.value).toContain('camera=(self)');
  });
});
