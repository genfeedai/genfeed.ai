import { toCredentialPlatform } from '@api/collections/credentials/utils/credential-platform.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('toCredentialPlatform', () => {
  it.each([
    ['TWITTER', CredentialPlatform.TWITTER],
    ['twitter', CredentialPlatform.TWITTER],
    ['DEVTO', CredentialPlatform.DEV_TO],
  ])('maps %s to the domain credential platform', (value, expected) => {
    expect(toCredentialPlatform(value)).toBe(expected);
  });

  it.each([
    ['UNKNOWN_NETWORK', 'UNKNOWN_NETWORK'],
    [undefined, 'missing'],
  ])('returns the exact unknown-platform 400 for %s', (value, rendered) => {
    try {
      toCredentialPlatform(value);
      expect.unreachable('Expected toCredentialPlatform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).getResponse()).toEqual({
        detail: `Unknown credential platform: ${rendered}`,
        title: 'Unknown credential platform',
      });
    }
  });
});
