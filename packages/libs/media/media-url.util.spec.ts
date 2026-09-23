import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  assertMediaUrlSigningConfig,
  buildMediaUrl,
  ingredientMediaUrl,
  type MediaUrlConfig,
  resolveIngredientMediaUrl,
  signCdnUrl,
  withExternalMediaFallback,
} from '@libs/media/media-url.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CDN = 'https://cdn.genfeed.ai';

// Generated per run: no key material is ever committed.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
});

const unsigned: MediaUrlConfig = { cdnUrl: CDN };
const signing: MediaUrlConfig = {
  cdnUrl: CDN,
  signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 300 },
};

/** Verifies a CloudFront canned-policy signature with the public key. */
function hasValidSignature(signedUrl: string, resource: string): boolean {
  const url = new URL(signedUrl);
  const expires = url.searchParams.get('Expires');
  const signature = url.searchParams.get('Signature');
  if (!expires || !signature) {
    return false;
  }

  // Built as a literal so key order matches CloudFront's canned policy
  // (Resource before Condition); a formatter may reorder object literals.
  const policy = `{"Statement":[{"Resource":${JSON.stringify(resource)},"Condition":{"DateLessThan":{"AWS:EpochTime":${Number(expires)}}}}]}`;
  const decoded = signature
    .replace(/-/g, '+')
    .replace(/_/g, '=')
    .replace(/~/g, '/');

  const verifier = createVerify('RSA-SHA1');
  verifier.update(policy);
  return verifier.verify(publicKey, decoded, 'base64');
}

describe('resolveIngredientMediaUrl', () => {
  it('builds a public URL from s3Key', () => {
    expect(
      resolveIngredientMediaUrl({ s3Key: 'ingredients/videos/abc.mp4' }, CDN),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });

  it('prefers s3Key over metadata.result', () => {
    expect(
      resolveIngredientMediaUrl(
        {
          metadata: { result: 'https://replicate.delivery/expired.mp4' },
          s3Key: 'ingredients/videos/abc.mp4',
        },
        CDN,
      ),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });

  it('keeps a full external URL stored in s3Key verbatim', () => {
    expect(
      resolveIngredientMediaUrl(
        { s3Key: 'https://www.youtube.com/watch?v=abc' },
        CDN,
      ),
    ).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('falls back to metadata.result for provider-hosted files', () => {
    expect(
      resolveIngredientMediaUrl(
        { metadata: { result: 'https://replicate.delivery/clip.mp4' } },
        CDN,
      ),
    ).toBe('https://replicate.delivery/clip.mp4');
  });

  it('returns undefined when no playable URL exists', () => {
    expect(resolveIngredientMediaUrl({}, CDN)).toBeUndefined();
    expect(
      resolveIngredientMediaUrl({ metadata: 'meta-id-only' }, CDN),
    ).toBeUndefined();
  });

  it('rewrites files-host and /local/ disk paths onto the public CDN', () => {
    expect(
      resolveIngredientMediaUrl(
        {
          s3Key:
            'https://files.genfeed.localhost/local/ingredients/videos/abc.mp4',
        },
        'https://files.genfeed.localhost',
      ),
    ).toBe('https://staging-cdn.genfeed.ai/ingredients/videos/abc.mp4');

    expect(
      resolveIngredientMediaUrl(
        { s3Key: 'local/ingredients/videos/abc.mp4' },
        CDN,
      ),
    ).toBe('https://cdn.genfeed.ai/ingredients/videos/abc.mp4');
  });

  it('encodes key segments so reserved characters stay in the path', () => {
    expect(
      resolveIngredientMediaUrl({ s3Key: 'ingredients/images/a?b#c.png' }, CDN),
    ).toBe('https://cdn.genfeed.ai/ingredients/images/a%3Fb%23c.png');
  });
});

describe('buildMediaUrl', () => {
  it('builds an unsigned URL when signing is not configured', () => {
    expect(buildMediaUrl('ingredients/images/abc', unsigned)).toBe(
      'https://cdn.genfeed.ai/ingredients/images/abc',
    );
  });

  it('strips leading slashes and rejects an empty key', () => {
    expect(buildMediaUrl('///ingredients/images/abc', unsigned)).toBe(
      'https://cdn.genfeed.ai/ingredients/images/abc',
    );
    expect(() => buildMediaUrl('   ', unsigned)).toThrow(
      /objectKey is required/,
    );
  });

  it('produces a CloudFront signature that verifies with the public key', () => {
    const url = buildMediaUrl('ingredients/images/abc', signing);

    expect(url).toContain('Key-Pair-Id=KEYPAIR');
    expect(
      hasValidSignature(url, 'https://cdn.genfeed.ai/ingredients/images/abc'),
    ).toBe(true);
  });

  it('leaves public-by-design media unsigned', () => {
    expect(
      buildMediaUrl('assets/agents/script-writer.webp', signing, {
        isSignable: false,
      }),
    ).toBe('https://cdn.genfeed.ai/assets/agents/script-writer.webp');
  });

  it('throws rather than returning an unsigned URL when signing fails', () => {
    const broken: MediaUrlConfig = {
      cdnUrl: CDN,
      signing: {
        keyPairId: 'KEYPAIR',
        privateKey: 'not-a-key',
        ttlSeconds: 300,
      },
    };
    expect(() => buildMediaUrl('ingredients/images/abc', broken)).toThrow(
      /Could not sign the media URL/,
    );
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('expires the signature after the configured TTL', () => {
      const url = new URL(buildMediaUrl('ingredients/images/abc', signing));
      const expected = Date.parse('2026-09-23T00:05:00.000Z') / 1000;
      expect(Number(url.searchParams.get('Expires'))).toBe(expected);
    });
  });
});

describe('signCdnUrl', () => {
  it('re-signs a stored CDN URL and drops any stale query string', () => {
    const url = signCdnUrl(
      'https://cdn.genfeed.ai/ingredients/images/abc?Expires=1&Signature=stale',
      signing,
    );

    expect(url).not.toContain('stale');
    expect(
      hasValidSignature(url, 'https://cdn.genfeed.ai/ingredients/images/abc'),
    ).toBe(true);
  });

  it('keeps the pathname encoded so %2F cannot select another object', () => {
    const url = signCdnUrl('https://cdn.genfeed.ai/a%2Fb.png', unsigned);
    expect(url).toBe('https://cdn.genfeed.ai/a%2Fb.png');
  });

  it('does not throw on a malformed escape', () => {
    expect(() =>
      signCdnUrl('https://cdn.genfeed.ai/bad%E0%A4%A.png', signing),
    ).not.toThrow();
  });

  it('leaves other origins, lookalike hosts and non-URLs untouched', () => {
    for (const value of [
      'https://replicate.delivery/output/a.png',
      'https://cdn.genfeed.ai.evil.example/a.png',
      'not a url',
      'https://cdn.genfeed.ai/',
    ]) {
      expect(signCdnUrl(value, signing)).toBe(value);
    }
  });
});

describe('ingredientMediaUrl', () => {
  it('signs the URL built from the record’s own key', () => {
    const url = ingredientMediaUrl(
      { s3Key: 'ingredients/videos/abc.mp4' },
      signing,
    );

    expect(url).not.toBeNull();
    expect(
      hasValidSignature(
        url as string,
        'https://cdn.genfeed.ai/ingredients/videos/abc.mp4',
      ),
    ).toBe(true);
  });

  it('never signs external media', () => {
    expect(
      ingredientMediaUrl(
        { s3Key: 'https://www.youtube.com/watch?v=abc' },
        signing,
      ),
    ).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('returns null when the record has no media', () => {
    expect(ingredientMediaUrl({ s3Key: null }, signing)).toBeNull();
  });
});

describe('withExternalMediaFallback', () => {
  it('uses the metadata link for external media with no URL of its own', () => {
    expect(
      withExternalMediaFallback({
        cdnUrl: null,
        id: 'clip',
        metadata: { result: 'https://cdn.argil.ai/video-1.mp4' },
      }),
    ).toEqual({
      cdnUrl: 'https://cdn.argil.ai/video-1.mp4',
      id: 'clip',
      metadata: { result: 'https://cdn.argil.ai/video-1.mp4' },
    });
  });

  it('keeps the computed URL when the row has its own key', () => {
    const doc = {
      cdnUrl: 'https://cdn.genfeed.ai/ingredients/videos/a.mp4',
      metadata: { result: 'https://cdn.argil.ai/video-1.mp4' },
    };
    expect(withExternalMediaFallback(doc)).toBe(doc);
  });

  it('ignores missing metadata, empty results and non-URL results', () => {
    for (const doc of [
      { cdnUrl: null },
      { cdnUrl: null, metadata: null },
      { cdnUrl: null, metadata: { result: '' } },
      { cdnUrl: null, metadata: { result: 'metadata-id-only' } },
      null,
      'not-an-object',
    ]) {
      expect(withExternalMediaFallback(doc)).toBe(doc);
    }
  });

  it('does not mutate the input', () => {
    const doc = { cdnUrl: null, metadata: { result: 'https://x.test/a.mp4' } };
    withExternalMediaFallback(doc);
    expect(doc.cdnUrl).toBeNull();
  });
});

describe('assertMediaUrlSigningConfig', () => {
  it('accepts an unsigned deployment and a working key pair', () => {
    expect(() => assertMediaUrlSigningConfig(unsigned)).not.toThrow();
    expect(() => assertMediaUrlSigningConfig(signing)).not.toThrow();
  });

  it('fails fast with a named cause when the key pair cannot sign', () => {
    expect(() =>
      assertMediaUrlSigningConfig({
        cdnUrl: CDN,
        signing: {
          keyPairId: 'KEYPAIR',
          privateKey: 'not-a-key',
          ttlSeconds: 300,
        },
      }),
    ).toThrow(/key pair cannot sign URLs/);
  });
});
