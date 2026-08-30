/**
 * Shared native issue metadata and Project #12 wiring for CI failure trackers.
 *
 * Both red-CI reporters (self-hosted release E2E, master push Tests Gate) file
 * a tracking issue, add it to the canonical board, and set its
 * organization-native metadata. Native fields keep one value on the issue
 * across every project; Project #12 remains responsible for workflow Status.
 *
 * Project membership and metadata triage are independent writes, so either can
 * land when the other service boundary fails. A denied write is still fatal to
 * the reporter job: P0 and board visibility are operational contracts.
 */

/** Org project #12 — genfeed.ai */
export const GENFEED_PROJECT_ID = 'PVT_kwDODFYBFs4BTwvz';
export const ISSUE_TYPE_BUG = 'IT_kwDODFYBFs4BkhMf';

export const PRIORITY_P0 = 'P0 🔥';
export const AREA_INFRA = 'Infra';
export const BLAST_RADIUS_INFRA = 'Infra';

/**
 * Add the issue to Project #12, set native issue triage metadata, and verify it
 * landed. Both writes are attempted; throws their combined errors after logging
 * when either fails. Reporter callers create or update the issue first, so the
 * tracker remains available while Actions stays visibly red until the boundary
 * is fixed.
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
    const writeErrors = [];
    let itemId;

    try {
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
      itemId = addResult.addProjectV2ItemById.item.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeErrors.push(new Error(`Project #12 membership failed: ${message}`));
    }

    try {
      const metadataResult = await github.graphql(
        `mutation(
          $issueId: ID!
          $issueTypeId: ID!
          $priority: String!
          $area: String!
          $blastRadius: String!
        ) {
          updateIssue(input: {
            id: $issueId
            issueTypeId: $issueTypeId
            issueFieldUpdates: [
              { fieldName: "Priority", operation: SET, value: $priority }
              { fieldName: "Area", operation: SET, value: $area }
              { fieldName: "Blast radius", operation: SET, value: $blastRadius }
            ]
          }) {
            issue {
              id
              issueType { id }
              issueFieldValues(first: 100) {
                nodes {
                  ... on IssueFieldSingleSelectValue {
                    field { ... on IssueFieldSingleSelect { name } }
                    value
                  }
                }
              }
            }
          }
        }`,
        {
          issueId: contentId,
          issueTypeId: ISSUE_TYPE_BUG,
          priority: PRIORITY_P0,
          area: AREA_INFRA,
          blastRadius: BLAST_RADIUS_INFRA,
        },
      );

      const updatedIssue = metadataResult.updateIssue.issue;
      const appliedFields = new Map(
        updatedIssue.issueFieldValues.nodes
          .filter((value) => value?.field?.name)
          .map((value) => [value.field.name, value.value]),
      );
      const expectedFields = new Map([
        ['Priority', PRIORITY_P0],
        ['Area', AREA_INFRA],
        ['Blast radius', BLAST_RADIUS_INFRA],
      ]);
      const metadataLanded =
        updatedIssue.issueType?.id === ISSUE_TYPE_BUG &&
        [...expectedFields].every(
          ([field, value]) => appliedFields.get(field) === value,
        );

      if (!metadataLanded) {
        throw new Error(
          'GitHub did not persist the required native issue type and triage fields',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeErrors.push(new Error(`Native issue metadata failed: ${message}`));
    }

    if (writeErrors.length > 0) {
      throw new AggregateError(
        writeErrors,
        writeErrors.map((error) => error.message).join('; '),
      );
    }

    core.info?.(
      `Triaged ${trackerName} #${issueNumber} as Bug / Priority P0 / Area Infra and added it to Project #12`,
    );
    return { ok: true, itemId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning?.(
      `Could not triage ${trackerName} #${issueNumber} with native issue metadata and Project #12 membership: ${message}`,
    );
    throw error;
  }
}
