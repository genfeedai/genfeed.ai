import { crc32, deflateRawSync } from 'node:zlib';
import { parseSkillsProPack } from '@api/skills-pro/utils/skill-pack-archive.util';

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

const metadata = {
  description: 'A pack',
  name: 'pack',
  tags: ['image'],
  version: '1.0.0',
};
const entries = [
  { content: JSON.stringify(metadata), path: 'metadata.json' },
  { content: '---\nname: pack\n---\n# Primary', path: 'SKILL.md' },
  { content: 'Zulu', path: 'references/z.md' },
  { content: 'Alpha', path: 'references/a.md' },
];
describe('parseSkillsProPack', () => {
  it('preserves metadata/frontmatter stripping/sorted reference composition', () => {
    expect(parseSkillsProPack(createSkillZip(entries))).toEqual({
      files: expect.arrayContaining(entries),
      instructions:
        '# Primary\n\n## Pack file: references/a.md\n\nAlpha\n\n## Pack file: references/z.md\n\nZulu',
      metadata,
    });
  });
  it('rejects unknown attachments rather than filtering them', () => {
    expect(() =>
      parseSkillsProPack(
        createSkillZip([...entries, { content: 'execute', path: 'script.sh' }]),
      ),
    ).toThrow();
  });
  it('requires root metadata and SKILL.md and valid metadata', () => {
    expect(() => parseSkillsProPack(createSkillZip(entries.slice(1)))).toThrow(
      'metadata.json and SKILL.md',
    );
    expect(() =>
      parseSkillsProPack(
        createSkillZip(entries.filter((entry) => entry.path !== 'SKILL.md')),
      ),
    ).toThrow('metadata.json and SKILL.md');
    expect(() =>
      parseSkillsProPack(
        createSkillZip(
          entries.map((entry) =>
            entry.path === 'metadata.json'
              ? { ...entry, content: '{}' }
              : entry,
          ),
        ),
      ),
    ).toThrow('required fields');
  });
});
