import { describe, expect, it } from 'vitest';
import { normalizeCustomerInstanceAddress } from './customer-instance-address.util';

function withCredentials(address: string): string {
  const url = new URL(address);
  url.username = 'operator';
  url.password = 'placeholder';
  return url.toString();
}

describe('normalizeCustomerInstanceAddress', () => {
  it.each([
    ['https://acme.gpu.example-host.com', 'https://acme.gpu.example-host.com'],
    ['https://Acme.GPU.example-host.com/', 'https://acme.gpu.example-host.com'],
    ['  https://a.example-host.io  ', 'https://a.example-host.io'],
    ['https://a.example-host.io.', 'https://a.example-host.io'],
  ])('accepts and normalises %s', (input, expected) => {
    expect(normalizeCustomerInstanceAddress(input)).toBe(expected);
  });

  it.each([
    'http://acme.example-host.com',
    'ftp://acme.example-host.com',
    withCredentials('https://acme.example-host.com'),
    'https://acme.example-host.com:8443',
    'https://acme.example-host.com/v1',
    'https://acme.example-host.com/?x=1',
    'https://acme.example-host.com/#frag',
    'https://localhost',
    'https://intranet',
    'https://10.0.0.5',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://0x7f000001',
    'https://2130706433',
    'https://metadata.google.internal',
    'https://box.local',
    'https://svc.corp',
    'https://a_b.example-host.com',
    'not a url',
    '',
  ])('rejects %s', (input) => {
    expect(() => normalizeCustomerInstanceAddress(input)).toThrow();
  });
});
