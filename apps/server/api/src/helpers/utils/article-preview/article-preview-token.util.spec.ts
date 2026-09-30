import { describe, expect, it } from 'vitest';

import {
  ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
  createArticlePreviewToken,
  verifyArticlePreviewToken,
} from './article-preview-token.util';

const SECRET = 'a'.repeat(32);
const NOW = 1_800_000_000_000;

describe('article preview tokens', () => {
  it('verifies a token it just issued for the same slug', () => {
    const token = createArticlePreviewToken('launch-post', SECRET, NOW);

    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      true,
    );
  });

  it('rejects a token issued for a different slug', () => {
    const token = createArticlePreviewToken('launch-post', SECRET, NOW);

    expect(verifyArticlePreviewToken(token, 'other-post', SECRET, NOW)).toBe(
      false,
    );
  });

  it('rejects a token signed with a different key', () => {
    const token = createArticlePreviewToken('launch-post', 'b'.repeat(32), NOW);

    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      false,
    );
  });

  it('rejects a token past its expiry', () => {
    const token = createArticlePreviewToken('launch-post', SECRET, NOW);
    const afterExpiry = NOW + (ARTICLE_PREVIEW_TOKEN_TTL_SECONDS + 1) * 1000;

    expect(
      verifyArticlePreviewToken(token, 'launch-post', SECRET, afterExpiry),
    ).toBe(false);
  });

  it('rejects an extended expiry that was not signed', () => {
    const token = createArticlePreviewToken('launch-post', SECRET, NOW);
    const [version, expiresAt, signature] = String(token).split('.');
    const forged = `${version}.${Number(expiresAt) + 86_400}.${signature}`;

    expect(verifyArticlePreviewToken(forged, 'launch-post', SECRET, NOW)).toBe(
      false,
    );
  });

  it.each([
    ['no token', undefined],
    ['empty token', ''],
    ['unversioned token', 'deadbeef'],
    ['wrong version', `v2.${Math.floor(NOW / 1000) + 60}.deadbeef`],
    ['missing signature', `v1.${Math.floor(NOW / 1000) + 60}.`],
    ['non-numeric expiry', 'v1.soon.deadbeef'],
  ])('fails closed on %s', (_label, token) => {
    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      false,
    );
  });

  it('fails closed when no signing key is configured', () => {
    expect(createArticlePreviewToken('launch-post', undefined, NOW)).toBe(
      undefined,
    );
    expect(
      verifyArticlePreviewToken('v1.9999999999.x', 'launch-post', '', NOW),
    ).toBe(false);
  });
});
