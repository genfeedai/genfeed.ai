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
  it('keeps a readable handle when no human name is available', () => {
    expect(resolvePublicArticleAuthor(article({ author: 'genfeedai' }))).toBe(
      'genfeedai',
    );
  });
});
