const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_REGEX = /^c[a-z0-9]{8,}$/i;
const CUID2_REGEX = /^[a-z][a-z0-9]{23}$/;
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/** Returns whether `value` is an identifier accepted by Genfeed entities. */
export function isEntityId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const id = value.trim();
  if (id.length === 0) {
    return false;
  }

  return (
    UUID_REGEX.test(id) ||
    CUID_REGEX.test(id) ||
    CUID2_REGEX.test(id) ||
    ULID_REGEX.test(id)
  );
}
