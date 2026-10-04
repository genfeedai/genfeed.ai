import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SKILL_PACKAGE_LIMITS } from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSkillPackageInput } from '@/utils/skill-package-input';

let directory: string;
const skill = '---\nname: Example\ndescription: A private skill\n---\n\nKeep whitespace.\n';
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'skill-package-input-'));
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});
async function file(relativePath: string, content: string | Buffer, mode = 0o600): Promise<string> {
  const target = path.join(directory, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { mode });
  return target;
}

describe('readSkillPackageInput', () => {
  it('preserves exact root bytes and nested reference paths/case in the API envelope', async () => {
    const root = await file('SKILL.md', skill);
    await file('references/Voice.md', '  Preserve this reference.\n');
    expect(
      await readSkillPackageInput(root, {
        checksum: `sha256:${'A'.repeat(64)}`,
        reference: ['references/Voice.md'],
        slug: 'Example-Skill',
        sourceUrl: 'https://example.com/package',
      })
    ).toEqual({
      expectedPackageChecksum: 'a'.repeat(64),
      package: {
        files: [
          { content: skill, path: 'SKILL.md' },
          { content: '  Preserve this reference.\n', path: 'references/Voice.md' },
        ],
        format: 'files',
      },
      slug: 'example-skill',
      sourceUrl: 'https://example.com/package',
    });
  });
  it('encodes bounded ZIP transport bytes as canonical base64 without parsing a manifest', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff]);
    const archive = await file('package.zip', bytes);
    expect(await readSkillPackageInput(archive, { slug: 'zip-skill' })).toEqual({
      package: { archiveBase64: bytes.toString('base64'), format: 'zip' },
      slug: 'zip-skill',
    });
  });
  it('accepts exact archive and entry byte limits and rejects their adjacent oversized values', async () => {
    const archive = await file('package.zip', Buffer.alloc(1_000_000));
    expect((await readSkillPackageInput(archive, { slug: 'skill' })).package).toMatchObject({
      format: 'zip',
    });
    await writeFile(archive, Buffer.alloc(1_000_001));
    await expect(readSkillPackageInput(archive, { slug: 'skill' })).rejects.toThrow();
    const root = await file('SKILL.md', 'a'.repeat(128_000));
    expect((await readSkillPackageInput(root, { slug: 'skill' })).package).toMatchObject({
      format: 'files',
    });
    await writeFile(root, 'a'.repeat(128_001));
    await expect(readSkillPackageInput(root, { slug: 'skill' })).rejects.toThrow();
  });
  it('counts UTF8 bytes and enforces the total direct-file bound', async () => {
    const root = await file('SKILL.md', 'a'.repeat(128_000));
    for (let index = 1; index <= 4; index++)
      await file(`ref-${index}.md`, 'a'.repeat(index === 4 ? 1 : 128_000));
    const reference = ['ref-1.md', 'ref-2.md', 'ref-3.md'];
    expect((await readSkillPackageInput(root, { reference, slug: 'skill' })).package).toMatchObject(
      { format: 'files' }
    );
    await expect(
      readSkillPackageInput(root, { reference: [...reference, 'ref-4.md'], slug: 'skill' })
    ).rejects.toThrow();
    await writeFile(root, 'é'.repeat(64_001));
    await expect(readSkillPackageInput(root, { slug: 'skill' })).rejects.toThrow();
  });
  it('enforces 128 direct entries, including the required root', async () => {
    const root = await file('SKILL.md', skill);
    const reference: string[] = [];
    for (let index = 0; index < 127; index++) {
      const name = `ref-${index}.md`;
      reference.push(name);
      await file(name, 'ref');
    }
    const result = await readSkillPackageInput(root, { reference, slug: 'skill' });
    expect(result.package).toMatchObject({
      files: expect.arrayContaining([{ content: skill, path: 'SKILL.md' }]),
      format: 'files',
    });
    await expect(
      readSkillPackageInput(root, { reference: [...reference, 'last.md'], slug: 'skill' })
    ).rejects.toThrow();
  });
  it.each([
    '',
    '../secret.md',
    'a/../secret.md',
    './secret.md',
    '/secret.md',
    'a//secret.md',
    'a\\secret.md',
    'C:/secret.md',
    'ref.txt',
    'Ref.MD',
    'directory/',
    'a\u0000.md',
  ])('rejects unsafe or non-Markdown reference path %j', async (reference) => {
    const root = await file('SKILL.md', skill);
    await expect(
      readSkillPackageInput(root, { reference: [reference], slug: 'skill' })
    ).rejects.toThrow();
  });
  it('rejects root aliases, duplicate paths and Unicode/case aliases without flattening', async () => {
    const root = await file('SKILL.md', skill);
    for (const reference of [
      ['SKILL.md'],
      ['ref.md', 'ref.md'],
      ['Voice.md', 'voice.md'],
      ['é.md', 'e\u0301.md'],
    ])
      await expect(readSkillPackageInput(root, { reference, slug: 'skill' })).rejects.toThrow();
    await expect(
      readSkillPackageInput(await file('skill.md', skill), { slug: 'skill' })
    ).rejects.toThrow();
    await expect(
      readSkillPackageInput(await file('instructions.txt', skill), { slug: 'skill' })
    ).rejects.toThrow();
  });
  it('rejects malformed UTF8, executable files, directories, final symlinks and symlinked reference ancestors', async () => {
    const root = await file('SKILL.md', Buffer.from([0xc3, 0x28]));
    await expect(readSkillPackageInput(root, { slug: 'skill' })).rejects.toThrow();
    await writeFile(root, skill);
    await chmod(root, 0o700);
    await expect(readSkillPackageInput(root, { slug: 'skill' })).rejects.toThrow();
    await chmod(root, 0o600);
    await mkdir(path.join(directory, 'directory.md'));
    await expect(
      readSkillPackageInput(root, { reference: ['directory.md'], slug: 'skill' })
    ).rejects.toThrow();
    const outside = await file('outside/reference.md', 'outside');
    await symlink(outside, path.join(directory, 'link.md'));
    await expect(
      readSkillPackageInput(root, { reference: ['link.md'], slug: 'skill' })
    ).rejects.toThrow();
    await symlink(path.join(directory, 'outside'), path.join(directory, 'linked'));
    await expect(
      readSkillPackageInput(root, { reference: ['linked/reference.md'], slug: 'skill' })
    ).rejects.toThrow();
    await file('nested/SKILL.md', skill);
    await rm(root);
    await symlink(path.join(directory, 'nested/SKILL.md'), root);
    await expect(readSkillPackageInput(root, { slug: 'skill' })).rejects.toThrow();
  });
  it('rejects unsafe reference file modes/encoding and a symlinked package base directory', async () => {
    const root = await file('SKILL.md', skill);
    const reference = await file('ref.md', 'reference', 0o700);
    await expect(
      readSkillPackageInput(root, { reference: ['ref.md'], slug: 'skill' })
    ).rejects.toThrow();
    await chmod(reference, 0o600);
    await writeFile(reference, Buffer.from([0xc3, 0x28]));
    await expect(
      readSkillPackageInput(root, { reference: ['ref.md'], slug: 'skill' })
    ).rejects.toThrow();
    await file('real/SKILL.md', skill);
    await symlink(path.join(directory, 'real'), path.join(directory, 'alias'));
    await expect(
      readSkillPackageInput(path.join(directory, 'alias/SKILL.md'), { slug: 'skill' })
    ).rejects.toThrow();
  });

  it('preserves a valid UTF8 BOM instead of silently changing package bytes', async () => {
    const root = await file('SKILL.md', `\ufeff${skill}`);
    const result = await readSkillPackageInput(root, { slug: 'skill' });
    expect(result.package).toEqual({
      files: [{ content: `\ufeff${skill}`, path: 'SKILL.md' }],
      format: 'files',
    });
  });

  it('rejects symlinked or executable ZIP inputs and external references with a ZIP', async () => {
    const archive = await file('package.zip', 'zip');
    await expect(
      readSkillPackageInput(archive, { reference: ['ref.md'], slug: 'skill' })
    ).rejects.toThrow();
    await chmod(archive, 0o700);
    await expect(readSkillPackageInput(archive, { slug: 'skill' })).rejects.toThrow();
    await chmod(archive, 0o600);
    await symlink(archive, path.join(directory, 'linked.zip'));
    await expect(
      readSkillPackageInput(path.join(directory, 'linked.zip'), { slug: 'skill' })
    ).rejects.toThrow();
  });
  it.each(['', '-bad', '../bad', 'bad slug', 'é', 'x'.repeat(161)])(
    'rejects invalid slug %j',
    async (slug) => {
      const root = await file('SKILL.md', skill);
      await expect(readSkillPackageInput(root, { slug })).rejects.toThrow();
    }
  );
  it('accepts slug boundary and normalized checksum, and rejects invalid provenance/checksum syntax', async () => {
    const root = await file('SKILL.md', skill);
    expect(
      await readSkillPackageInput(root, {
        checksum: 'B'.repeat(64),
        slug: 'A'.repeat(160),
        sourceUrl: 'http://example.com/skill',
      })
    ).toMatchObject({ expectedPackageChecksum: 'b'.repeat(64), slug: 'a'.repeat(160) });
    for (const checksum of ['', 'a'.repeat(63), 'g'.repeat(64), `sha512:${'a'.repeat(64)}`])
      await expect(readSkillPackageInput(root, { checksum, slug: 'skill' })).rejects.toThrow();
    for (const sourceUrl of [
      '',
      'file:///secret',
      'https://user:password@example.com/skill',
      ' https://example.com/skill',
      'https://example.com/\nsecret',
    ])
      await expect(readSkillPackageInput(root, { slug: 'skill', sourceUrl })).rejects.toThrow();
  });
});

describe('shared skill package limits', () => {
  it('uses the shared entry, size and source URL rules', async () => {
    const root = await file('SKILL.md', skill);
    const reference = Array.from(
      { length: SKILL_PACKAGE_LIMITS.entries },
      (_value, index) => `ref-${index}.md`
    );
    await expect(readSkillPackageInput(root, { reference, slug: 'skill' })).rejects.toThrow(
      String(SKILL_PACKAGE_LIMITS.entries)
    );
    const big = await file('big/SKILL.md', 'a'.repeat(SKILL_PACKAGE_LIMITS.entryBytes + 1));
    await expect(readSkillPackageInput(big, { slug: 'skill' })).rejects.toThrow();
    await expect(
      readSkillPackageInput(root, { slug: 'skill', sourceUrl: 'https://example.com/\\@evil.test' })
    ).rejects.toThrow();
  });
});
