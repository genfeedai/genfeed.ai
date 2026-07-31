/**
 * Self-hosted release E2E tracker.
 *
 * Failure path: one open `release-e2e` issue, Project #12 Priority P0, Area Infra.
 * Success path: close every open `release-e2e` tracker with a green comment so the
 * board cannot look tidy while CI is red, and cannot stay red forever after green.
 *
 * Project field writes are best-effort. Issues still file when Projects GraphQL
 * is denied; the Actions log records the miss.
 */

export const RELEASE_E2E_FAILURE_LABEL = 'release-e2e';

/** Org project #12 — genfeed.ai */
export const GENFEED_PROJECT_ID = 'PVT_kwDODFYBFs4BTwvz';
export const PROJECT_FIELD_PRIORITY = 'PVTSSF_lADODFYBFs4BTwvzzhA9dNw';
export const PROJECT_FIELD_AREA = 'PVTSSF_lADODFYBFs4BTwvzzhA9dN0';
export const PROJECT_FIELD_WORK_TYPE = 'PVTSSF_lADODFYBFs4BTwvzzhXvXgo';
export const PROJECT_FIELD_BLAST_RADIUS = 'PVTSSF_lADODFYBFs4BTwvzzhU7-C0';

export const PRIORITY_P0 = '7a6ec8da';
export const AREA_INFRA = '8381e660';
export const WORK_TYPE_BUG = '2f513127';
export const BLAST_RADIUS_INFRA = '82415f41';

async function listTrackerIssues(github, { owner, repo, state }) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: RELEASE_E2E_FAILURE_LABEL,
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
}

export async function ensureReleaseE2eLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: RELEASE_E2E_FAILURE_LABEL,
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: RELEASE_E2E_FAILURE_LABEL,
      color: 'b60205',
      description: 'Self-hosted release E2E failures',
    });
  }
}

/**
 * Build the issue / comment body for a red release E2E run.
 * @param {{ date: string, releaseTag: string, imageTag: string, runUrl: string, failureClass?: string }} input
 */
export function buildReleaseE2eFailureBody({
  date,
  releaseTag,
  imageTag,
  runUrl,
  failureClass = 'unknown',
}) {
  return [
    `**Self-hosted release E2E failed** on \`${date}\`.`,
    ``,
    `- GitHub release: \`${releaseTag}\``,
    `- Image tag under test: \`ghcr.io/genfeedai/genfeed.ai:${imageTag}\``,
    `- Failure class: \`${failureClass}\``,
    `- Failed run: ${runUrl}`,
    `- Diagnostic artifacts (when produced): \`release-e2e-playwright-report\`, \`release-e2e-compose-logs\``,
    ``,
    `The public release bundle, anonymous image pull, boot path, or LOCAL-mode E2E failed.`,
    `Automation sets Project **Priority = P0** (Priority is a project field, not a label).`,
  ].join('\n');
}

/**
 * Best-effort: add issue to Project #12 and set P0 triage fields.
 * Never throws — board writes must not block filing the issue.
 */
export async function triageReleaseE2eOnProject(github, {
  owner,
  repo,
  issueNumber,
  core = console,
}) {
  try {
    const issue = await github.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    const contentId = issue.data.node_id;

    const addResult = await github.graphql(
      `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }`,
      {
        projectId: GENFEED_PROJECT_ID,
        contentId,
      },
    );
    const itemId = addResult.addProjectV2ItemById.item.id;

    const fieldUpdates = [
      [PROJECT_FIELD_PRIORITY, PRIORITY_P0],
      [PROJECT_FIELD_AREA, AREA_INFRA],
      [PROJECT_FIELD_WORK_TYPE, WORK_TYPE_BUG],
      [PROJECT_FIELD_BLAST_RADIUS, BLAST_RADIUS_INFRA],
    ];

    for (const [fieldId, optionId] of fieldUpdates) {
      await github.graphql(
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }`,
        {
          projectId: GENFEED_PROJECT_ID,
          itemId,
          fieldId,
          optionId,
        },
      );
    }

    core.info?.(
      `Triaged release-e2e #${issueNumber} on Project #12 as Priority P0 / Area Infra`,
    );
    return { ok: true, itemId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning?.(
      `Could not triage release-e2e #${issueNumber} on Project #12: ${message}`,
    );
    return { ok: false, error: message };
  }
}

export async function reportReleaseE2eFailure({
  github,
  owner,
  repo,
  body,
  date,
  core = console,
}) {
  await ensureReleaseE2eLabel(github, { owner, repo });

  const openTrackers = (await listTrackerIssues(github, {
    owner,
    repo,
    state: 'open',
  })).filter((issue) => !issue.pull_request);

  if (openTrackers.length > 0) {
    const number = openTrackers[0].number;
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });
    // Re-assert P0 every red run so backlog drift cannot deprioritize it.
    await triageReleaseE2eOnProject(github, {
      owner,
      repo,
      issueNumber: number,
      core,
    });
    core.info?.(`Commented on existing release-e2e issue #${number}`);
    return { action: 'commented', issueNumber: number };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: `🚦 Self-hosted release E2E failed — ${date}`,
    body,
    labels: [RELEASE_E2E_FAILURE_LABEL],
  });

  await triageReleaseE2eOnProject(github, {
    owner,
    repo,
    issueNumber: created.data.number,
    core,
  });
  core.info?.(`Created release-e2e issue #${created.data.number}`);
  return { action: 'created', issueNumber: created.data.number };
}

export async function resolveReleaseE2eFailure({
  github,
  owner,
  repo,
  body,
  core = console,
}) {
  const openTrackers = (await listTrackerIssues(github, {
    owner,
    repo,
    state: 'open',
  })).filter((issue) => !issue.pull_request);

  if (openTrackers.length === 0) {
    core.info?.('No open release-e2e trackers to close');
    return { action: 'noop', closed: [] };
  }

  const closed = [];
  for (const tracker of openTrackers) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: tracker.number,
      body,
    });
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: tracker.number,
      state: 'closed',
      state_reason: 'completed',
    });
    closed.push(tracker.number);
    core.info?.(`Closed release-e2e issue #${tracker.number} after green run`);
  }

  return { action: 'closed', closed };
}
