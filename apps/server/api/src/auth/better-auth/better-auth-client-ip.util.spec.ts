import { pinBetterAuthClientIp } from './better-auth-client-ip.util';

describe('pinBetterAuthClientIp', () => {
  it('replaces a forged first x-forwarded-for entry with the resolved client IP', () => {
    const request = {
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' },
      ip: '203.0.113.7',
    };

    pinBetterAuthClientIp(request);

    expect(request.headers['x-forwarded-for']).toBe('203.0.113.7');
  });

  it('adds the header when the client sent none', () => {
    const request = {
      headers: {} as Record<string, string>,
      ip: '198.51.100.9',
    };

    pinBetterAuthClientIp(request);

    expect(request.headers['x-forwarded-for']).toBe('198.51.100.9');
  });

  it('falls back to the socket address when Express resolved no IP', () => {
    const request = {
      headers: { 'x-forwarded-for': '6.6.6.6' },
      socket: { remoteAddress: '192.0.2.1' },
    };

    pinBetterAuthClientIp(request);

    expect(request.headers['x-forwarded-for']).toBe('192.0.2.1');
  });

  it('removes an untrusted header when no address is known', () => {
    const request = { headers: { 'x-forwarded-for': '6.6.6.6' } };

    pinBetterAuthClientIp(request);

    expect(request.headers['x-forwarded-for']).toBeUndefined();
  });
});
