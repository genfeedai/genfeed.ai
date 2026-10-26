import type { Page, Request } from '@playwright/test';

/**
 * Categories an `/ingredients` list read asked for. The API client may send
 * them as repeated params or one comma-separated value, so both are read.
 */
function requestedCategories(request: Request): string[] {
  const { searchParams } = new URL(request.url());

  return [
    ...searchParams.getAll('categories'),
    ...searchParams.getAll('category'),
  ]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

/**
 * Resolves with the first `GET /ingredients` list read that asks for exactly
 * these categories. A library type route seeds its category preset into that
 * read, so this is the proof that the type filter is applied, not only that
 * the route rendered. Start it before navigating.
 */
export function waitForIngredientsRead(
  page: Page,
  categories: readonly string[],
): Promise<Request> {
  const expected = [...categories].sort().join(',');

  return page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname.endsWith('/ingredients') &&
      requestedCategories(request).join(',') === expected,
    { timeout: 30000 },
  );
}
