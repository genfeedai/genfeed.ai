import { ArticleStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  firstTagBackgroundColor,
  getArticleStatusColor,
  getContentCalendarEventColor,
} from './calendar-item-color.helper';

describe('firstTagBackgroundColor', () => {
  it('returns undefined when there are no tags or the first tag has no color', () => {
    expect(firstTagBackgroundColor(undefined)).toBeUndefined();
    expect(firstTagBackgroundColor([])).toBeUndefined();
    expect(
      firstTagBackgroundColor([{ backgroundColor: '  ' }]),
    ).toBeUndefined();
  });
});

describe('getContentCalendarEventColor', () => {
  it('paints a tagged article from its first tag instead of status color', () => {
    expect(
      getContentCalendarEventColor({
        article: {
          tags: [
            { backgroundColor: '#f97316' },
            { backgroundColor: '#22c55e' },
          ],
        },
        itemType: 'article',
        status: ArticleStatus.DRAFT,
      }),
    ).toBe('#f97316');
  });

  it('keeps article status color when the article is untagged', () => {
    expect(
      getContentCalendarEventColor({
        article: { tags: [] },
        itemType: 'article',
        status: ArticleStatus.DRAFT,
      }),
    ).toBe(getArticleStatusColor(ArticleStatus.DRAFT));
  });
});
