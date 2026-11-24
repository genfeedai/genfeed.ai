import { generateKeyPairSync } from 'node:crypto';
import * as cloudfrontSigner from '@aws-sdk/cloudfront-signer';
import { buildMediaUrl, type MediaUrlConfig } from '@libs/media/media-url.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/cloudfront-signer', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@aws-sdk/cloudfront-signer')>();
  return { ...original, getSignedUrl: vi.fn(original.getSignedUrl) };
});

function newKey(): string {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  }).privateKey;
}

function configFor(privateKey: string): MediaUrlConfig {
  return {
    cdnUrl: 'https://cdn.genfeed.ai',
    signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 300 },
  };
}

const KEY_A = newKey();
const KEY_B = newKey();

describe('signed media URL memoization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    vi.mocked(cloudfrontSigner.getSignedUrl).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs one URL once for the whole expiry window', () => {
    // One second in, so the expiry sits inside a window, not on its edge.
    vi.setSystemTime(new Date('2026-09-23T00:00:01.000Z'));
    const config = configFor(KEY_A);

    const first = buildMediaUrl('memo/window/one.png', config);
    vi.advanceTimersByTime(10_000);
    const second = buildMediaUrl('memo/window/one.png', config);
    const third = buildMediaUrl('memo/window/one.png', configFor(KEY_A));

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(cloudfrontSigner.getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('signs again once the window has passed', () => {
    const config = configFor(KEY_A);

    const first = buildMediaUrl('memo/window/two.png', config);
    vi.advanceTimersByTime(100_000);
    const second = buildMediaUrl('memo/window/two.png', config);

    expect(second).not.toBe(first);
    expect(cloudfrontSigner.getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('signs each URL on its own', () => {
    const config = configFor(KEY_A);

    const one = buildMediaUrl('memo/each/one.png', config);
    const other = buildMediaUrl('memo/each/other.png', config);

    expect(other).not.toBe(one);
    expect(cloudfrontSigner.getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('never reuses a signature made with another private key', () => {
    const withA = buildMediaUrl('memo/key/one.png', configFor(KEY_A));
    const withB = buildMediaUrl('memo/key/one.png', configFor(KEY_B));

    expect(withB).not.toBe(withA);
    expect(cloudfrontSigner.getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('still fails closed and remembers nothing when signing throws', () => {
    const broken = configFor('not a pem key');

    expect(() => buildMediaUrl('memo/broken/one.png', broken)).toThrow(
      'Could not sign the media URL',
    );
    expect(() => buildMediaUrl('memo/broken/one.png', broken)).toThrow(
      'Could not sign the media URL',
    );
    expect(cloudfrontSigner.getSignedUrl).toHaveBeenCalledTimes(2);
  });
});
