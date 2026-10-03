import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleError: vi.fn((error: unknown) => {
    throw error;
  }),
  post: vi.fn<(route: string, body: unknown) => Promise<unknown>>(),
  printJson: vi.fn(),
  requireAuth: vi.fn<() => Promise<string>>(),
}));
vi.mock('@/api/client', () => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: mocks.post,
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/ui/theme', () => ({ printJson: mocks.printJson }));
vi.mock('@/utils/errors', () => ({ handleError: mocks.handleError }));
let directory: string;
const content = '---\nname: Example\ndescription: Private imported skill\n---\n\nInstructions.\n';
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue('fixture-auth');
  mocks.post.mockResolvedValue({ id: 'imported-skill' });
  directory = await mkdtemp(path.join(tmpdir(), 'skill-import-command-'));
  await writeFile(path.join(directory, 'SKILL.md'), content, { mode: 0o600 });
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});
async function command() {
  const { skillCommand } = await import('@/commands/skill');
  skillCommand.exitOverride();
  for (const child of skillCommand.commands)
    child.exitOverride().configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
  return skillCommand;
}

describe('skill import command', () => {
  it('parses actual Commander arguments and posts the exact ordinary files envelope', async () => {
    await mkdir(path.join(directory, 'references'));
    await writeFile(path.join(directory, 'references/Voice.md'), 'Reference.\n', { mode: 0o600 });
    await writeFile(path.join(directory, 'other.md'), 'Other.\n', { mode: 0o600 });
    const cmd = await command();
    await cmd.parseAsync(
      [
        'import',
        path.join(directory, 'SKILL.md'),
        '--slug',
        'Example-Skill',
        '--reference',
        'references/Voice.md',
        '--reference',
        'other.md',
        '--source-url',
        'https://example.com/skill',
        '--checksum',
        `sha256:${'A'.repeat(64)}`,
      ],
      { from: 'user' }
    );
    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/skills/import', {
      expectedPackageChecksum: 'a'.repeat(64),
      package: {
        files: [
          { content, path: 'SKILL.md' },
          { content: 'Reference.\n', path: 'references/Voice.md' },
          { content: 'Other.\n', path: 'other.md' },
        ],
        format: 'files',
      },
      slug: 'example-skill',
      sourceUrl: 'https://example.com/skill',
    });
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({ id: 'imported-skill' });
  });
  it('posts canonical ZIP base64 with no legacy instruction-derived fields', async () => {
    const archive = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await writeFile(path.join(directory, 'package.zip'), archive, { mode: 0o600 });
    await (await command()).parseAsync(
      ['import', path.join(directory, 'package.zip'), '--slug', 'zip-skill'],
      { from: 'user' }
    );
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/skills/import', {
      package: { archiveBase64: archive.toString('base64'), format: 'zip' },
      slug: 'zip-skill',
    });
  });
  it('shows the package argument and reference/provenance/checksum help, and removes unsafe import flags', async () => {
    const cmd = await command();
    const imported = cmd.commands.find((child) => child.name() === 'import');
    if (!imported) throw new Error('Import command missing');
    const help = imported.helpInformation();
    expect(help).toContain('<SKILL.md-or-package.zip>');
    for (const option of ['--slug', '--reference', '--source-url', '--checksum'])
      expect(help).toContain(option);
    for (const option of ['--instructions', '--description', '--name'])
      expect(help).not.toContain(option);
    expect(cmd.helpInformation()).toContain('import');
    expect(cmd.helpInformation()).not.toContain('share');
    expect(cmd.helpInformation()).not.toContain('test');
  });
  it('rejects missing root/slug and legacy flags through Commander before HTTP', async () => {
    for (const args of [
      ['import', '--slug', 'skill'],
      ['import', path.join(directory, 'SKILL.md')],
      ['import', path.join(directory, 'SKILL.md'), '--slug', 'skill', '--instructions', 'unsafe'],
    ])
      await expect((await command()).parseAsync(args, { from: 'user' })).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('propagates input errors through the existing handler without making an import request', async () => {
    await expect(
      (await command()).parseAsync(
        [
          'import',
          path.join(directory, 'SKILL.md'),
          '--slug',
          'skill',
          '--reference',
          '../secret.md',
        ],
        { from: 'user' }
      )
    ).rejects.toThrow();
    expect(mocks.handleError).toHaveBeenCalledTimes(1);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('propagates authentication and API failures without retries or success output', async () => {
    const denied = new Error('Fixture access denied');
    mocks.requireAuth.mockRejectedValueOnce(denied);
    await expect(
      (await command()).parseAsync(
        ['import', path.join(directory, 'SKILL.md'), '--slug', 'skill'],
        { from: 'user' }
      )
    ).rejects.toBe(denied);
    expect(mocks.post).not.toHaveBeenCalled();
    const rejected = new Error('Fixture package rejected');
    mocks.post.mockRejectedValueOnce(rejected);
    await expect(
      (await command()).parseAsync(
        ['import', path.join(directory, 'SKILL.md'), '--slug', 'skill'],
        { from: 'user' }
      )
    ).rejects.toBe(rejected);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.handleError).toHaveBeenLastCalledWith(rejected);
    expect(mocks.printJson).not.toHaveBeenCalled();
  });
});
