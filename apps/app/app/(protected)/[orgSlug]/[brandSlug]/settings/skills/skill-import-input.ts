import {
  hasSkillPackageControlCharacters,
  isSkillPackageEntryCountAllowed,
  isSkillPackageFileSizeAllowed,
  isSkillPackageTotalSizeAllowed,
  isValidSkillPackageChecksum,
  isValidSkillPackageSlug,
  isValidSkillPackageSourceUrl,
  normalizeSkillPackageChecksum,
  SKILL_PACKAGE_MAX_PATH_BYTES,
} from '@genfeedai/contracts/constants';
import type {
  SkillImportInput,
  SkillImportInputErrorCode,
  SkillImportInputFile,
  SkillImportInputOptions,
} from '@props/settings/skills.props';

export type {
  SkillImportInput,
  SkillImportInputErrorCode,
  SkillImportInputFile,
  SkillImportInputOptions,
} from '@props/settings/skills.props';

export class SkillImportInputError extends Error {
  constructor(readonly code: SkillImportInputErrorCode) {
    super('Invalid skill package input.');
    this.name = 'SkillImportInputError';
  }
}

function invalid(code: SkillImportInputErrorCode): never {
  throw new SkillImportInputError(code);
}
function validateName(name: string): void {
  if (
    !name ||
    /[\\/:]/.test(name) ||
    name === '.' ||
    name === '..' ||
    hasSkillPackageControlCharacters(name) ||
    new TextEncoder().encode(name).length > SKILL_PACKAGE_MAX_PATH_BYTES ||
    (!name.endsWith('.md') && !name.toLowerCase().endsWith('.zip'))
  )
    invalid('PATH');
}
function encodeArchive(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(''));
}

/** Construct bounded transport only; the server validates manifest, ZIP and package checksum. */
export async function buildSkillImportInput(
  files: readonly File[],
  options: SkillImportInputOptions,
  signal?: AbortSignal,
): Promise<SkillImportInput> {
  signal?.throwIfAborted();
  if (!isValidSkillPackageSlug(options.slug)) invalid('SLUG');
  const input: SkillImportInput = {
    slug: options.slug.toLowerCase(),
    package: { format: 'files', files: [] },
  };
  if (options.sourceUrl !== undefined) {
    const value = options.sourceUrl;
    if (!isValidSkillPackageSourceUrl(value)) invalid('SOURCE_URL');
    input.sourceUrl = value;
  }
  if (options.checksum !== undefined) {
    if (!isValidSkillPackageChecksum(options.checksum)) invalid('CHECKSUM');
    input.expectedPackageChecksum = normalizeSkillPackageChecksum(
      options.checksum,
    );
  }
  if (!isSkillPackageEntryCountAllowed(files.length)) invalid('COUNT');
  if (!files.length) invalid('ROOT');
  const names = new Set<string>();
  let declaredTotal = 0;
  for (const file of files) {
    if (file.webkitRelativePath) invalid('DIRECTORY');
    validateName(file.name);
    const key = file.name.normalize('NFC').toLowerCase();
    if (names.has(key)) invalid('PATH');
    names.add(key);
    declaredTotal += file.size;
  }
  const isZip = files.some((file) => file.name.toLowerCase().endsWith('.zip'));
  if (
    isZip
      ? files.length !== 1
      : files.filter((file) => file.name === 'SKILL.md').length !== 1
  )
    invalid('ROOT');
  if (
    files.some((file) => !isSkillPackageFileSizeAllowed(file.size, isZip)) ||
    (!isZip && !isSkillPackageTotalSizeAllowed(declaredTotal))
  )
    invalid('SIZE');
  const decoded: SkillImportInputFile[] = [];
  let total = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      invalid('READ');
    }
    signal?.throwIfAborted();
    total += bytes.length;
    if (
      !isSkillPackageFileSizeAllowed(bytes.length, isZip) ||
      (!isZip && !isSkillPackageTotalSizeAllowed(total)) ||
      (isZip && !bytes.length)
    )
      invalid('SIZE');
    if (isZip) {
      input.package = { format: 'zip', archiveBase64: encodeArchive(bytes) };
      return input;
    }
    let content: string;
    try {
      content = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      invalid('UTF8');
    }
    decoded.push({ content, path: file.name });
  }
  input.package = { format: 'files', files: decoded };
  return input;
}
