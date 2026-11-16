import { describe, expect, it } from 'vitest';
import { parseCspViolation } from './csp-report';

describe('parseCspViolation', () => {
  it.each([
    {
      name: 'a legacy report-uri report',
      payload: {
        'csp-report': {
          'blocked-uri': 'https://cdn.evil.test/a.js?token=secret',
          'effective-directive': 'script-src-elem',
        },
      },
    },
    {
      name: 'a Reporting API report',
      payload: [
        {
          body: {
            blockedURL: 'https://cdn.evil.test/a.js?token=secret',
            effectiveDirective: 'script-src-elem',
          },
          type: 'csp-violation',
        },
      ],
    },
  ])('reduces $name to a directive and origin', ({ payload }) => {
    expect(parseCspViolation(payload)).toEqual({
      blockedOrigin: 'https://cdn.evil.test',
      effectiveDirective: 'script-src-elem',
    });
  });

  it('keeps keyword blocks such as inline', () => {
    expect(
      parseCspViolation({
        'csp-report': {
          'blocked-uri': 'inline',
          'violated-directive': "script-src-elem 'self'",
        },
      }),
    ).toEqual({
      blockedOrigin: 'inline',
      effectiveDirective: 'script-src-elem',
    });
  });

  it.each([
    { 'blocked-uri': 'chrome-extension://abc/inject.js' },
    { 'blocked-uri': 'inline', 'source-file': 'moz-extension://abc/inject.js' },
  ])('drops browser extension noise %#', (fields) => {
    expect(
      parseCspViolation({
        'csp-report': { ...fields, 'effective-directive': 'script-src' },
      }),
    ).toBeNull();
  });

  it.each([null, 'text', 42, {}, { 'csp-report': {} }])(
    'ignores a malformed payload %#',
    (payload) => {
      expect(parseCspViolation(payload)).toBeNull();
    },
  );
});
