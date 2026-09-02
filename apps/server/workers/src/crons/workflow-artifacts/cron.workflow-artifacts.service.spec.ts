import {
  buildWorkflowArtifactCleanupSweepDefinition,
  WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS,
} from '@api/collections/workflows/services/workflow-artifact-workflow-definition';

describe('workflow artifact cleanup sweep', () => {
  it('fans expired execution scopes into the cleanup child workflow', () => {
    const definition = buildWorkflowArtifactCleanupSweepDefinition(
      'workflow.artifact.discover-expired',
    );
    expect(definition.canonicalId).toBe(
      WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS.CLEANUP_SWEEP,
    );
    expect(definition.definition.nodes[1]?.data.config.actionId).toBe(
      'workflow.for-each-tenant',
    );
  });
});
