import { inflateRawSync } from 'node:zlib';

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_ARCHIVE_ENTRIES = 128;
const MAX_ENTRY_BYTES = 128_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512_000;

export interface SkillsProPackMetadata {
  category?: string;
  description: string;
  name: string;
  tags: string[];
  version: string;
}

export interface ParsedSkillsProPack {
  files: Array<{ content: string; path: string }>;
  instructions: string;
  metadata: SkillsProPackMetadata;
}

interface ZipEntry {
  compressedSize: number;
  compressionMethod: number;
  fileName: string;
  localHeaderOffset: number;
  uncompressedSize: number;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.length - 65_557);

  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('Skills Pro pack is not a valid ZIP archive');
}

function assertSafeArchivePath(fileName: string): void {
  const normalized = fileName.replaceAll('\\', '/');
  const pathWithoutDirectorySuffix = normalized.endsWith('/')
    ? normalized.slice(0, -1)
    : normalized;
  const segments = pathWithoutDirectorySuffix.split('/');

  if (
    !pathWithoutDirectorySuffix ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Skills Pro pack contains an unsafe path: ${fileName}`);
  }
}

function readCentralDirectory(archive: Buffer): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(endOffset + 16);

  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Skills Pro pack contains too many files');
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > archive.length ||
      archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error('Skills Pro pack central directory is invalid');
    }

    const flags = archive.readUInt16LE(offset + 8);
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > archive.length || flags & 0x1) {
      throw new Error('Skills Pro pack contains an unreadable ZIP entry');
    }

    const fileName = archive.subarray(nameStart, nameEnd).toString('utf8');
    assertSafeArchivePath(fileName);

    if (!fileName.endsWith('/')) {
      if (uncompressedSize > MAX_ENTRY_BYTES) {
        throw new Error(`Skills Pro pack file is too large: ${fileName}`);
      }
      entries.push({
        compressedSize,
        compressionMethod,
        fileName,
        localHeaderOffset,
        uncompressedSize,
      });
    }

    offset = nameEnd + extraLength + commentLength;
  }

  const totalBytes = entries.reduce(
    (sum, entry) => sum + entry.uncompressedSize,
    0,
  );
  if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error('Skills Pro pack expands beyond the allowed size');
  }

  return entries;
}

function readEntry(archive: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > archive.length ||
    archive.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE
  ) {
    throw new Error(
      `Skills Pro pack file header is invalid: ${entry.fileName}`,
    );
  }

  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const contentStart = offset + 30 + fileNameLength + extraLength;
  const contentEnd = contentStart + entry.compressedSize;
  if (contentEnd > archive.length) {
    throw new Error(`Skills Pro pack file is truncated: ${entry.fileName}`);
  }

  const compressed = archive.subarray(contentStart, contentEnd);
  const content =
    entry.compressionMethod === 0
      ? compressed
      : entry.compressionMethod === 8
        ? inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES })
        : undefined;

  if (!content || content.length !== entry.uncompressedSize) {
    throw new Error(
      `Skills Pro pack uses an unsupported or invalid compression method: ${entry.fileName}`,
    );
  }

  return content;
}

function parseMetadata(content: string): SkillsProPackMetadata {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new Error('Skills Pro pack metadata.json is invalid JSON');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Skills Pro pack metadata.json must be an object');
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    typeof record.description !== 'string' ||
    typeof record.version !== 'string' ||
    !record.version.trim()
  ) {
    throw new Error('Skills Pro pack metadata is missing required fields');
  }

  return {
    category: typeof record.category === 'string' ? record.category : undefined,
    description: record.description,
    name: record.name,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    version: record.version,
  };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

export function parseSkillsProPack(archive: Buffer): ParsedSkillsProPack {
  const entries = readCentralDirectory(archive);
  const files = entries
    .filter(
      (entry) =>
        entry.fileName === 'metadata.json' || entry.fileName.endsWith('.md'),
    )
    .map((entry) => ({
      content: readEntry(archive, entry).toString('utf8'),
      path: entry.fileName,
    }));
  const metadataFile = files.find((file) => file.path === 'metadata.json');
  const skillFile = files.find((file) => file.path === 'SKILL.md');

  if (!metadataFile || !skillFile) {
    throw new Error('Skills Pro pack must contain metadata.json and SKILL.md');
  }

  const references = files
    .filter((file) => file.path !== 'SKILL.md')
    .filter((file) => file.path.endsWith('.md'))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `## Pack file: ${file.path}\n\n${file.content.trim()}`);
  const primaryInstructions = stripFrontmatter(skillFile.content);

  return {
    files,
    instructions: [primaryInstructions, ...references]
      .filter(Boolean)
      .join('\n\n'),
    metadata: parseMetadata(metadataFile.content),
  };
}
