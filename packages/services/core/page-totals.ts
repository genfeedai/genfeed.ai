import { PagesService } from '@services/content/pages.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

/**
 * Publishes the JSON:API `pagination` links of a list response to
 * {@link PagesService} so AutoPagination can render page controls and totals.
 * Mirrors `BaseService.findAll`: nothing is recorded unless the caller asked
 * for a specific `page`. Pass the id from `PagesService.beginRequest()`, taken
 * before the request was sent, so a slower earlier request cannot overwrite the
 * totals of a newer one.
 */
export function recordPageTotals(
  document: JsonApiResponseDocument,
  query?: { page?: number },
  requestId?: number,
): void {
  const pagination = document.links?.pagination;

  if (!query?.page || !pagination) {
    return;
  }

  PagesService.recordTotals(
    {
      page: pagination.page,
      pages: pagination.pages,
      total: pagination.total ?? 0,
    },
    requestId,
  );
}
