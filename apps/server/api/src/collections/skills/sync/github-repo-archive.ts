import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { traced } from '@libs/tracing/traced';
import { unzipSync } from 'fflate';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_ARCHIVE_ORIGIN = 'https://codeload.github.com';
const ARCHIVE_TIMEOUT_MS = 60_000;

const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejects control characters in archive paths
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f]/;

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 5_000;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;

/** A public GitHub repository, named by owner and repo only. Never a URL. */
export interface GitHubRepository {
  owner: string;
  repo: string;
}

export interface RepoArchive {
  /** Full commit SHA the files were read at. */
  commit: string;
  committedAt: string;
  /** Repository-relative path to contents. Top-level dot folders are left out. */
  files: Map<string, Uint8Array>;
}

/** The source could not be read: unreachable, too large, or not what it claims to be. */
export class RepoArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepoArchiveError';
  }
}

function parseGitHubRepository(input: GitHubRepository): GitHubRepository {
  if (!NAME_PATTERN.test(input.owner) || !NAME_PATTERN.test(input.repo)) {
    throw new RepoArchiveError('Repository owner or name is not valid');
  }
  return { owner: input.owner, repo: input.repo };
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(DEFAULT_HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new RepoArchiveError(`GitHub answered ${response.status} for ${url}`);
  }
  return response.json();
}

async function resolveCommit(
  { owner, repo }: GitHubRepository,
  ref: string,
): Promise<{ commit: string; committedAt: string }> {
  if (!REF_PATTERN.test(ref)) {
    throw new RepoArchiveError('Git ref is not valid');
  }
  const body = (await readJson(
    `${GITHUB_API_ORIGIN}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  )) as { sha?: unknown; commit?: { committer?: { date?: unknown } } };
  const committedAt = body.commit?.committer?.date;
  if (
    typeof body.sha !== 'string' ||
    !COMMIT_PATTERN.test(body.sha) ||
    typeof committedAt !== 'string' ||
    !Number.isFinite(Date.parse(committedAt))
  ) {
    throw new RepoArchiveError('GitHub returned an unexpected commit');
  }
  return {
    commit: body.sha,
    committedAt: new Date(committedAt).toISOString(),
  };
}

async function downloadArchive(
  { owner, repo }: GitHubRepository,
  commit: string,
): Promise<Uint8Array> {
  const response = await fetch(
    `${GITHUB_ARCHIVE_ORIGIN}/${owner}/${repo}/zip/${commit}`,
    { signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) },
  );
  if (!response.ok || !response.body) {
    throw new RepoArchiveError(
      `GitHub answered ${response.status} for the archive`,
    );
  }
  if (new URL(response.url).origin !== GITHUB_ARCHIVE_ORIGIN) {
    throw new RepoArchiveError('The archive came from an unexpected host');
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength;
    if (received > MAX_ARCHIVE_BYTES) {
      throw new RepoArchiveError('The archive is larger than the allowed size');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function assertSafeArchivePath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new RepoArchiveError(`Unsafe path in archive: ${path}`);
  }
}

/** Unpacks a GitHub zip in memory, within the file and size limits. */
export function unpackRepoArchive(zip: Uint8Array): Map<string, Uint8Array> {
  let fileCount = 0;
  let unpackedBytes = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter: (file) => {
        if (file.name.endsWith('/')) return false;
        fileCount += 1;
        unpackedBytes += file.originalSize;
        if (
          fileCount > MAX_ARCHIVE_FILES ||
          unpackedBytes > MAX_UNPACKED_BYTES
        ) {
          throw new RepoArchiveError(
            'The archive holds too many or too large files',
          );
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof RepoArchiveError) throw error;
    throw new RepoArchiveError('The archive could not be unpacked');
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, contents] of Object.entries(entries)) {
    assertSafeArchivePath(name);
    // GitHub wraps every file in a `<repo>-<sha>/` folder.
    const separator = name.indexOf('/');
    const path = separator === -1 ? name : name.slice(separator + 1);
    assertSafeArchivePath(path);
    if (path.startsWith('.')) continue;
    files.set(path, contents);
  }
  return files;
}

/**
 * Reads a public GitHub repository at one exact commit. The ref is resolved to
 * a full SHA first, so what is validated and what is written is that commit.
 */
export const fetchRepoArchive = traced(
  'fetchRepoArchive',
  async (source: GitHubRepository, ref = 'HEAD'): Promise<RepoArchive> => {
    const repository = parseGitHubRepository(source);
    const { commit, committedAt } = await resolveCommit(repository, ref);
    const zip = await downloadArchive(repository, commit);
    return { commit, committedAt, files: unpackRepoArchive(zip) };
  },
);
