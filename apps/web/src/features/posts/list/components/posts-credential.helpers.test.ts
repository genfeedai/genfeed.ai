import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getAvailablePlatforms,
  getCredentialForPlatform,
} from './posts-credential.helpers';

const credential = (
  id: string,
  platform: CredentialPlatform,
  isConnected = true,
): ICredential => ({ id, isConnected, platform }) as unknown as ICredential;

describe('posts credential helpers', () => {
  it('posts to Threads with the Threads credential, not the Instagram one', () => {
    const instagram = credential('instagram-1', CredentialPlatform.INSTAGRAM);
    const threads = credential('threads-1', CredentialPlatform.THREADS);

    expect(
      getCredentialForPlatform(Platform.THREADS, [instagram, threads])?.id,
    ).toBe('threads-1');
    expect(
      getCredentialForPlatform(Platform.THREADS, [instagram]),
    ).toBeUndefined();
  });

  it('lists Threads as available when a Threads account is connected', () => {
    expect(
      getAvailablePlatforms([
        credential('threads-1', CredentialPlatform.THREADS),
        credential('threads-2', CredentialPlatform.THREADS, false),
      ]),
    ).toEqual([Platform.THREADS]);
  });
});
