import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';

function markdown(
  yaml = 'name: Example\ndescription: A useful skill\nmetadata:\n  version: "1.0"',
  body = '# Instructions',
): string {
  return `---\n${yaml}\n---\n${body}`;
}
function request(content = markdown()) {
  return {
    slug: 'Example-Skill',
    package: { format: 'files', files: [{ path: 'SKILL.md', content }] },
  };
}
function storedZip(content: string): Buffer {
  const name = Buffer.from('SKILL.md');
  const bytes = Buffer.from(content);
  const crc = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

describe('parseSkillPackageManifest', () => {
  it('preserves file bytes and untrimmed metadata, normalizes the slug and composes sorted markdown references', () => {
    const input = request(
      markdown(
        'name: "  Example  "\ndescription: " A useful skill "\nmetadata: {version: " v1 "}\ntrusted: false',
      ),
    );
    input.package.files.push(
      { path: 'z.md', content: ' Z ' },
      { path: 'a.md', content: ' A ' },
      { path: 'metadata.json', content: '{"instructions":"ignored"}' },
    );
    const result = parseSkillPackageManifest(input);
    expect(result.slug).toBe('example-skill');
    expect(result.metadata).toEqual({
      name: '  Example  ',
      description: ' A useful skill ',
      version: ' v1 ',
    });
    expect(result.instructions).toBe(
      '# Instructions\n\n## Pack file: a.md\n\nA\n\n## Pack file: z.md\n\nZ',
    );
    expect(result.files.find((file) => file.path === 'SKILL.md')?.content).toBe(
      input.package.files[0].content,
    );
    expect(result.packageChecksum).toBe(
      createHash('sha256').update(JSON.stringify(result.files)).digest('hex'),
    );
    expect(result).not.toHaveProperty('archiveSha256');
  });
  it('accepts canonical ZIP base64 and verifies content checksum, separately from archive hash', () => {
    const original = request();
    const parsed = parseSkillPackageManifest(original);
    const archive = storedZip(original.package.files[0].content);
    const result = parseSkillPackageManifest({
      slug: 'example-skill',
      sourceUrl: 'https://example.com/skills',
      expectedPackageChecksum: `sha256:${parsed.packageChecksum.toUpperCase()}`,
      package: { format: 'zip', archiveBase64: archive.toString('base64') },
    });
    expect(result.packageChecksum).toBe(parsed.packageChecksum);
    expect(result.archiveSha256).toBe(
      createHash('sha256').update(archive).digest('hex'),
    );
    expect(result.sourceUrl).toBe('https://example.com/skills');
    expect(() =>
      parseSkillPackageManifest({
        ...original,
        expectedPackageChecksum: result.archiveSha256,
      }),
    ).toThrow();
  });
  it.each(['', 'has space', ' example', 'example ', '-first', 'x'.repeat(161)])(
    'rejects invalid slug %j',
    (slug) => {
      expect(() => parseSkillPackageManifest({ ...request(), slug })).toThrow();
    },
  );
  it.each([
    null,
    {},
    [],
    { ...request(), ownerId: 'trusted' },
    { ...request(), sourceUrl: null },
    { ...request(), expectedPackageChecksum: null },
    {
      ...request(),
      package: { format: 'files', files: [], archiveBase64: '' },
    },
    { ...request(), package: { format: 'zip', archiveBase64: '', files: [] } },
    { ...request(), package: { format: 'directory', path: '/etc' } },
  ])('rejects malformed/untrusted envelope %j', (input) => {
    expect(() => parseSkillPackageManifest(input)).toThrow();
  });
  it.each([
    'https://user:secret@example.com',
    'https://@example.com',
    'file:///tmp/skill',
    'ftp://example.com',
    ' https://example.com',
    'https://example.com ',
    'https://example.com/\n',
    'x'.repeat(2001),
    `https://example.com/${'é'.repeat(1000)}`,
  ])('rejects unsafe source provenance %j', (sourceUrl) => {
    expect(() =>
      parseSkillPackageManifest({ ...request(), sourceUrl }),
    ).toThrow();
  });
  it.each([
    '',
    `SHA256:${'a'.repeat(64)}`,
    `sha256:${'g'.repeat(64)}`,
    'a'.repeat(63),
    'a'.repeat(65),
  ])('rejects checksum syntax or mismatch %j', (expectedPackageChecksum) => {
    expect(() =>
      parseSkillPackageManifest({ ...request(), expectedPackageChecksum }),
    ).toThrow();
  });
  it.each([
    '',
    'AA',
    'AA=',
    'AA===',
    'AB==',
    '-_==',
    'AAAA\n',
    'A'.repeat(1_333_337),
    Buffer.alloc(1_000_001).toString('base64'),
  ])('rejects noncanonical/oversized base64', (archiveBase64) => {
    expect(() =>
      parseSkillPackageManifest({
        slug: 'skill',
        package: { format: 'zip', archiveBase64 },
      }),
    ).toThrow();
  });
  it('requires a nonempty package and exact root SKILL.md with frontmatter and a nonblank body', () => {
    expect(() =>
      parseSkillPackageManifest({
        slug: 'skill',
        package: { format: 'files', files: [] },
      }),
    ).toThrow();
    expect(() =>
      parseSkillPackageManifest({
        slug: 'skill',
        package: {
          format: 'files',
          files: [{ path: 'nested/SKILL.md', content: markdown() }],
        },
      }),
    ).toThrow();
    for (const content of [
      '# No frontmatter',
      ' ---\nname: x\n---\nBody',
      '---\nname: x\n--- trailing\nBody',
      '---\nname: Example\ndescription: D\n---\rBody',
      markdown(undefined, '   '),
    ])
      expect(() => parseSkillPackageManifest(request(content))).toThrow();
    expect(
      parseSkillPackageManifest(
        request(`\ufeff${markdown().replaceAll('\n', '\r\n')}`),
      ).instructions,
    ).toBe('# Instructions');
  });
  it.each([
    'name: Example\nname: Duplicate\ndescription: D',
    '[name, description]',
    'name: Example\ndescription: D\nmetadata: []',
    'name: Example\ndescription: D\nmetadata: {version: null}',
    'name: Example\ndescription: D\nmetadata: {version: 1}',
    'name: " "\ndescription: D',
    'name: Example\ndescription: " "',
    'name: !!str Example\ndescription: D',
    'name: !custom Example\ndescription: D',
    'name: &a Example\ndescription: *a',
    'name: Example\ndescription: D\nother: &a [x]',
    'name: Example\ndescription: D\nother: {__proto__: x}',
    'name: Example\ndescription: D\nother: [{constructor: x}]',
    'name: Example\ndescription: D\nother: {prototype: x}',
    'name: Example\ndescription: D\n? [a,b]\n: value',
    '---\nname: Another',
    'name: [invalid',
    'name: Example\ndescription: D\nother: {a: {b: {c: {d: 1}}}}',
  ])('rejects unsafe or malformed YAML before materialization %j', (yaml) => {
    expect(() => parseSkillPackageManifest(request(markdown(yaml)))).toThrow();
  });
  it('enforces metadata character, frontmatter-byte, AST node and nesting boundaries without truncation', () => {
    expect(
      parseSkillPackageManifest(
        request(
          markdown(
            `name: "${'😀'.repeat(140)}"\ndescription: "${'😀'.repeat(2000)}"\nmetadata: {version: "${'v'.repeat(128)}"}\nother: {a: {b: [1]}}`,
          ),
        ),
      ).metadata.name,
    ).toHaveLength(280);
    for (const yaml of [
      `name: "${'x'.repeat(141)}"\ndescription: D`,
      `name: Example\ndescription: "${'x'.repeat(2001)}"`,
      `name: Example\ndescription: D\nmetadata: {version: "${'x'.repeat(129)}"}`,
      'name: Example\ndescription: D\nmetadata: {version: "bad\\u0000"}',
      'name: Example\ndescription: D\nother: [' +
        Array.from({ length: 250 }, () => 1).join(',') +
        ']',
      `name: Example\ndescription: D\n#${'é'.repeat(8000)}`,
    ])
      expect(() =>
        parseSkillPackageManifest(request(markdown(yaml))),
      ).toThrow();
    const long = 'Instructions '.repeat(9000);
    expect(
      parseSkillPackageManifest(request(markdown(undefined, long)))
        .instructions,
    ).toBe(long.trim());
  });
  it('matches existing MaxLength behavior for supplementary characters and variation selectors', () => {
    for (const [key, max] of [
      ['name', 140],
      ['description', 2000],
    ] as const) {
      const accepted = `${'x'.repeat(max - 1)}☀️`;
      const yaml =
        key === 'name'
          ? `name: "${accepted}"\ndescription: D`
          : `name: Example\ndescription: "${accepted}"`;
      expect(
        parseSkillPackageManifest(request(markdown(yaml))).metadata[key],
      ).toBe(accepted);
      const rejected =
        key === 'name'
          ? `name: "${accepted}x"\ndescription: D`
          : `name: Example\ndescription: "${accepted}x"`;
      expect(() =>
        parseSkillPackageManifest(request(markdown(rejected))),
      ).toThrow();
    }
  });
  it('accepts exact frontmatter and AST budgets and rejects their next value', () => {
    const base = 'name: Example\ndescription: D\n#';
    const exact = base + 'x'.repeat(16_000 - Buffer.byteLength(base) - 1);
    expect(
      parseSkillPackageManifest(request(markdown(exact))).metadata.name,
    ).toBe('Example');
    expect(() =>
      parseSkillPackageManifest(request(markdown(`${exact}x`))),
    ).toThrow();
    const nodes = (count: number) =>
      `name: Example\ndescription: D\nother: [${Array.from({ length: count }, () => 1).join(',')}]`;
    expect(
      parseSkillPackageManifest(request(markdown(nodes(246)))).metadata.name,
    ).toBe('Example');
    expect(() =>
      parseSkillPackageManifest(request(markdown(nodes(247)))),
    ).toThrow();
  });
});
