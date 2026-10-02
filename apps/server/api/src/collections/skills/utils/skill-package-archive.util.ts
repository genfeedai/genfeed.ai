import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { crc32, inflateRawSync } from 'node:zlib';

const MAX_ARCHIVE_BYTES = 1_000_000;
const MAX_ENTRIES = 128;
const MAX_ENTRY_BYTES = 128_000;
const MAX_TOTAL_BYTES = 512_000;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export interface ParsedSkillPackageArchive {
  archiveSha256: string;
  files: Array<{ content: string; path: string }>;
  packageChecksum: string;
}

interface InflatedEntry {
  buffer: Buffer;
  engine: { bytesWritten: number };
}

interface ArchiveEntry {
  crc: number;
  compressedSize: number;
  flags: number;
  isDirectory: boolean;
  localOffset: number;
  method: number;
  name: Buffer;
  path: string;
  size: number;
  version: number;
  timestamp: number;
}

function invalid(reason: string): never {
  throw new Error(`Skill package ZIP is invalid: ${reason}`);
}

function assertRange(start: number, length: number, end: number): void {
  if (start < 0 || length < 0 || start + length > end)
    invalid('truncated structure');
}

function assertExtra(extra: Buffer): void {
  let offset = 0;
  while (offset < extra.length) {
    assertRange(offset, 4, extra.length);
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    assertRange(offset + 4, size, extra.length);
    if (id === 1 || id === 0x7075) invalid('ZIP64 or alternate path');
    offset += 4 + size;
  }
}

function assertPath(path: string): void {
  const plain = path.endsWith('/') ? path.slice(0, -1) : path;
  if (
    !plain ||
    /[\\:]/.test(path) ||
    [...path].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    path.startsWith('/') ||
    plain
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    invalid('unsafe path');
  }
  if (
    !path.endsWith('/') &&
    path !== 'metadata.json' &&
    !path.endsWith('.md')
  ) {
    invalid('unsupported attachment');
  }
}

function readEntries(archive: Buffer): {
  entries: ArchiveEntry[];
  centralOffset: number;
} {
  let end = -1;
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - 65_557);
    offset--
  ) {
    if (
      archive.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + archive.readUInt16LE(offset + 20) === archive.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) invalid('end of central directory');
  const count = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (
    archive.readUInt16LE(end + 4) !== 0 ||
    archive.readUInt16LE(end + 6) !== 0 ||
    archive.readUInt16LE(end + 8) !== count ||
    count > MAX_ENTRIES ||
    count === 0 ||
    centralOffset + centralSize !== end
  )
    invalid('directory bounds or multidisk');
  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  let total = 0;
  let offset = centralOffset;
  for (let index = 0; index < count; index++) {
    assertRange(offset, 46, end);
    if (archive.readUInt32LE(offset) !== 0x02014b50)
      invalid('central signature');
    const version = archive.readUInt16LE(offset + 6);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const size = archive.readUInt32LE(offset + 24);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameSize = archive.readUInt16LE(offset + 28);
    const extraSize = archive.readUInt16LE(offset + 30);
    const commentSize = archive.readUInt16LE(offset + 32);
    assertRange(offset + 46, nameSize + extraSize + commentSize, end);
    if (
      version > 20 ||
      flags & ~0x080e ||
      (method !== 0 && method !== 8) ||
      (method === 0 && flags & 6) ||
      archive.readUInt16LE(offset + 34) !== 0 ||
      compressedSize === 0xffffffff ||
      size > MAX_ENTRY_BYTES
    )
      invalid('unsupported entry or size');
    const name = archive.subarray(offset + 46, offset + 46 + nameSize);
    const path = decoder.decode(name);
    assertPath(path);
    const isDirectory = path.endsWith('/');
    const key = (isDirectory ? path.slice(0, -1) : path)
      .normalize('NFC')
      .toLowerCase();
    if (names.has(key)) invalid('duplicate path');
    names.add(key);
    const attributes = archive.readUInt32LE(offset + 38);
    const mode = attributes >>> 16;
    const type = mode & 0o170000;
    if (
      (type !== 0 && type !== (isDirectory ? 0o040000 : 0o100000)) ||
      (!isDirectory && mode & 0o111) ||
      attributes & 8 ||
      (!isDirectory && attributes & 16) ||
      (isDirectory && size !== 0)
    )
      invalid('nonregular or executable entry');
    assertExtra(
      archive.subarray(
        offset + 46 + nameSize,
        offset + 46 + nameSize + extraSize,
      ),
    );
    total += size;
    if (total > MAX_TOTAL_BYTES) invalid('total decoded size');
    entries.push({
      compressedSize,
      crc: archive.readUInt32LE(offset + 16),
      flags,
      isDirectory,
      localOffset: archive.readUInt32LE(offset + 42),
      method,
      name,
      path,
      size,
      version,
      timestamp: archive.readUInt32LE(offset + 12),
    });
    offset += 46 + nameSize + extraSize + commentSize;
  }
  if (offset !== end) invalid('central directory size');
  const files = new Set(
    entries
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.path.normalize('NFC').toLowerCase()),
  );
  for (const entry of entries) {
    const segments = entry.path.normalize('NFC').toLowerCase().split('/');
    for (let i = 1; i < segments.length; i++) {
      if (files.has(segments.slice(0, i).join('/')))
        invalid('file used as directory');
    }
  }
  return { centralOffset, entries };
}

/** Validates all entries without extracting, executing, persisting or fetching anything.
 * The archive hash identifies transport bytes; the package checksum hashes sorted
 * path/content pairs and is deliberately separate from immutable skill-version hashes.
 */
export function parseSkillPackageArchive(
  archive: Buffer,
): ParsedSkillPackageArchive {
  if (archive.length > MAX_ARCHIVE_BYTES || archive.length < 22)
    invalid('archive size');
  const { centralOffset, entries } = readEntries(archive);
  const files: ParsedSkillPackageArchive['files'] = [];
  let previousEnd = 0;
  for (const entry of [...entries].sort(
    (a, b) => a.localOffset - b.localOffset,
  )) {
    const offset = entry.localOffset;
    assertRange(offset, 30, centralOffset);
    if (
      offset !== previousEnd ||
      archive.readUInt32LE(offset) !== 0x04034b50 ||
      archive.readUInt16LE(offset + 4) !== entry.version ||
      archive.readUInt32LE(offset + 10) !== entry.timestamp ||
      archive.readUInt16LE(offset + 6) !== entry.flags ||
      archive.readUInt16LE(offset + 8) !== entry.method
    )
      invalid('local header mismatch or overlap');
    const nameSize = archive.readUInt16LE(offset + 26);
    const extraSize = archive.readUInt16LE(offset + 28);
    const start = offset + 30 + nameSize + extraSize;
    assertRange(
      offset + 30,
      nameSize + extraSize + entry.compressedSize,
      centralOffset,
    );
    if (
      !archive.subarray(offset + 30, offset + 30 + nameSize).equals(entry.name)
    )
      invalid('local name mismatch');
    assertExtra(archive.subarray(offset + 30 + nameSize, start));
    const hasDescriptor = Boolean(entry.flags & 8);
    for (const [field, expected] of [
      [14, entry.crc],
      [18, entry.compressedSize],
      [22, entry.size],
    ]) {
      const value = archive.readUInt32LE(offset + field);
      if (value !== expected && !(hasDescriptor && value === 0))
        invalid('local size or CRC mismatch');
    }
    const compressed = archive.subarray(start, start + entry.compressedSize);
    let bytes = compressed;
    if (entry.method === 8) {
      // Node's declarations omit the documented `info: true` result shape.
      const result = inflateRawSync(compressed, {
        maxOutputLength: MAX_ENTRY_BYTES,
        info: true,
      }) as unknown as InflatedEntry;
      bytes = result.buffer;
      if (result.engine.bytesWritten !== compressed.length)
        invalid('trailing compressed data');
    }
    if (bytes.length !== entry.size || crc32(bytes) !== entry.crc)
      invalid('decoded size or CRC mismatch');
    let dataEnd = start + entry.compressedSize;
    if (hasDescriptor) {
      assertRange(dataEnd, 12, centralOffset);
      if (archive.readUInt32LE(dataEnd) === 0x08074b50) dataEnd += 4;
      assertRange(dataEnd, 12, centralOffset);
      if (
        archive.readUInt32LE(dataEnd) !== entry.crc ||
        archive.readUInt32LE(dataEnd + 4) !== entry.compressedSize ||
        archive.readUInt32LE(dataEnd + 8) !== entry.size
      )
        invalid('data descriptor');
      dataEnd += 12;
    }
    previousEnd = dataEnd;
    if (!entry.isDirectory)
      files.push({ content: decoder.decode(bytes), path: entry.path });
  }
  if (previousEnd !== centralOffset) invalid('unlisted local data');
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    archiveSha256: createHash('sha256').update(archive).digest('hex'),
    files,
    packageChecksum: createHash('sha256')
      .update(JSON.stringify(files))
      .digest('hex'),
  };
}
