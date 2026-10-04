import { SKILL_PACKAGE_LIMITS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';
import { buildSkillImportInput } from './skill-import-input';

function file(name: string, content: string | Uint8Array): File {
  const bytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
  const value = new File([bytes], name);
  Object.defineProperty(value, 'arrayBuffer', {
    configurable: true,
    value: async () => bytes.slice().buffer,
  });
  return value;
}
const root = () =>
  file(
    'SKILL.md',
    '\ufeff---\nname: Private\ndescription: Skill\n---\nKeep bytes.\n',
  );

describe('buildSkillImportInput', () => {
  it('builds exact direct file transport, preserves BOM/case/bytes and normalizes explicit metadata', async () => {
    expect(
      await buildSkillImportInput([root(), file('Voice.md', ' Reference.\n')], {
        slug: 'Private-Skill',
        sourceUrl: 'https://example.com/skill',
        checksum: `sha256:${'A'.repeat(64)}`,
      }),
    ).toEqual({
      slug: 'private-skill',
      sourceUrl: 'https://example.com/skill',
      expectedPackageChecksum: 'a'.repeat(64),
      package: {
        format: 'files',
        files: [
          {
            path: 'SKILL.md',
            content:
              '\ufeff---\nname: Private\ndescription: Skill\n---\nKeep bytes.\n',
          },
          { path: 'Voice.md', content: ' Reference.\n' },
        ],
      },
    });
  });
  it('encodes binary ZIP bytes canonically without UTF8 or archive parsing', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 0xff]);
    expect(
      await buildSkillImportInput([file('Package.zip', bytes)], {
        slug: 'skill',
      }),
    ).toEqual({
      slug: 'skill',
      package: { format: 'zip', archiveBase64: 'UEsDBP8=' },
    });
  });
  it('accepts exact archive/entry/total/count bounds and rejects adjacent excess', async () => {
    await expect(
      buildSkillImportInput([file('package.zip', new Uint8Array(1_000_000))], {
        slug: 'skill',
      }),
    ).resolves.toMatchObject({ package: { format: 'zip' } });
    await expect(
      buildSkillImportInput([file('package.zip', new Uint8Array(1_000_001))], {
        slug: 'skill',
      }),
    ).rejects.toMatchObject({ code: 'SIZE' });
    const entry = file('SKILL.md', 'a'.repeat(128_000));
    const refs = [1, 2, 3].map((i) => file(`ref-${i}.md`, 'a'.repeat(128_000)));
    await expect(
      buildSkillImportInput([entry, ...refs], { slug: 'skill' }),
    ).resolves.toMatchObject({ package: { format: 'files' } });
    await expect(
      buildSkillImportInput([entry, ...refs, file('last.md', 'a')], {
        slug: 'skill',
      }),
    ).rejects.toMatchObject({ code: 'SIZE' });
    await expect(
      buildSkillImportInput([file('SKILL.md', 'é'.repeat(64_001))], {
        slug: 'skill',
      }),
    ).rejects.toMatchObject({ code: 'SIZE' });
    await expect(
      buildSkillImportInput(
        [
          root(),
          ...Array.from({ length: 127 }, (_, i) => file(`ref-${i}.md`, 'ref')),
        ],
        { slug: 'skill' },
      ),
    ).resolves.toMatchObject({ package: { format: 'files' } });
    await expect(
      buildSkillImportInput(
        [
          root(),
          ...Array.from({ length: 128 }, (_, i) => file(`ref-${i}.md`, 'ref')),
        ],
        { slug: 'skill' },
      ),
    ).rejects.toMatchObject({ code: 'COUNT' });
  });
  it('checks actual arrayBuffer bytes even when File.size lies', async () => {
    const value = file('SKILL.md', 'small');
    Object.defineProperty(value, 'arrayBuffer', {
      value: async () => new Uint8Array(128_001).buffer,
      configurable: true,
    });
    await expect(
      buildSkillImportInput([value], { slug: 'skill' }),
    ).rejects.toMatchObject({ code: 'SIZE' });
    const archive = file('package.zip', 'small');
    Object.defineProperty(archive, 'arrayBuffer', {
      configurable: true,
      value: async () => new Uint8Array(1_000_001).buffer,
    });
    await expect(
      buildSkillImportInput([archive], { slug: 'skill' }),
    ).rejects.toMatchObject({ code: 'SIZE' });
  });
  it('rejects directory selections instead of flattening nested references', async () => {
    const nested = file('Voice.md', 'ref');
    Object.defineProperty(nested, 'webkitRelativePath', {
      value: 'package/references/Voice.md',
    });
    await expect(
      buildSkillImportInput([root(), nested], { slug: 'skill' }),
    ).rejects.toMatchObject({ code: 'DIRECTORY' });
  });
  it.each([
    '../ref.md',
    '/ref.md',
    'nested/ref.md',
    'nested\\ref.md',
    'C:ref.md',
    'a\u0000.md',
    'Ref.MD',
    'ref.txt',
    '',
  ])('rejects unsafe or unsupported filename %j', async (name) => {
    await expect(
      buildSkillImportInput([root(), file(name, 'ref')], { slug: 'skill' }),
    ).rejects.toMatchObject({ code: 'PATH' });
  });
  it('requires exactly one root and unique NFC/case file paths', async () => {
    for (const files of [
      [],
      [file('skill.md', 'root')],
      [root(), root()],
      [root(), file('Voice.md', 'ref'), file('voice.md', 'ref')],
      [root(), file('é.md', 'ref'), file('e\u0301.md', 'ref')],
      [file('package.zip', 'zip'), root()],
    ])
      await expect(
        buildSkillImportInput(files, { slug: 'skill' }),
      ).rejects.toThrow();
  });
  it('rejects invalid UTF8, empty ZIP and read errors safely', async () => {
    await expect(
      buildSkillImportInput([file('SKILL.md', new Uint8Array([0xc3, 0x28]))], {
        slug: 'skill',
      }),
    ).rejects.toMatchObject({ code: 'UTF8' });
    await expect(
      buildSkillImportInput([file('empty.zip', '')], { slug: 'skill' }),
    ).rejects.toMatchObject({ code: 'SIZE' });
    const value = root();
    Object.defineProperty(value, 'arrayBuffer', {
      value: vi.fn().mockRejectedValue(new Error('private fixture detail')),
      configurable: true,
    });
    const result = buildSkillImportInput([value], { slug: 'skill' });
    await expect(result).rejects.toMatchObject({ code: 'READ' });
    await expect(result).rejects.not.toThrow('private fixture detail');
  });
  it('validates metadata before reading files and accepts exact slug/checksum bounds', async () => {
    const value = root();
    const read = vi.fn(async () => new TextEncoder().encode('root').buffer);
    Object.defineProperty(value, 'arrayBuffer', {
      value: read,
      configurable: true,
    });
    for (const slug of ['', '-bad', 'bad slug', 'é', 'x'.repeat(161)])
      await expect(
        buildSkillImportInput([value], { slug }),
      ).rejects.toMatchObject({ code: 'SLUG' });
    for (const sourceUrl of [
      'file:///secret',
      'https://user:password@example.com',
      ' https://example.com',
      'https://example.com/\n',
      `https://example.com/${'a'.repeat(2000)}`,
    ])
      await expect(
        buildSkillImportInput([value], { slug: 'skill', sourceUrl }),
      ).rejects.toMatchObject({ code: 'SOURCE_URL' });
    for (const checksum of ['abc', 'g'.repeat(64), `sha512:${'a'.repeat(64)}`])
      await expect(
        buildSkillImportInput([value], { slug: 'skill', checksum }),
      ).rejects.toMatchObject({ code: 'CHECKSUM' });
    expect(read).not.toHaveBeenCalled();
    await expect(
      buildSkillImportInput([value], {
        slug: 'A'.repeat(160),
        sourceUrl: 'http://example.com',
        checksum: 'B'.repeat(64),
      }),
    ).resolves.toMatchObject({
      slug: 'a'.repeat(160),
      expectedPackageChecksum: 'b'.repeat(64),
    });
  });
});

describe('shared skill package limits', () => {
  it('uses the shared entry, size and source URL rules', async () => {
    const many = Array.from(
      { length: SKILL_PACKAGE_LIMITS.entries + 1 },
      (_v, i) => file(i ? `ref-${i}.md` : 'SKILL.md', 'x'),
    );
    await expect(
      buildSkillImportInput(many, { slug: 'skill' }),
    ).rejects.toMatchObject({
      code: 'COUNT',
    });
    await expect(
      buildSkillImportInput(
        [file('SKILL.md', 'a'.repeat(SKILL_PACKAGE_LIMITS.entryBytes + 1))],
        {
          slug: 'skill',
        },
      ),
    ).rejects.toMatchObject({ code: 'SIZE' });
    await expect(
      buildSkillImportInput([root()], {
        slug: 'skill',
        sourceUrl: 'https://example.com/\\@evil.test',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_URL' });
  });
});
