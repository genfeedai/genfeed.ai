import { isEntityId } from '@genfeedai/contracts/api-types';

/** Request fields that name a brand directly, by id. */
const BRAND_ID_FIELDS = ['brandId', 'brandIds', 'brand'] as const;

/** `brands/:id/...` routes name the brand `id` rather than `brandId`. */
const BRAND_ID_ROUTE_PATTERN = /(?:^|\/)brands\/:id(?:\/|$)/;

export interface BrandNamingRequest {
  body?: unknown;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  route?: { path?: unknown };
}

export interface BrandRestrictedCaller {
  allowedBrandIds?: readonly string[];
}

function readIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(readIds);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => isEntityId(candidate));
}

function readFields(source: unknown): string[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }
  const record = source as Record<string, unknown>;
  return BRAND_ID_FIELDS.flatMap((field) => readIds(record[field]));
}

/**
 * Every brand id a request names in its path, query or JSON body (#9130).
 * The key guard 404s a brand-restricted key when any of them is outside its
 * list. Ids that are not entity ids (slugs, names) are not brand ids and are
 * left to the handler.
 */
export function collectRequestedBrandIds(
  request: BrandNamingRequest,
): string[] {
  const routePath =
    typeof request.route?.path === 'string' ? request.route.path : '';
  const pathBrandIds = BRAND_ID_ROUTE_PATTERN.test(routePath)
    ? readIds(request.params?.id)
    : [];

  return [
    ...new Set([
      ...pathBrandIds,
      ...readFields(request.params),
      ...readFields(request.query),
      ...readFields(request.body),
    ]),
  ];
}

/**
 * Prisma filter narrowing brand-owned rows to a restricted key's brands; an
 * empty object for every other caller.
 */
export function brandRestrictionWhere(
  caller: BrandRestrictedCaller | undefined,
): { brandId?: { in: string[] } } {
  return caller?.allowedBrandIds
    ? { brandId: { in: [...caller.allowedBrandIds] } }
    : {};
}
