export type SkillImportInputErrorCode =
  | 'SLUG'
  | 'SOURCE_URL'
  | 'CHECKSUM'
  | 'COUNT'
  | 'PATH'
  | 'DIRECTORY'
  | 'ROOT'
  | 'SIZE'
  | 'UTF8'
  | 'READ';

export class SkillImportInputError extends Error {
  constructor(readonly code: SkillImportInputErrorCode) {
    super('Invalid skill package input.');
    this.name = 'SkillImportInputError';
  }
}

export interface SkillImportInputOptions {
  slug: string;
  sourceUrl?: string;
  checksum?: string;
}
export interface SkillImportInputFile {
  content: string;
  path: string;
}
export interface SkillImportInput {
  slug: string;
  sourceUrl?: string;
  expectedPackageChecksum?: string;
  package:
    | { format: 'files'; files: SkillImportInputFile[] }
    | { format: 'zip'; archiveBase64: string };
}

function invalid(code: SkillImportInputErrorCode): never {
  throw new SkillImportInputError(code);
}
function hasControls(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}
function validateName(name: string): void {
  if (
    !name ||
    /[\\/:]/.test(name) ||
    name === '.' ||
    name === '..' ||
    hasControls(name) ||
    new TextEncoder().encode(name).length > 65_535 ||
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
  if (
    !options.slug ||
    options.slug.length > 160 ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(options.slug)
  )
    invalid('SLUG');
  const input: SkillImportInput = {
    slug: options.slug.toLowerCase(),
    package: { format: 'files', files: [] },
  };
  if (options.sourceUrl !== undefined) {
    const value = options.sourceUrl;
    if (
      !value ||
      value !== value.trim() ||
      hasControls(value) ||
      new TextEncoder().encode(value).length > 2000
    )
      invalid('SOURCE_URL');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      invalid('SOURCE_URL');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      invalid('SOURCE_URL');
    input.sourceUrl = value;
  }
  if (options.checksum !== undefined) {
    if (!/^(?:sha256:)?[a-fA-F0-9]{64}$/.test(options.checksum))
      invalid('CHECKSUM');
    input.expectedPackageChecksum = options.checksum
      .replace(/^sha256:/, '')
      .toLowerCase();
  }
  if (files.length > 128) invalid('COUNT');
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
  const limit = isZip ? 1_000_000 : 128_000;
  if (
    isZip
      ? files.length !== 1
      : files.filter((file) => file.name === 'SKILL.md').length !== 1
  )
    invalid('ROOT');
  if (
    files.some((file) => file.size > limit) ||
    (!isZip && declaredTotal > 512_000)
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
      bytes.length > limit ||
      (!isZip && total > 512_000) ||
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
