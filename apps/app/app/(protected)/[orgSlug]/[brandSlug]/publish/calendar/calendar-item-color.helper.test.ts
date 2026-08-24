import { ArticleStatus, CalendarSlotState } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  CALENDAR_DEFAULT_EVENT_COLOR,
  CALENDAR_SLOT_EVENT_COLOR,
  firstTagBackgroundColor,
  getArticleStatusColor,
  getContentCalendarEventColor,
} from './calendar-item-color.helper';

describe('firstTagBackgroundColor', () => {
  it('returns the first non-deleted tag color and ignores later tags', () => {
    expect(
      firstTagBackgroundColor([
        { backgroundColor: '#ef4444', isDeleted: false },
        { backgroundColor: '#22c55e' },
      ]),
    ).toBe('#ef4444');
  });

  it('skips a deleted first tag rather than painting with it', () => {
    expect(
      firstTagBackgroundColor([
        { backgroundColor: '#ef4444', isDeleted: true },
        { backgroundColor: '#22c55e' },
      ]),
    ).toBe('#22c55e');
  });

  it('returns undefined when there are no tags or the first tag has no color', () => {
    expect(firstTagBackgroundColor(undefined)).toBeUndefined();
    expect(firstTagBackgroundColor([])).toBeUndefined();
    expect(
      firstTagBackgroundColor([{ backgroundColor: '  ' }]),
    ).toBeUndefined();
  });
});

describe('getContentCalendarEventColor', () => {
  it('paints a tagged release with the first tag color', () => {
    expect(
      getContentCalendarEventColor({
        itemType: 'release',
        release: { firstTagColor: '#ef4444' },
        status: 'scheduled',
      }),
    ).toBe('#ef4444');
  });

  it('keeps the default purple when a release has no tags', () => {
    expect(
      getContentCalendarEventColor({
        itemType: 'release',
        release: { firstTagColor: null },
        status: 'scheduled',
      }),
    ).toBe(CALENDAR_DEFAULT_EVENT_COLOR);
  });

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

  it('never paints missing, generating, or failed slots with a tag color', () => {
    expect(
      getContentCalendarEventColor({
        itemType: 'slot',
        release: { firstTagColor: '#ef4444' },
        status: CalendarSlotState.MISSING,
      }),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
    expect(
      getContentCalendarEventColor({
        article: { tags: [{ backgroundColor: '#ef4444' }] },
        itemType: 'slot',
        status: CalendarSlotState.GENERATING,
      }),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
    expect(
      getContentCalendarEventColor({
        itemType: 'slot',
        status: CalendarSlotState.GENERATE_FAILED,
      }),
    ).toBe(CALENDAR_SLOT_EVENT_COLOR);
  });
});
