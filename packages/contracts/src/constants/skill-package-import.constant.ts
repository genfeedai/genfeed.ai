/**
 * Single source of truth for skill package import limits and the pure
 * shape/size validators. The API is the authority: it keeps its full checks
 * (ZIP structure, YAML AST, checksum, NUL/surrogates) and imports these same
 * constants. The app and CLI reuse them only for early client feedback.
 */
export const SKILL_PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 1_000_000,
  entries: 128,
  entryBytes: 128_000,
  totalBytes: 512_000,
});

/** Base64 expansion of the largest archive: 4 * ceil(archiveBytes / 3). */
export const SKILL_PACKAGE_MAX_BASE64_CHARACTERS =
  4 * Math.ceil(SKILL_PACKAGE_LIMITS.archiveBytes / 3);
export const SKILL_PACKAGE_MAX_FRONTMATTER_BYTES = 16_000;
export const SKILL_PACKAGE_MAX_PATH_BYTES = 65_535;
export const SKILL_PACKAGE_MAX_SOURCE_URL_BYTES = 2000;
export const SKILL_PACKAGE_MAX_SLUG_LENGTH = 160;
export const SKILL_PACKAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;
export const SKILL_PACKAGE_CHECKSUM_PATTERN = /^(?:sha256:)?[a-fA-F0-9]{64}$/;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** C0 controls, DEL and C1 controls. */
export function hasSkillPackageControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}

export function isValidSkillPackageSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= SKILL_PACKAGE_MAX_SLUG_LENGTH &&
    SKILL_PACKAGE_SLUG_PATTERN.test(value)
  );
}

export function isValidSkillPackageSourceUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    utf8ByteLength(value) > SKILL_PACKAGE_MAX_SOURCE_URL_BYTES ||
    hasSkillPackageControlCharacters(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      // Check the authority both raw and with backslashes read as slashes, so
      // `https://host\\@other` cannot smuggle userinfo past either parser.
      ![value, value.replace(/\\/g, '/')].some((candidate) =>
        /^https?:\/*([^/?#]*)/i.exec(candidate)?.[1]?.includes('@'),
      )
    );
  } catch {
    return false;
  }
}

export function isValidSkillPackageChecksum(value: unknown): value is string {
  return (
    typeof value === 'string' && SKILL_PACKAGE_CHECKSUM_PATTERN.test(value)
  );
}

/** Lowercase hex digest without the optional `sha256:` prefix. */
export function normalizeSkillPackageChecksum(value: string): string {
  return value.replace(/^sha256:/, '').toLowerCase();
}

/** Entry count of a direct file package; ZIP archives are counted by the server. */
export function isSkillPackageEntryCountAllowed(count: number): boolean {
  return count <= SKILL_PACKAGE_LIMITS.entries;
}

/** Largest single input: the archive for ZIP, one entry for direct files. */
export function getSkillPackageFileByteLimit(isZip: boolean): number {
  return isZip
    ? SKILL_PACKAGE_LIMITS.archiveBytes
    : SKILL_PACKAGE_LIMITS.entryBytes;
}

export function isSkillPackageFileSizeAllowed(
  bytes: number,
  isZip: boolean,
): boolean {
  return bytes <= getSkillPackageFileByteLimit(isZip);
}

export function isSkillPackageTotalSizeAllowed(totalBytes: number): boolean {
  return totalBytes <= SKILL_PACKAGE_LIMITS.totalBytes;
}
