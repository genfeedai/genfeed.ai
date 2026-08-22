/**
 * Shared Project #12 board wiring for CI failure trackers.
 *
 * Both red-CI reporters (self-hosted release E2E, master push Tests Gate) file
 * a tracking issue AND force board triage, because a prose-only tracker can sit
 * in Backlog with no priority while CI stays red. The project/field/option ids
 * live here once so a board reshuffle is a one-file change.
 *
 * Issue creation happens before board triage, but a denied Project mutation is
 * fatal to the reporter job. A red reporter is deliberate: P0 is an operational
 * contract, not optional metadata that may disappear into a warning.
 */

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

/**
 * Add the issue to Project #12 and set the P0 triage fields.
 * Throws after logging when Project writes fail. Reporter callers create or
 * update the issue first, so the tracker remains available while Actions stays
 * visibly red until the credential/permission boundary is repaired.
 *
 * @param {object} github Octokit-compatible client (rest + graphql)
 * @param {{ owner: string, repo: string, issueNumber: number, trackerName: string, core?: object }} input
 */
export async function triageCiFailureOnProject(
  github,
  { owner, repo, issueNumber, trackerName, core = console },
) {
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
      `Triaged ${trackerName} #${issueNumber} on Project #12 as Priority P0 / Area Infra`,
    );
    return { ok: true, itemId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning?.(
      `Could not triage ${trackerName} #${issueNumber} on Project #12: ${message}`,
    );
    throw error;
  }
}
