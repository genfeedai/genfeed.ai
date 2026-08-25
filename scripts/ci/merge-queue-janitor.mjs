/**
 * Merge-queue zombie-run janitor (#1969).
 *
 * When a queue entry merges, GitHub deletes its temporary
 * `gh-readonly-queue/master/...` ref — but `merge_group` workflow runs still
 * queued or in progress on that ref are not cancelled with it. Each zombie
 * holds a runner slot until the 6-hour workflow timeout, which starved the
 * org-wide runner pool at peak (measured while auditing #1850).
 *
 * Every queue merge lands on `master` as a push, so ci.yml runs this from a
 * push-gated job: list queued/in-progress `merge_group` runs, and cancel any
 * whose queue ref no longer resolves. Runs on live queue refs are left alone.
 */

export const MERGE_QUEUE_REF_PREFIX = 'gh-readonly-queue/';

async function listActiveMergeGroupRuns(github, { owner, repo }) {
  const runs = [];
  for (const status of ['queued', 'in_progress']) {
    runs.push(
      ...(await github.paginate(github.rest.actions.listWorkflowRunsForRepo, {
        owner,
        repo,
        event: 'merge_group',
        status,
        per_page: 100,
      })),
    );
  }
  return runs;
}

async function queueRefExists(github, { owner, repo, headBranch }) {
  try {
    await github.rest.git.getRef({ owner, repo, ref: `heads/${headBranch}` });
    return true;
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    return false;
  }
}

export async function cleanMergeQueueRuns({
  github,
  owner,
  repo,
  core = console,
}) {
  const runs = await listActiveMergeGroupRuns(github, { owner, repo });

  const cancelled = [];
  const kept = [];
  const errors = [];
  for (const run of runs) {
    const headBranch = run.head_branch ?? '';
    if (!headBranch.startsWith(MERGE_QUEUE_REF_PREFIX)) {
      kept.push(run.id);
      continue;
    }

    if (await queueRefExists(github, { owner, repo, headBranch })) {
      kept.push(run.id);
      continue;
    }

    try {
      await github.rest.actions.cancelWorkflowRun({
        owner,
        repo,
        run_id: run.id,
      });
      cancelled.push(run.id);
      core.info?.(`Cancelled zombie merge-queue run ${run.id} (${headBranch})`);
    } catch (error) {
      // Zombie records with zero jobs have answered the cancel API with
      // HTTP 500. Cancellation is best-effort per run: record the miss and
      // let the next master push retry it, rather than failing the janitor
      // and leaving every other zombie holding its slot.
      errors.push({ runId: run.id, status: error.status ?? null });
      core.warning?.(
        `Could not cancel merge-queue run ${run.id} (${headBranch}): ${
          error.status ?? error.message
        }`,
      );
    }
  }

  core.info?.(
    `Merge-queue janitor: ${cancelled.length} cancelled, ${kept.length} kept, ${errors.length} errored`,
  );
  return { cancelled, errors, kept };
}
