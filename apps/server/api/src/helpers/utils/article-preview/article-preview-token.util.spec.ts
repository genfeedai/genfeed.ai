import { describe, expect, it } from 'vitest';

import {
  ARTICLE_PREVIEW_TOKEN_TTL_SECONDS,
  createArticlePreviewToken,
  verifyArticlePreviewToken,
} from './article-preview-token.util';

const SECRET = 'a'.repeat(32);
const ARTICLE_ID = 'article-123';
const NOW = 1_800_000_000_000;

describe('article preview tokens', () => {
  it('verifies a token it just issued for the same slug', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );

    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      ARTICLE_ID,
    );
  });

  it('rejects a token issued for a different slug', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );

    expect(verifyArticlePreviewToken(token, 'other-post', SECRET, NOW)).toBe(
      null,
    );
  });

  it('rejects a token signed with a different key', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      'b'.repeat(32),
      NOW,
    );

    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      null,
    );
  });

  it('rejects a token past its expiry', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );
    const afterExpiry = NOW + (ARTICLE_PREVIEW_TOKEN_TTL_SECONDS + 1) * 1000;

    expect(
      verifyArticlePreviewToken(token, 'launch-post', SECRET, afterExpiry),
    ).toBe(null);
  });

  it('rejects an extended expiry that was not signed', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );
    const [version, articleId, expiresAt, signature] = String(token).split('.');
    const forged = `${version}.${articleId}.${Number(expiresAt) + 86_400}.${signature}`;

    expect(verifyArticlePreviewToken(forged, 'launch-post', SECRET, NOW)).toBe(
      null,
    );
  });

  it.each([
    ['no token', undefined],
    ['empty token', ''],
    ['unversioned token', 'deadbeef'],
    ['wrong version', `v1.${Math.floor(NOW / 1000) + 60}.deadbeef`],
    ['missing signature', `v2.article-123.${Math.floor(NOW / 1000) + 60}.`],
    ['non-numeric expiry', 'v2.article-123.soon.deadbeef'],
  ])('fails closed on %s', (_label, token) => {
    expect(verifyArticlePreviewToken(token, 'launch-post', SECRET, NOW)).toBe(
      null,
    );
  });

  it('rejects a token whose article identity was changed', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );
    const forged = String(token).replace(ARTICLE_ID, 'other-article');
    expect(
      verifyArticlePreviewToken(forged, 'launch-post', SECRET, NOW),
    ).toBeNull();
  });

  it('rejects trailing token segments', () => {
    const token = createArticlePreviewToken(
      'launch-post',
      ARTICLE_ID,
      SECRET,
      NOW,
    );
    expect(
      verifyArticlePreviewToken(`${token}.extra`, 'launch-post', SECRET, NOW),
    ).toBeNull();
  });

  it('does not issue a token for an invalid article identity', () => {
    expect(
      createArticlePreviewToken('launch-post', 'invalid.id', SECRET, NOW),
    ).toBeUndefined();
  });

  it('fails closed when no signing key is configured', () => {
    expect(
      createArticlePreviewToken('launch-post', ARTICLE_ID, undefined, NOW),
    ).toBe(undefined);
    expect(
      verifyArticlePreviewToken('v1.9999999999.x', 'launch-post', '', NOW),
    ).toBe(null);
  });
});
