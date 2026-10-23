import {
  ArticleStatus,
  CalendarSlotState,
  PostCategory,
  ReleaseStatus,
} from '@genfeedai/contracts';
import type {
  ICalendarSlot,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { Article } from '@models/content/article.model';
import { Newsletter } from '@models/content/newsletter.model';
import type { ContentCalendarItemsOptions } from '@props/publishing/content-calendar-controller.props';
import { describe, expect, it } from 'vitest';
import { buildContentCalendarItems } from './content-calendar-items';

const instant = '2026-10-21T12:00:00.000Z';
const release: IReleaseGroup = {
  id: 'release-1',
  isDeleted: false,
  createdAt: instant,
  updatedAt: instant,
  title: '<b>Launch</b>',
  baseContent: 'Announcement',
  media: [],
  timezone: 'Europe/Malta',
  ownerId: 'user-fixture',
  organizationId: 'org-fixture',
  status: ReleaseStatus.SCHEDULED,
  scheduledAt: instant,
  targets: [],
  analyticsComparison: {
    releaseId: 'release-1',
    state: 'empty',
    metricDefinitions: [],
    targets: [],
  },
};
function slot(
  identityKey: string,
  state: CalendarSlotState = CalendarSlotState.MISSING,
): ICalendarSlot {
  return {
    id: identityKey,
    identityKey,
    brandId: 'brand-fixture',
    cadenceId: null,
    credentialId: 'credential-fixture',
    format: PostCategory.POST,
    instant,
    resolvedBrief: '',
    state,
    timezone: 'Europe/Malta',
  };
}
function options(
  overrides: Partial<ContentCalendarItemsOptions> = {},
): ContentCalendarItemsOptions {
  return {
    articles: [
      new Article({
        id: 'article-1',
        label: 'Guide',
        content: 'Article body',
        createdAt: instant,
        status: ArticleStatus.DRAFT,
      }),
    ],
    newsletters: [
      new Newsletter({
        id: 'newsletter-1',
        label: 'News',
        topic: 'Updates',
        content: 'Newsletter body',
        createdAt: instant,
        status: 'published',
        publishedAt: instant,
      }),
    ],
    releases: [release],
    slots: [slot('missing')],
    globalFilterQuery: '',
    calendarView: 'week',
    translate: (key, values) =>
      key === 'monthDaySummary'
        ? String(values?.filled) +
          ' filled / ' +
          String(values?.missing) +
          ' missing'
        : key,
    ...overrides,
  };
}

describe('calendar item projection', () => {
  it('preserves release/article/newsletter/slot ordering, source identities and schedule dates', () => {
    const input = options();
    const items = buildContentCalendarItems(input);
    expect(items.map((item) => item.itemType)).toEqual([
      'release',
      'article',
      'newsletter',
      'slot',
    ]);
    expect(items[0]).toMatchObject({
      id: 'release-1',
      title: 'Launch',
      scheduledDate: instant,
    });
    expect(items[1]).toMatchObject({ id: 'article-1', scheduledDate: instant });
    expect(items[2]).toMatchObject({
      id: 'newsletter-1',
      scheduledDate: instant,
    });
    expect(items[3]).toMatchObject({ id: 'missing', scheduledDate: instant });
    expect(input.releases[0].title).toBe('<b>Launch</b>');
  });
  it('maps public status to published and hides ghosts when an explicit status filter is present', () => {
    expect(
      buildContentCalendarItems(
        options({ globalFilterQuery: 'status=public' }),
      ).map((item) => item.id),
    ).toEqual(['newsletter-1']);
  });
  it('applies embedded content-type/search filters and omits undated newsletters', () => {
    expect(
      buildContentCalendarItems(
        options({ globalFilterQuery: 'type=article&search=guide' }),
      ).map((item) => item.id),
    ).toEqual(['article-1']);
    expect(
      buildContentCalendarItems(
        options({
          newsletters: [
            new Newsletter({
              id: 'undated',
              label: 'Draft',
              status: 'draft',
              createdAt: instant,
            }),
          ],
        }),
      ).some((item) => item.itemType === 'newsletter'),
    ).toBe(false);
  });
  it('retains the legacy execution-state fallback and its existing ghost visibility', () => {
    expect(
      buildContentCalendarItems(
        options({ globalFilterQuery: 'executionState=scheduled' }),
      ).map((item) => item.id),
    ).toEqual(['release-1', 'missing']);
  });
  it('aggregates month density while only truly missing slots contribute generation identities', () => {
    const items = buildContentCalendarItems(
      options({
        calendarView: 'month',
        slots: [
          slot('missing'),
          slot('generating', CalendarSlotState.GENERATING),
          slot('failed', CalendarSlotState.GENERATE_FAILED),
          slot('skipped', CalendarSlotState.SKIPPED),
          slot('filled', CalendarSlotState.FILLED),
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemType: 'day-aggregate',
      filledCount: 3,
      missingCount: 3,
      missingIdentityKeys: ['missing'],
      title: '3 filled / 3 missing',
    });
    expect(new Date(items[0].scheduledDate ?? '').getHours()).toBe(12);
  });
});
