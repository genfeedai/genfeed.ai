import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn<(route: string) => Promise<unknown>>(),
  handleError: vi.fn((error: unknown) => {
    throw error;
  }),
  patch: vi.fn<(route: string, body: unknown) => Promise<unknown>>(),
  post: vi.fn<(route: string, body: unknown) => Promise<unknown>>(),
  printJson: vi.fn(),
  requireAuth: vi.fn<() => Promise<string>>(),
}));
vi.mock('@/api/client', () => ({
  get: mocks.get,
  patch: mocks.patch,
  post: mocks.post,
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/ui/theme', () => ({ printJson: mocks.printJson }));
vi.mock('@/utils/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/errors')>()),
  handleError: mocks.handleError,
}));
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
  }, 15_000);
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

describe('skill edit command', () => {
  beforeEach(() => {
    mocks.patch.mockReset();
    mocks.patch.mockResolvedValue({ authoritative: true, id: 'edited-skill' });
  });

  async function edit(args: string[]) {
    return (await command()).parseAsync(['edit', ...args], { from: 'user' });
  }

  async function expectNoOtherRequests() {
    const { get } = await import('@/api/client');
    expect(get).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  }

  it('preserves explicit empty description and both empty instruction fields', async () => {
    await edit(['skill-id', '--description', '', '--instructions', '']);
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/skills/skill-id', {
      defaultInstructions: '',
      description: '',
      systemPromptTemplate: '',
    });
    await expectNoOtherRequests();
  });

  it('preserves exact whitespace in every supplied field', async () => {
    await edit([
      'skill-id',
      '--name',
      '  Name  ',
      '--description',
      ' \n ',
      '--instructions',
      ' \nInstructions.\t ',
    ]);
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/skills/skill-id', {
      defaultInstructions: ' \nInstructions.\t ',
      description: ' \n ',
      name: '  Name  ',
      systemPromptTemplate: ' \nInstructions.\t ',
    });
    await expectNoOtherRequests();
  });

  it.each([
    ['--name', 'Updated', { name: 'Updated' }],
    ['--name', '', { name: '' }],
    ['--description', 'Metadata only', { description: 'Metadata only' }],
  ] as const)('sends only supplied metadata for %s %s', async (option, value, body) => {
    await edit(['skill-id', option, value]);
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/skills/skill-id', body);
    await expectNoOtherRequests();
  });

  it('rejects no-option edits through the existing error handler with zero HTTP', async () => {
    await expect(edit(['skill-id'])).rejects.toThrow('Supply at least one');
    expect(mocks.handleError).toHaveBeenCalledTimes(1);
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.printJson).not.toHaveBeenCalled();
    await expectNoOtherRequests();
  });

  it('encodes the entire ID as one path segment and prints authoritative success exactly once', async () => {
    await edit(['folder/id?query#fragment% space', '--name', 'Changed']);
    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith(
      '/skills/folder%2Fid%3Fquery%23fragment%25%20space',
      { name: 'Changed' }
    );
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
      authoritative: true,
      id: 'edited-skill',
    });
    await expectNoOtherRequests();
  });

  it('propagates authentication failure without a PATCH, fallback or success', async () => {
    const denied = new Error('Fixture edit authentication denied');
    mocks.requireAuth.mockRejectedValueOnce(denied);
    await expect(edit(['skill-id', '--name', 'Changed'])).rejects.toBe(denied);
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.handleError).toHaveBeenCalledExactlyOnceWith(denied);
    expect(mocks.printJson).not.toHaveBeenCalled();
    await expectNoOtherRequests();
  });

  it('propagates the authoritative API error after exactly one PATCH without retry or success', async () => {
    const rejected = new Error('Fixture edit rejected by API');
    mocks.patch.mockRejectedValueOnce(rejected);
    await expect(edit(['skill-id', '--instructions', 'Changed'])).rejects.toBe(rejected);
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/skills/skill-id', {
      defaultInstructions: 'Changed',
      systemPromptTemplate: 'Changed',
    });
    expect(mocks.handleError).toHaveBeenCalledExactlyOnceWith(rejected);
    expect(mocks.printJson).not.toHaveBeenCalled();
    await expectNoOtherRequests();
  });

  it('documents sparse edit limits and the two instruction fields', async () => {
    const edited = (await command()).commands.find((child) => child.name() === 'edit');
    if (!edited) throw new Error('Edit command missing');
    const help = edited.helpInformation();
    for (const text of ['140', '2000', '8000', 'defaultInstructions', 'systemPromptTemplate'])
      expect(help).toContain(text);
  });
});

describe('skill versions read commands', () => {
  const skillId = 'skill/with_underscore?';
  const hash = `sha256:skill-v1:${'a'.repeat(64)}`;
  const createdAt = '2026-10-02T12:00:00.000Z';
  function row(versionNumber: number, instructionText?: string) {
    return {
      attributes: {
        contentHash: hash,
        createdAt,
        versionNumber,
        ...(instructionText !== undefined ? { instructionText } : {}),
      },
      id: `sv1_${skillId}_${versionNumber}`,
      type: 'skill-version',
    };
  }
  function page(
    numbers: number[] = [3, 2],
    limit = 20,
    hasMore = false,
    nextCursor: number | null = null
  ) {
    return {
      data: numbers.map((number) => row(number)),
      links: { cursor: { hasMore, limit, nextCursor }, self: 'inert:do-not-follow' },
    };
  }
  function detail(text = '') {
    return { data: row(3, text), links: { self: 'inert:do-not-follow' } };
  }
  async function read(args: string[]) {
    return (await command()).parseAsync(args, { from: 'user' });
  }
  function noWrites() {
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  }
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue(page());
  });

  it('registers both read commands and truthful bounded help', async () => {
    const cmd = await command();
    const list = cmd.commands.find((child) => child.name() === 'versions');
    const one = cmd.commands.find((child) => child.name() === 'version');
    expect(list?.helpInformation()).toContain('--before-version-number');
    expect(list?.helpInformation()).toContain('1..50');
    expect(list?.helpInformation()).toContain('20');
    expect(one?.helpInformation()).toContain('<versionId>');
    expect(cmd.helpInformation()).toContain('versions');
  });
  it('reads exactly one default page with an encoded skill ID and prints metadata only', async () => {
    await read(['versions', skillId]);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
      '/skills/skill%2Fwith_underscore%3F/versions?limit=20'
    );
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
      hasMore: false,
      items: [3, 2].map((versionNumber) => ({
        contentHash: hash,
        createdAt,
        id: `sv1_${skillId}_${versionNumber}`,
        versionNumber,
      })),
      limit: 20,
      nextCursor: null,
    });
    noWrites();
  });
  it('accepts a full limit-one continuation without following links or auto-paging', async () => {
    mocks.get.mockResolvedValue(page([4], 1, true, 4));
    await read(['versions', skillId, '--limit', '1', '--before-version-number', '5']);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
      '/skills/skill%2Fwith_underscore%3F/versions?limit=1&beforeVersionNumber=5'
    );
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
      hasMore: true,
      items: [{ contentHash: hash, createdAt, id: `sv1_${skillId}_4`, versionNumber: 4 }],
      limit: 1,
      nextCursor: 4,
    });
    noWrites();
  });
  it('accepts maximum bounds and empty terminal pages', async () => {
    mocks.get.mockResolvedValue(page([], 50));
    await read(['versions', skillId, '--limit', '50', '--before-version-number', '2147483647']);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
      '/skills/skill%2Fwith_underscore%3F/versions?limit=50&beforeVersionNumber=2147483647'
    );
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
      hasMore: false,
      items: [],
      limit: 50,
      nextCursor: null,
    });
  });
  it.each(['0', '51', '-1', '01', '+1', '1.0', '1e1', ' 1', '1 ', 'NaN', 'Infinity', '1\n', ''])(
    'rejects noncanonical limit %s before GET',
    async (value) => {
      await expect(read(['versions', skillId, '--limit', value])).rejects.toThrow();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.printJson).not.toHaveBeenCalled();
      noWrites();
    }
  );
  it.each(['0', '-1', '01', '+1', '2147483648', '1.1', '1e2', ' 2', '2 ', '2\n', ''])(
    'rejects noncanonical cursor %s before GET',
    async (value) => {
      await expect(read(['versions', skillId, '--before-version-number', value])).rejects.toThrow();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.printJson).not.toHaveBeenCalled();
      noWrites();
    }
  );
  it.each([
    'sv1_other_3',
    `sv1_${skillId}_03`,
    `sv1_${skillId}_0`,
    `sv1_${skillId}_2147483648`,
    '3',
    `sv1_${skillId}_3/extra`,
    `sv1_${skillId}_3\n`,
  ])('rejects mismatched or malformed full ID %s before GET', async (id) => {
    await expect(read(['version', skillId, id])).rejects.toThrow();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.printJson).not.toHaveBeenCalled();
    noWrites();
  });
  it.each(['', ' \n\t ', '<script>literal</script>'])(
    'prints exact instruction text %j and the full sv1 ID',
    async (text) => {
      mocks.get.mockResolvedValue(detail(text));
      await read(['version', skillId, `sv1_${skillId}_3`]);
      expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
        '/skills/skill%2Fwith_underscore%3F/versions/sv1_skill%2Fwith_underscore%3F_3'
      );
      expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
        contentHash: hash,
        createdAt,
        id: `sv1_${skillId}_3`,
        instructionText: text,
        versionNumber: 3,
      });
      noWrites();
    }
  );
  it.each([
    () => null,
    () => ({ data: null, links: page().links }),
    () => ({
      ...page(),
      links: { cursor: { ...page().links.cursor, hasMore: 'false' }, self: 'inert' },
    }),
    () => ({ ...page(), included: ['private-evidence'] }),
    () => ({ ...page(), unknown: 'private-evidence' }),
    () => ({ ...page(), data: [{ ...row(3), relationships: {} }] }),
    () => ({ ...page(), data: [{ ...row(3), type: 'skill' }] }),
    () => ({ ...page(), data: [{ ...row(3), id: 'sv1_other_3' }] }),
    () => ({
      ...page(),
      data: [
        { ...row(3), attributes: { ...row(3).attributes, instructionText: 'private-evidence' } },
      ],
    }),
    () => ({
      ...page(),
      data: [{ ...row(3), attributes: { ...row(3).attributes, payload: 'private-evidence' } }],
    }),
    () => ({
      ...page(),
      data: [{ ...row(3), attributes: { ...row(3).attributes, contentHash: hash.toUpperCase() } }],
    }),
    () => ({
      ...page(),
      data: [{ ...row(3), attributes: { ...row(3).attributes, contentHash: 'sha256:skill-v1:a' } }],
    }),
    () => ({
      ...page(),
      data: [
        { ...row(3), attributes: { ...row(3).attributes, createdAt: '2026-10-02T12:00:00Z' } },
      ],
    }),
    () => ({
      ...page(),
      data: [
        { ...row(3), attributes: { ...row(3).attributes, createdAt: 'invalid-private-evidence' } },
      ],
    }),
    () => ({
      ...page(),
      data: [{ ...row(3), attributes: { ...row(3).attributes, versionNumber: '3' } }],
    }),
    () => ({ ...page(), links: { cursor: page().links.cursor, self: ' ' } }),
    () => ({ ...page(), links: { ...page().links, related: 'private-evidence' } }),
    () => page([2, 3]),
    () => page([3, 3]),
    () => page([1], 20, true, 1),
    () => page([3, 2], 20, true, 2),
    () => page([], 20, true, 2),
    () => page([3, 2], 20, false, 2),
    () => page([3, 2], 20, true, null),
    () => page([3, 2], 19),
  ])(
    'rejects malformed metadata/envelopes/cursors without partial output or parser retry %#',
    async (fixture) => {
      mocks.get.mockResolvedValue(fixture());
      await expect(read(['versions', skillId])).rejects.toThrow('Skill versions are unavailable.');
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.printJson).not.toHaveBeenCalled();
      noWrites();
      expect(mocks.handleError.mock.calls[0]?.[0]).toMatchObject({
        message: 'Skill versions are unavailable.',
      });
      expect(JSON.stringify(mocks.handleError.mock.calls)).not.toContain('private-evidence');
    }
  );
  it.each([() => page([3], 1, true, 2), () => page([3, 2], 1), () => page([5], 1)])(
    'rejects wrong last cursor, oversized page or nonadvancing requested cursor %#',
    async (fixture) => {
      mocks.get.mockResolvedValue(fixture());
      await expect(
        read(['versions', skillId, '--limit', '1', '--before-version-number', '5'])
      ).rejects.toThrow('Skill versions are unavailable.');
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.printJson).not.toHaveBeenCalled();
    }
  );
  it.each([
    () => ({ ...detail(), included: [] }),
    () => ({ ...detail(), data: row(2, 'private-evidence') }),
    () => ({ ...detail(), data: row(3) }),
    () => ({
      ...detail(),
      data: { ...row(3), attributes: { ...row(3).attributes, instructionText: null } },
    }),
    () => ({ ...detail(), data: { ...row(3, ''), relationships: {} } }),
    () => ({
      ...detail(),
      data: {
        ...row(3, ''),
        attributes: { ...row(3, '').attributes, instructionHash: 'private-evidence' },
      },
    }),
  ])('rejects malformed/protected detail or mismatched requested version %#', async (fixture) => {
    mocks.get.mockResolvedValue(fixture());
    await expect(read(['version', skillId, `sv1_${skillId}_3`])).rejects.toThrow(
      'Skill versions are unavailable.'
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.printJson).not.toHaveBeenCalled();
    noWrites();
  });
  it.each(['versions', 'version'])(
    'propagates authoritative auth/HTTP errors for %s without success or feature retry',
    async (action) => {
      const args =
        action === 'versions' ? [action, skillId] : [action, skillId, `sv1_${skillId}_3`];
      const authError = new Error('Fixture authentication denied');
      mocks.requireAuth.mockRejectedValueOnce(authError);
      await expect(read(args)).rejects.toBe(authError);
      expect(mocks.get).not.toHaveBeenCalled();
      const apiError = new Error('Fixture generic 404');
      mocks.get.mockRejectedValueOnce(apiError);
      await expect(read(args)).rejects.toBe(apiError);
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.printJson).not.toHaveBeenCalled();
      expect(mocks.handleError).toHaveBeenLastCalledWith(apiError);
      noWrites();
    }
  );
  it.each(['versions', 'version'])(
    'propagates denied reads for %s without fallback or write',
    async (action) => {
      const denied = new Error('Fixture access denied 403');
      mocks.get.mockRejectedValueOnce(denied);
      const args =
        action === 'versions' ? [action, skillId] : [action, skillId, `sv1_${skillId}_3`];
      await expect(read(args)).rejects.toBe(denied);
      expect(mocks.get).toHaveBeenCalledTimes(1);
      expect(mocks.handleError).toHaveBeenCalledExactlyOnceWith(denied);
      expect(mocks.printJson).not.toHaveBeenCalled();
      noWrites();
    }
  );
  it('accepts the maximum canonical full version ID without shortening it', async () => {
    const number = 2147483647;
    const id = `sv1_${skillId}_${number}`;
    mocks.get.mockResolvedValue({ data: row(number, ''), links: { self: 'inert' } });
    await read(['version', skillId, id]);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
      `/skills/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(id)}`
    );
    expect(mocks.printJson).toHaveBeenCalledExactlyOnceWith({
      contentHash: hash,
      createdAt,
      id,
      instructionText: '',
      versionNumber: number,
    });
    noWrites();
  });
});
