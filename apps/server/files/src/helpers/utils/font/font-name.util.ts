import fs from 'node:fs';

const NAME_ID_FAMILY = 1;
const NAME_ID_SUBFAMILY = 2;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_TYPOGRAPHIC_SUBFAMILY = 17;

const cache = new Map<string, string | null>();

function readUtf16(buffer: Buffer): string {
  let text = '';
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    text += String.fromCharCode(buffer.readUInt16BE(index));
  }
  return text;
}

function readNameRecords(data: Buffer): Map<number, string> {
  const names = new Map<number, string>();
  const tableCount = data.readUInt16BE(4);
  let tableOffset = 0;
  for (let index = 0; index < tableCount; index += 1) {
    const entry = 12 + index * 16;
    if (data.toString('latin1', entry, entry + 4) === 'name') {
      tableOffset = data.readUInt32BE(entry + 8);
      break;
    }
  }
  if (!tableOffset) return names;

  const recordCount = data.readUInt16BE(tableOffset + 2);
  const stringsOffset = tableOffset + data.readUInt16BE(tableOffset + 4);
  for (let index = 0; index < recordCount; index += 1) {
    const record = tableOffset + 6 + index * 12;
    const platform = data.readUInt16BE(record);
    const nameId = data.readUInt16BE(record + 6);
    if ((platform !== 0 && platform !== 3) || names.has(nameId)) continue;
    const length = data.readUInt16BE(record + 8);
    const start = stringsOffset + data.readUInt16BE(record + 10);
    names.set(nameId, readUtf16(data.subarray(start, start + length)));
  }
  return names;
}

/**
 * The name fontconfig knows a TTF by, such as `Inter Bold` or
 * `Montserrat Black`: the typographic family when the file has one, then the
 * style unless it is plain `Regular`. Returns `null` when the file cannot be
 * read as a TrueType font.
 */
export function readFontDisplayName(fontPath: string): string | null {
  const cached = cache.get(fontPath);
  if (cached !== undefined) return cached;

  let name: string | null = null;
  try {
    const names = readNameRecords(fs.readFileSync(fontPath));
    const family =
      names.get(NAME_ID_TYPOGRAPHIC_FAMILY) ?? names.get(NAME_ID_FAMILY);
    const style =
      names.get(NAME_ID_TYPOGRAPHIC_SUBFAMILY) ?? names.get(NAME_ID_SUBFAMILY);
    if (family) {
      name = style && style !== 'Regular' ? `${family} ${style}` : family;
    }
  } catch {
    name = null;
  }
  cache.set(fontPath, name);
  return name;
}
