// Resolves the master commit a normal Release ships.
//
// Release is dispatched from the master head, and by default it releases that
// head. Master is never frozen, so a runtime merge between the gates going
// green and the dispatch makes their evidence stale (#9579). The optional
// `sha` input names an earlier master commit whose gates are already green;
// this script proves the name is an exact commit on the dispatched history
// before any later step trusts it.
//
// It runs in the controller checkout (the dispatched head, full history),
// before the workflow checks out the pinned commit.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

export class PinnedShaError extends Error {}

function gitSucceeds(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw new PinnedShaError(
      `git ${args.join(' ')} could not run: ${result.error.message}`,
    );
  }
  return result.status === 0;
}

/**
 * @param {{ pinnedSha?: string, controllerSha?: string, cwd?: string }} input
 * @returns {{ releaseSha: string, isPinned: boolean }}
 */
export function resolveReleaseSha({
  pinnedSha = '',
  controllerSha = '',
  cwd = process.cwd(),
} = {}) {
  if (!EXACT_SHA_PATTERN.test(controllerSha)) {
    throw new PinnedShaError(
      `The dispatched workflow SHA must be an exact lowercase 40-character commit: ${controllerSha || '<empty>'}`,
    );
  }
  if (pinnedSha === '') {
    return { releaseSha: controllerSha, isPinned: false };
  }
  if (!EXACT_SHA_PATTERN.test(pinnedSha)) {
    throw new PinnedShaError(
      `The sha input must be an exact lowercase 40-character commit, not a branch, tag or short SHA: ${pinnedSha}`,
    );
  }
  if (pinnedSha === controllerSha) {
    return { releaseSha: controllerSha, isPinned: false };
  }
  if (!gitSucceeds(cwd, ['cat-file', '-e', `${pinnedSha}^{commit}`])) {
    throw new PinnedShaError(
      `The sha input ${pinnedSha} is not a commit in this repository.`,
    );
  }
  if (
    !gitSucceeds(cwd, ['merge-base', '--is-ancestor', pinnedSha, controllerSha])
  ) {
    throw new PinnedShaError(
      `The sha input ${pinnedSha} is not on master before the dispatched head ${controllerSha}. Pin a commit that is already merged to master.`,
    );
  }
  return { releaseSha: pinnedSha, isPinned: true };
}

function main() {
  try {
    const { releaseSha } = resolveReleaseSha({
      pinnedSha: process.env.PINNED_SHA ?? '',
      controllerSha: process.env.GITHUB_SHA ?? '',
    });
    process.stdout.write(`${releaseSha}\n`);
  } catch (caught) {
    if (!(caught instanceof PinnedShaError)) throw caught;
    process.stderr.write(`::error::${caught.message}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
