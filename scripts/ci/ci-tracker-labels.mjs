/**
 * Shared tracker-label wiring for the CI failure reporters.
 *
 * `issues.create({ labels })` is best-effort only: GitHub silently drops the
 * field when the creating token lacks push access, returning a 201 for an
 * unlabeled issue. That is not cosmetic for these reporters — both look their
 * open trackers up BY label, so an unlabeled tracker is invisible to the dedupe
 * path (every red push files a fresh duplicate) and to the resolve path (it
 * never closes). #3634 and #3659 were orphaned exactly that way, while #3635
 * only carried the label because unrelated triage automation added it nine
 * minutes later.
 *
 * Both reporters therefore label through this module instead, and confirm the
 * result rather than trusting a 2xx.
 */

/**
 * Apply a tracker label as its own authoritative call and verify it landed.
 *
 * `addLabels` returns the issue's labels after the write, which is the only
 * trustworthy confirmation available. A miss throws rather than warns: a
 * tracker nothing can find again is worse than a red reporter job.
 *
 * @param {object} github Octokit-compatible client
 * @param {{ owner: string, repo: string, issueNumber: number, label: string }} input
 */
export async function applyTrackerLabel(
  github,
  { owner, repo, issueNumber, label },
) {
  const applied = await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label],
  });

  const names = (applied?.data ?? []).map((entry) => entry.name);
  if (!names.includes(label)) {
    throw new Error(
      `Tracker issue #${issueNumber} is missing the ${label} label after ` +
        'addLabels; the reporter credential needs push access to label ' +
        'issues, or the tracker cannot be deduped or auto-closed.',
    );
  }
}
