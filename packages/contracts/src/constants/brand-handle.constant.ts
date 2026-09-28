/**
 * A brand handle is `Brand.slug`: the `/u/<handle>` public profile path and
 * the `[brandSlug]` app route segment. It is unique across every brand,
 * including soft-deleted ones, which still hold the database constraint.
 */
export const BRAND_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BRAND_HANDLE_MIN_LENGTH = 2;
export const BRAND_HANDLE_MAX_LENGTH = 48;
export const BRAND_HANDLE_FORMAT_MESSAGE =
  'Handle must be 2-48 lowercase letters or numbers, separated by single hyphens.';
export const BRAND_HANDLE_TAKEN_MESSAGE = 'This handle is already taken.';

/** Accepts what people type: a leading `@`, surrounding spaces, capitals. */
export function normalizeBrandHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidBrandHandle(value: string): boolean {
  return (
    value.length >= BRAND_HANDLE_MIN_LENGTH &&
    value.length <= BRAND_HANDLE_MAX_LENGTH &&
    BRAND_HANDLE_PATTERN.test(value)
  );
}
