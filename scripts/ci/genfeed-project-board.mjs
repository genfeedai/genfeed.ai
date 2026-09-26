/**
 * Shared native issue metadata and Project #12 wiring for CI failure trackers.
 *
 * Both red-CI reporters (self-hosted release E2E, master push Tests Gate) file
 * a tracking issue, add it to the canonical board, and set its
 * organization-native metadata. Native fields keep one value on the issue
 * across every project; Project #12 remains responsible for workflow Status.
 *
 * Project membership and metadata triage are independent writes, so either can
 * land when the other service boundary fails. A permissions rejection on
 * either write ("Resource not accessible by personal access token", HTTP 403,
 * or a GraphQL `FORBIDDEN` error) is degraded, not fatal: the reporter token
 * (`CONSOLE_DEPLOY_TOKEN`) may lack org-level scopes (issue types, custom
 * properties, Project #12) without that blocking the tracker itself, which is
 * always persisted by the caller before this runs. Any other failure — a bad
 * query, a network error, an unexpected response shape — remains fatal so a
 * genuine regression still shows up red. See #5204 (recurrence of #4688/#3669).
 */

/** Org project #12 — genfeed.ai */
export const GENFEED_PROJECT_ID = 'PVT_kwDODFYBFs4BTwvz';
export const ISSUE_TYPE_BUG = 'IT_kwDODFYBFs4BkhMf';

export const PRIORITY_P0 = 'P0 🔥';
export const AREA_INFRA = 'Infra';
export const BLAST_RADIUS_INFRA = 'Infra';

const PRIORITY_FIELD_NAME = 'Priority';

/**
 * True when `error` came from a credential that is not authorized for the
 * write, rather than a genuine bug in the request. Covers the REST shape
 * (`error.status === 403`), the GraphQL shape (`errors[].type === 'FORBIDDEN'`),
 * and the plain message GitHub sends for both
 * (`Resource not accessible by personal access token` / `by integration`).
 */
function isPermissionDeniedError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/resource not accessible/iu.test(message)) {
    return true;
  }
  if (error?.status === 403) {
    return true;
  }
  const graphqlErrors = Array.isArray(error?.errors) ? error.errors : [];
  return graphqlErrors.some(
    (entry) =>
      entry?.type === 'FORBIDDEN' ||
      /resource not accessible/iu.test(String(entry?.message ?? '')),
  );
}

/**
 * Best-effort read of the issue's current native Priority value, so a human
 * triage decision is never stomped by the reporter's default. Any failure
 * (including the same permission boundary this module otherwise degrades)
 * falls back to `null`, which keeps the existing default-P0 behavior.
 */
async function readCurrentPriority(github, contentId) {
  try {
    const result = await github.graphql(
      `query($id: ID!) {
        node(id: $id) {
          ... on Issue {
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
      { id: contentId },
    );
    const nodes = result?.node?.issueFieldValues?.nodes ?? [];
    return (
      nodes.find((node) => node?.field?.name === PRIORITY_FIELD_NAME)?.value ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Add the issue to Project #12, set native issue triage metadata, and verify
 * it landed. Both writes are attempted independently.
 *
 * A permissions rejection on either write is reported as a single actionable
 * warning naming the missing permission and does not fail the caller — unless
 * `metadataRequired` opts a caller into treating metadata as mandatory. Any
 * other error (including metadata that GitHub silently failed to persist)
 * still throws, combined via `AggregateError` when both writes failed that
 * way.
 *
 * @param {object} github Octokit-compatible client (rest + graphql)
 * @param {{ owner: string, repo: string, issueNumber: number, trackerName: string, core?: object, metadataRequired?: boolean }} input
 */
export async function triageCiFailureOnProject(
  github,
  {
    owner,
    repo,
    issueNumber,
    trackerName,
    core = console,
    metadataRequired = false,
  },
) {
  try {
    const issue = await github.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    const contentId = issue.data.node_id;
    const fatalErrors = [];
    const skippedPermissions = [];
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
      if (isPermissionDeniedError(error) && !metadataRequired) {
        skippedPermissions.push(
          'Project #12 membership (token needs write access to the org project)',
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        fatalErrors.push(
          new Error(`Project #12 membership failed: ${message}`),
        );
      }
    }

    try {
      const currentPriority = await readCurrentPriority(github, contentId);
      // A human triage decision (any Priority other than the reporter's own
      // P0 default) is preserved by re-sending it unchanged instead of
      // resetting to P0.
      const priority =
        currentPriority && currentPriority !== PRIORITY_P0
          ? currentPriority
          : PRIORITY_P0;

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
          priority,
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
        [PRIORITY_FIELD_NAME, priority],
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
      if (isPermissionDeniedError(error) && !metadataRequired) {
        skippedPermissions.push(
          'native issue type and org issue fields (token needs the org "Issue types" and custom properties permission)',
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        fatalErrors.push(new Error(`Native issue metadata failed: ${message}`));
      }
    }

    if (fatalErrors.length > 0) {
      throw new AggregateError(
        fatalErrors,
        fatalErrors.map((error) => error.message).join('; '),
      );
    }

    if (skippedPermissions.length > 0) {
      // One actionable warning per call, not one per skipped write: the
      // reporter job must not go red for this, but the missing scope should
      // still be visible and specific enough to act on.
      core.warning?.(
        `Skipped native triage for ${trackerName} #${issueNumber} — the reporter token is not authorized for: ${skippedPermissions.join('; ')}. The tracker and its occurrence data were still persisted; grant the missing permission to restore native triage.`,
      );
    } else {
      core.info?.(
        `Triaged ${trackerName} #${issueNumber} as Bug / Priority P0 / Area Infra and added it to Project #12`,
      );
    }

    return {
      ok: true,
      itemId,
      degraded: skippedPermissions.length > 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning?.(
      `Could not triage ${trackerName} #${issueNumber} with native issue metadata and Project #12 membership: ${message}`,
    );
    throw error;
  }
}
