import { PagesService } from '@services/content/pages.service';
import { recordPageTotals } from '@services/core/page-totals';
import { beforeEach, describe, expect, it } from 'vitest';

const document = {
  data: [],
  links: { pagination: { limit: 20, page: 2, pages: 4, total: 65 } },
};

describe('recordPageTotals', () => {
  beforeEach(() => {
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);
    PagesService.setTotalDocs(0);
  });

  it('publishes the pagination links when a page was requested', () => {
    recordPageTotals(document as never, { page: 2 });

    expect(PagesService.getCurrentPage()).toBe(2);
    expect(PagesService.getTotalPages()).toBe(4);
    expect(PagesService.getTotalDocs()).toBe(65);
  });

  it('leaves the shared totals alone when no page was requested', () => {
    recordPageTotals(document as never, {});
    recordPageTotals(document as never);

    expect(PagesService.getCurrentPage()).toBe(1);
    expect(PagesService.getTotalDocs()).toBe(0);
  });

  it('ignores responses without pagination links', () => {
    recordPageTotals({ data: [] } as never, { page: 2 });

    expect(PagesService.getTotalDocs()).toBe(0);
  });

  it('keeps the newest request when an older response arrives late', () => {
    const first = PagesService.beginRequest();
    const second = PagesService.beginRequest();
    const fresh = {
      data: [],
      links: { pagination: { limit: 20, page: 1, pages: 1, total: 4 } },
    };

    recordPageTotals(fresh as never, { page: 1 }, second);
    recordPageTotals(document as never, { page: 2 }, first);

    expect(PagesService.getTotalDocs()).toBe(4);
    expect(PagesService.getTotalPages()).toBe(1);
    expect(PagesService.getCurrentPage()).toBe(1);
  });

  it('applies responses that arrive in request order', () => {
    const first = PagesService.beginRequest();
    const second = PagesService.beginRequest();

    recordPageTotals(document as never, { page: 2 }, first);
    recordPageTotals(
      {
        data: [],
        links: { pagination: { limit: 20, page: 1, pages: 1, total: 4 } },
      } as never,
      { page: 1 },
      second,
    );

    expect(PagesService.getTotalDocs()).toBe(4);
  });
});
