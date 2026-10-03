import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export interface SkillPackageInputOptions {
  slug: string;
  reference?: readonly string[];
  sourceUrl?: string;
  checksum?: string;
}

export interface SkillPackageImportInput {
  slug: string;
  sourceUrl?: string;
  expectedPackageChecksum?: string;
  package:
    | { format: 'files'; files: { content: string; path: string }[] }
    | { format: 'zip'; archiveBase64: string };
}

const MAX_ARCHIVE_BYTES = 1_000_000;
const MAX_ENTRY_BYTES = 128_000;
const MAX_TOTAL_BYTES = 512_000;
const MAX_ENTRIES = 128;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function invalid(message: string): never {
  throw new Error(`Invalid skill package input: ${message}`);
}

function hasControls(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}

function validateReference(relativePath: string): void {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    /[\\:]/.test(relativePath) ||
    hasControls(relativePath) ||
    !relativePath.endsWith('.md') ||
    Buffer.byteLength(relativePath, 'utf8') > 65_535 ||
    relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
    invalid('References must be relative Markdown file paths without traversal.');
}

/** Refuse symbolic directory components inside the selected package directory. */
async function validateParents(baseDirectory: string, relativePath: string): Promise<void> {
  let parent = baseDirectory;
  const directories = [parent];
  for (const segment of relativePath.split('/').slice(0, -1)) {
    parent = path.join(parent, segment);
    directories.push(parent);
  }
  for (const directory of directories) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      invalid('Package directories must not be symbolic links.');
  }
}

async function readBoundedFile(filePath: string, limit: number): Promise<Buffer> {
  // NONBLOCK avoids waiting on a FIFO before fstat can reject nonregular files.
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o111) !== 0 || stat.size > limit)
      invalid('Files must be bounded, regular and nonexecutable.');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > limit) invalid('File byte limit exceeded.');
    const finalStat = await handle.stat();
    if (!finalStat.isFile() || (finalStat.mode & 0o111) !== 0 || finalStat.size > limit)
      invalid('File changed during bounded read.');
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

/** Build transport input only. The server remains authoritative for ZIP/YAML/checksum policy. */
export async function readSkillPackageInput(
  filePath: string,
  options: SkillPackageInputOptions
): Promise<SkillPackageImportInput> {
  if (!options.slug || options.slug.length > 160 || !/^[a-z0-9][a-z0-9-]*$/i.test(options.slug))
    invalid('Choose a valid skill slug of at most 160 ASCII characters.');
  const input: SkillPackageImportInput = {
    package: { files: [], format: 'files' },
    slug: options.slug.toLowerCase(),
  };
  if (options.sourceUrl !== undefined) {
    const value = options.sourceUrl;
    if (
      !value ||
      value !== value.trim() ||
      hasControls(value) ||
      Buffer.byteLength(value, 'utf8') > 2000
    )
      invalid('Source URL must be a bounded HTTP(S) URL without credentials.');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      invalid('Source URL must be a bounded HTTP(S) URL without credentials.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      invalid('Source URL must be a bounded HTTP(S) URL without credentials.');
    input.sourceUrl = value;
  }
  if (options.checksum !== undefined) {
    if (!/^(?:sha256:)?[a-fA-F0-9]{64}$/.test(options.checksum))
      invalid('Checksum must be a SHA256 package checksum.');
    input.expectedPackageChecksum = options.checksum.replace(/^sha256:/, '').toLowerCase();
  }
  if (!filePath || filePath.includes('\0')) invalid('Select a root SKILL.md or package.zip file.');
  const rootPath = path.resolve(filePath);
  const references = options.reference ?? [];
  const isZip = path.extname(rootPath).toLowerCase() === '.zip';
  if (isZip && references.length) invalid('ZIP inputs cannot include external reference options.');
  if (!isZip && path.basename(rootPath) !== 'SKILL.md')
    invalid('The direct-file package must have an exact root SKILL.md.');
  if (references.length + 1 > MAX_ENTRIES)
    invalid('A direct package may contain at most 128 files.');
  const names = new Set(['skill.md']);
  for (const reference of references) {
    validateReference(reference);
    const key = reference.normalize('NFC').toLowerCase();
    if (names.has(key)) invalid('Reference paths must be unique and must not alias SKILL.md.');
    names.add(key);
  }
  try {
    const baseDirectory = path.dirname(rootPath);
    await validateParents(baseDirectory, path.basename(rootPath));
    if (isZip) {
      const bytes = await readBoundedFile(rootPath, MAX_ARCHIVE_BYTES);
      if (!bytes.length) invalid('ZIP input must not be empty.');
      input.package = { archiveBase64: bytes.toString('base64'), format: 'zip' };
      return input;
    }
    const files: { content: string; path: string }[] = [];
    let total = 0;
    for (const relativePath of ['SKILL.md', ...references]) {
      await validateParents(baseDirectory, relativePath);
      const bytes = await readBoundedFile(path.join(baseDirectory, relativePath), MAX_ENTRY_BYTES);
      // Recheck ancestors after the bounded read; reject detected directory symlink changes.
      await validateParents(baseDirectory, relativePath);
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) invalid('Direct package total byte limit exceeded.');
      files.push({ content: decoder.decode(bytes), path: relativePath });
    }
    input.package = { files, format: 'files' };
    return input;
  } catch {
    invalid(
      'Package files must be readable, bounded, regular, nonexecutable and nonsymlink; Markdown must be valid UTF8.'
    );
  }
}
