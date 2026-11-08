import { describe, expect, it } from 'vitest';
import {
  type PublicArticleAuthorSource,
  resolvePublicArticleAuthor,
} from './article-author';

function article(
  overrides: PublicArticleAuthorSource = {},
): PublicArticleAuthorSource {
  return overrides;
}

describe('resolvePublicArticleAuthor', () => {
  it('uses the human name instead of exposing a numeric legacy handle', () => {
    expect(
      resolvePublicArticleAuthor(
        article({
          author: '23423424',
          user: {
            firstName: ' Vincent ',
            lastName: ' Tellier ',
          },
        }),
      ),
    ).toBe('Vincent Tellier');
  });

  it('keeps a readable handle when no human name is available', () => {
    expect(resolvePublicArticleAuthor(article({ author: 'genfeedai' }))).toBe(
      'genfeedai',
    );
  });

  it('omits the byline when every candidate is missing or identifier-only', () => {
    expect(
      resolvePublicArticleAuthor(
        article({
          author: '23423424',
          user: {
            firstName: ' ',
            lastName: '1234',
          },
        }),
      ),
    ).toBeUndefined();
    expect(resolvePublicArticleAuthor(article())).toBeUndefined();
  });
});
