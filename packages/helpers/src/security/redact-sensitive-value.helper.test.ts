import { describe, expect, it } from 'vitest';
import {
  REDACTED_VALUE,
  redactSensitiveString,
} from './redact-sensitive-value.helper';

describe('redactSensitiveValue', () => {
  it.each(['', 'RSA ', 'EC '])(
    'redacts complete %sprivate key blocks',
    (keyType) => {
      const beginMarker = ['-----BEGIN ', keyType, 'PRIVATE KEY-----'].join('');
      const endMarker = ['-----END ', keyType, 'PRIVATE KEY-----'].join('');
      const value = [beginMarker, 'private-material', endMarker].join('\n');

      expect(redactSensitiveString(`before ${value} after`)).toBe(
        `before ${REDACTED_VALUE} after`,
      );
    },
  );

  it('preserves a begin marker that is not a private key type', () => {
    const value = '-----BEGIN rsa PRIVATE KEY-----\nmaterial';
    expect(redactSensitiveString(value)).toBe(value);
  });

  it('ignores an end marker that is not a private key type', () => {
    const beginMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const invalidEnd = ['-----END ', 'rsa PRIVATE KEY-----'].join('');
    const value = [beginMarker, 'material', invalidEnd].join('\n');
    expect(redactSensitiveString(value)).toBe(value);
  });
});
