import { PagesService } from '@services/content/pages.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

/**
 * Publishes the JSON:API `pagination` links of a list response to
 * {@link PagesService} so AutoPagination can render page controls and totals.
 * Mirrors `BaseService.findAll`: nothing is recorded unless the caller asked
 * for a specific `page`.
 */
export function recordPageTotals(
  document: JsonApiResponseDocument,
  query?: { page?: number },
): void {
  const pagination = document.links?.pagination;

  if (!query?.page || !pagination) {
    return;
  }

  PagesService.setCurrentPage(pagination.page);
  PagesService.setTotalPages(pagination.pages);
  PagesService.setTotalDocs(pagination.total ?? 0);
}
