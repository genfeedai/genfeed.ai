import {
  APP_ROUTES,
  createPublishingApprovalsRoute,
} from '@genfeedai/contracts/constants';

type LegacySearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}

/**
 * Calendar and Approvals used to be `?view=` tabs on the Posts list. Returns
 * the scope-less path that replaces such a URL, or null for a plain Posts URL.
 */
export function resolveLegacyPublishingViewPath(
  searchParams: LegacySearchParams,
): string | null {
  const view = firstValue(searchParams.view);

  if (view === 'approvals') {
    return createPublishingApprovalsRoute({
      approval: firstValue(searchParams.approval),
      filter: firstValue(searchParams.filter),
      item: firstValue(searchParams.item),
      run: firstValue(searchParams.run),
    });
  }

  if (view === 'calendar') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'view' || value === undefined) continue;
      for (const entry of Array.isArray(value) ? value : [value]) {
        params.append(key, entry);
      }
    }
    const query = params.toString();
    return query
      ? `${APP_ROUTES.PUBLISHING.CALENDAR}?${query}`
      : APP_ROUTES.PUBLISHING.CALENDAR;
  }

  return null;
}
