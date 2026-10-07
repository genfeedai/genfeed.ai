import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';

interface JsonApiErrorDocument {
  readonly errors?: unknown;
}

export interface JsonApiErrorMemberView {
  readonly code?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly title?: string;
}

function parseHttpStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return undefined;
}

function getErrorDocument(error: unknown): JsonApiErrorDocument | null {
  if (!isRecord(error)) {
    return null;
  }
  if ('errors' in error) {
    return error;
  }

  const response = error.response;
  if (!isRecord(response) || !isRecord(response.data)) {
    return null;
  }
  return response.data;
}

export function getJsonApiErrorMember(
  error: unknown,
): JsonApiErrorMemberView | null {
  const document = getErrorDocument(error);
  const firstError = Array.isArray(document?.errors)
    ? document.errors.find(isRecord)
    : undefined;
  if (!firstError) {
    return null;
  }

  const code =
    typeof firstError.code === 'string' || typeof firstError.code === 'number'
      ? String(firstError.code)
      : undefined;

  return {
    code,
    detail:
      typeof firstError.detail === 'string' ? firstError.detail : undefined,
    status:
      parseHttpStatusCode(firstError.status) ??
      parseHttpStatusCode(firstError.code),
    title: typeof firstError.title === 'string' ? firstError.title : undefined,
  };
}

export function getJsonApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const member = getJsonApiErrorMember(error);
  if (member?.detail?.trim()) {
    return member.detail.trim();
  }
  if (member?.title?.trim()) {
    return member.title.trim();
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Reads one named primitive out of the first error member's `meta`.
 *
 * `getJsonApiErrorMember` deliberately drops `meta` wholesale because a server
 * may put personal data in it. These readers keep that guarantee: the object
 * never escapes, and a caller only ever receives the single primitive it asked
 * for by name.
 */
function readErrorMetaValue(error: unknown, key: string): unknown {
  const document = getErrorDocument(error);
  const firstError = Array.isArray(document?.errors)
    ? document.errors.find(isRecord)
    : undefined;
  const meta = firstError?.meta;

  return isRecord(meta) ? meta[key] : undefined;
}

/**
 * Reads `key` from the first error member's `meta` as a finite number.
 * Returns undefined when the key is absent or holds any other type, so a
 * string in `meta` can never reach a caller through this reader.
 */
export function getJsonApiErrorMetaNumber(
  error: unknown,
  key: string,
): number | undefined {
  const value = readErrorMetaValue(error, key);

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Reads `key` from the first error member's `meta` as a boolean. Returns
 * undefined when the key is absent or holds any other type, so a truthy
 * lookalike such as the string `'true'` is never treated as `true`.
 */
export function getJsonApiErrorMetaBoolean(
  error: unknown,
  key: string,
): boolean | undefined {
  const value = readErrorMetaValue(error, key);

  return typeof value === 'boolean' ? value : undefined;
}

/** Only server-owned persisted video identity survives this bounded reader. */
export function getPersistedVideoIngredientIds(
  error: unknown,
): readonly string[] {
  const value =
    error instanceof Error && 'persistedVideoIngredientIds' in error
      ? error.persistedVideoIngredientIds
      : readErrorMetaValue(error, 'persistedVideoIngredientIds');
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 4 ||
    new Set(value).size !== value.length ||
    value.some(
      (id) =>
        typeof id !== 'string' ||
        id.length < 1 ||
        id.length > 128 ||
        id.trim() !== id ||
        [...id].some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || (code >= 127 && code <= 159);
        }),
    )
  )
    return [];
  return [...value];
}
