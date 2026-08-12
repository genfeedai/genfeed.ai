import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function readWorkflow(name: string): string {
  return readFileSync(
    path.join(repositoryRoot, '.github/workflows', name),
    'utf8',
  );
}

describe('CI concurrency', () => {
  it('never cancels an in-progress master run', () => {
    const workflow = readWorkflow('ci.yml');

    // An unconditional `true` here lets every merge kill the previous commit's
    // validation: all master pushes share `ci-CI-refs/heads/master`. That is
    // how a non-booting API (#2270) survived twenty minutes and eight merges on
    // master with nine runs cancelled and none ever reporting.
    expect(workflow).toMatch(
      /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/,
    );
    expect(workflow).not.toMatch(/^\s*cancel-in-progress:\s*true\s*$/m);
  });

  it('keeps the ci- group prefix that stops a workflow_call from cancelling itself', () => {
    const workflow = readWorkflow('ci.yml');

    // Without the prefix this group collides with a caller using the same
    // `${{ github.workflow }}-${{ github.ref }}` shape (release → full-suite),
    // and the nested `ci` cancels itself at startup, killing stable releases.
    expect(workflow).toMatch(
      /group:\s*ci-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
    );
  });

  it('keeps the server image build serialized rather than cancelled', () => {
    const workflow = readWorkflow('build-server-image.yml');

    // Concurrent runs writing the shared server:buildcache (mode=max) clobber
    // each other's cache manifest, so these queue instead of cancelling.
    expect(workflow).toContain('cancel-in-progress: false');
  });
});
