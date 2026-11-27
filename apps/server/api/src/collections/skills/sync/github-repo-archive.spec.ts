import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchRepoArchive,
  MAX_ARCHIVE_FILES,
  RepoArchiveError,
  unpackRepoArchive,
} from './github-repo-archive';

const COMMIT = 'a'.repeat(40);

function archive(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
    ),
  );
}

describe('unpackRepoArchive', () => {
  it('strips the wrapper folder and leaves top-level dot folders out', () => {
    const files = unpackRepoArchive(
      archive({
        'skills-abc/.github/workflows/ci.yml': 'ci',
        'skills-abc/x/x-post/SKILL.md': '# X post',
        'skills-abc/scripts/modules.json': '{}',
      }),
    );

    expect([...files.keys()].sort()).toEqual([
      'scripts/modules.json',
      'x/x-post/SKILL.md',
    ]);
    expect(new TextDecoder().decode(files.get('x/x-post/SKILL.md'))).toBe(
      '# X post',
    );
  });

  it.each([
    ['a parent folder', 'skills-abc/x/../../etc/passwd'],
    ['a backslash', 'skills-abc/x\\y/SKILL.md'],
    ['an absolute path', '/etc/passwd'],
  ])('rejects %s in an entry name', (_label, name) => {
    expect(() => unpackRepoArchive(archive({ [name]: 'nope' }))).toThrow(
      RepoArchiveError,
    );
  });

  it('rejects an archive with more files than the limit', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_ARCHIVE_FILES + 1 }, (_, index) => [
        `repo-abc/f${index}.md`,
        'x',
      ]),
    );

    expect(() => unpackRepoArchive(archive(many))).toThrow(
      'too many or too large files',
    );
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => unpackRepoArchive(strToU8('not a zip'))).toThrow(
      RepoArchiveError,
    );
  });
});

describe('fetchRepoArchive', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGitHub(zip: Uint8Array) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://api.github.com/')) {
          return Response.json({
            commit: { committer: { date: '2026-11-26T14:24:06Z' } },
            sha: COMMIT,
          });
        }
        const response = new Response(Uint8Array.from(zip));
        Object.defineProperty(response, 'url', { value: url });
        return response;
      }),
    );
  }

  it('reads the repository at the commit its ref resolves to', async () => {
    stubGitHub(archive({ 'skills-aaaa/x/x-post/SKILL.md': '# X post' }));

    const result = await fetchRepoArchive({
      owner: 'genfeedai',
      repo: 'skills',
    });

    expect(result.commit).toBe(COMMIT);
    expect(result.committedAt).toBe('2026-11-26T14:24:06.000Z');
    expect([...result.files.keys()]).toEqual(['x/x-post/SKILL.md']);
  });

  it.each([
    ['an owner with a slash', { owner: 'a/b', repo: 'skills' }, 'HEAD'],
    ['a repo with a dot path', { owner: 'genfeedai', repo: '../x' }, 'HEAD'],
    ['a ref with a space', { owner: 'genfeedai', repo: 'skills' }, 'a b'],
  ])('refuses %s before any request', async (_label, repository, ref) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchRepoArchive(repository, ref)).rejects.toThrow(
      RepoArchiveError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails when GitHub cannot find the repository', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );

    await expect(
      fetchRepoArchive({ owner: 'genfeedai', repo: 'missing' }),
    ).rejects.toThrow('GitHub answered 404');
  });
});
