export const ITEMS_PER_PAGE = 15;

/**
 * Largest page the API will serve. `BaseQueryDto` declares `@Max(100)` on
 * `limit`, so the ValidationPipe rejects anything bigger with a 400 before a
 * handler runs — it is not clamped. Callers that need a whole small collection
 * in one request use this; callers that may exceed it walk pages via
 * `BaseService.findAllPages`.
 */
export const MAX_PAGE_SIZE = 100;
