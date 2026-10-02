import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { parseSkillPackageArchive } from '@api/collections/skills/utils/skill-package-archive.util';

function createSkillZip(
  entries: Array<{
    path: string;
    content: string | Buffer;
    mode?: number;
    method?: number;
    isDescriptor?: boolean;
  }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content);
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const flags = 0x800 | (entry.isDescriptor ? 8 : 0);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    if (!entry.isDescriptor) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(content.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    const descriptor = Buffer.alloc(entry.isDescriptor ? 16 : 0);
    if (entry.isDescriptor) {
      descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, 4);
      descriptor.writeUInt32LE(compressed.length, 8);
      descriptor.writeUInt32LE(content.length, 12);
    }
    locals.push(local, name, compressed, descriptor);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(
      ((entry.mode ?? (entry.path.endsWith('/') ? 0o40755 : 0o100644)) <<
        16) >>>
        0,
      38,
    );
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset +=
      local.length + name.length + compressed.length + descriptor.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const skill = { content: '# Instructions', path: 'SKILL.md' };
function centralOffset(zip: Buffer): number {
  return zip.readUInt32LE(zip.length - 6);
}

describe('parseSkillPackageArchive', () => {
  it('reads stored/deflated UTF8 files and safe directories with deterministic checksums', () => {
    const entries = [
      skill,
      { content: '', path: 'references/' },
      {
        content: 'Café',
        path: 'references/a.md',
        method: 8,
        isDescriptor: true,
      },
    ];
    const zip = createSkillZip(entries);
    const result = parseSkillPackageArchive(zip);
    expect(result.files).toEqual([
      skill,
      { content: 'Café', path: 'references/a.md' },
    ]);
    expect(result.archiveSha256).toBe(
      createHash('sha256').update(zip).digest('hex'),
    );
    expect(result.packageChecksum).toBe(
      parseSkillPackageArchive(createSkillZip([...entries].reverse()))
        .packageChecksum,
    );
    expect(result.packageChecksum).not.toBe(
      parseSkillPackageArchive(
        createSkillZip([{ ...skill, content: 'Changed' }]),
      ).packageChecksum,
    );
  });
  it.each([
    '../x.md',
    '/x.md',
    'C:x.md',
    'a\\b.md',
    './a.md',
    'a//b.md',
    'a/../b.md',
    'a\u0000.md',
    'a\n.md',
    'script.sh',
    'image.png',
    'metadata.JSON',
  ])('rejects unsafe or unsupported path %j', (path) => {
    expect(() =>
      parseSkillPackageArchive(createSkillZip([skill, { content: 'x', path }])),
    ).toThrow();
  });
  it.each([0o120777, 0o100755, 0o20644, 0o10644, 0o60644])(
    'rejects executable/nonregular mode %s',
    (mode) => {
      expect(() =>
        parseSkillPackageArchive(createSkillZip([{ ...skill, mode }])),
      ).toThrow();
    },
  );
  it.each(['SKILL.md', 'skill.md', 'SKILL.md/child.md'])(
    'rejects duplicate/case/file-parent collisions %s',
    (path) => {
      expect(() =>
        parseSkillPackageArchive(
          createSkillZip([skill, { content: 'x', path }]),
        ),
      ).toThrow();
    },
  );
  it('rejects malformed UTF8 paths and file content', () => {
    expect(() =>
      parseSkillPackageArchive(
        createSkillZip([{ ...skill, content: Buffer.from([0xff]) }]),
      ),
    ).toThrow();
    const zip = createSkillZip([skill]);
    zip[30] = 0xff;
    zip[centralOffset(zip) + 46] = 0xff;
    expect(() => parseSkillPackageArchive(zip)).toThrow();
  });
  it.each([0, 1, 8, 10, 12, 16])('rejects malformed EOCD field %s', (field) => {
    const zip = createSkillZip([skill]);
    zip.writeUInt16LE(0xffff, zip.length - 22 + field);
    expect(() => parseSkillPackageArchive(zip)).toThrow();
  });
  it.each([4, 6, 8, 10, 14, 18, 22, 26, 28, 30])(
    'rejects inconsistent local header field %s',
    (field) => {
      const zip = createSkillZip([skill]);
      zip[field] ^= 1;
      expect(() => parseSkillPackageArchive(zip)).toThrow();
    },
  );
  it.each([8, 10, 16, 20, 24, 28, 30, 32, 34, 42])(
    'rejects inconsistent central field %s',
    (field) => {
      const zip = createSkillZip([skill]);
      zip[centralOffset(zip) + field] ^= 1;
      expect(() => parseSkillPackageArchive(zip)).toThrow();
    },
  );
  it('rejects corrupt payload/descriptor, truncation and trailing bytes', () => {
    const zip = createSkillZip([skill]);
    zip[30 + skill.path.length] ^= 1;
    expect(() => parseSkillPackageArchive(zip)).toThrow();
    const descriptor = createSkillZip([{ ...skill, isDescriptor: true }]);
    descriptor[centralOffset(descriptor) - 8] ^= 1;
    expect(() => parseSkillPackageArchive(descriptor)).toThrow();
    expect(() =>
      parseSkillPackageArchive(zip.subarray(0, zip.length - 1)),
    ).toThrow();
    expect(() =>
      parseSkillPackageArchive(
        Buffer.concat([createSkillZip([skill]), Buffer.from('x')]),
      ),
    ).toThrow();
  });
  it('rejects overlapping local offsets, encrypted files, unsupported compression and fake CRCs in both headers', () => {
    const zip = createSkillZip([skill, { path: 'a.md', content: 'Reference' }]);
    const second = centralOffset(zip) + 46 + skill.path.length;
    zip.writeUInt32LE(0, second + 42);
    expect(() => parseSkillPackageArchive(zip)).toThrow();
    const fake = createSkillZip([skill]);
    fake.writeUInt32LE(0, 14);
    fake.writeUInt32LE(0, centralOffset(fake) + 16);
    expect(() => parseSkillPackageArchive(fake)).toThrow();
    expect(() =>
      parseSkillPackageArchive(createSkillZip([{ ...skill, method: 12 }])),
    ).toThrow();
  });
  it('rejects ZIP64 extra fields and inconsistent central directory size', () => {
    const original = createSkillZip([skill]);
    const directory = centralOffset(original);
    const extra = Buffer.from([1, 0, 0, 0]);
    const zip = Buffer.concat([
      original.subarray(0, directory + 46 + skill.path.length),
      extra,
      original.subarray(directory + 46 + skill.path.length),
    ]);
    zip.writeUInt16LE(4, directory + 30);
    zip.writeUInt32LE(46 + skill.path.length + 4, zip.length - 10);
    expect(() => parseSkillPackageArchive(zip)).toThrow();
  });
  it('rejects archive/entry/count/total limits and compressed expansion bombs', () => {
    expect(() => parseSkillPackageArchive(Buffer.alloc(1_000_001))).toThrow();
    expect(() =>
      parseSkillPackageArchive(
        createSkillZip(
          Array.from({ length: 129 }, (_, i) => ({
            content: '',
            path: `${i}.md`,
          })),
        ),
      ),
    ).toThrow();
    expect(() =>
      parseSkillPackageArchive(
        createSkillZip([{ ...skill, content: 'x'.repeat(128_001) }]),
      ),
    ).toThrow();
    expect(() =>
      parseSkillPackageArchive(
        createSkillZip(
          Array.from({ length: 5 }, (_, i) => ({
            content: 'x'.repeat(128_000),
            path: `${i}.md`,
          })),
        ),
      ),
    ).toThrow();
    const zip = createSkillZip([
      { ...skill, content: 'x'.repeat(128_001), method: 8 },
    ]);
    zip.writeUInt32LE(1, 22);
    zip.writeUInt32LE(1, centralOffset(zip) + 24);
    expect(() => parseSkillPackageArchive(zip)).toThrow();
  });
});
