import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';
import {
  assertKnowledgeWorkflowScopeParameters,
  attachKnowledgeWorkflowProvenance,
  shouldUseKnowledgeWorkflowEntry,
} from './knowledge-workflow-execution.util';

const context: ExecutionContext = {
  brandId: 'brand-1',
  isCustomerWorkflow: true,
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'wf-1',
  workflowVersionId: 'version-1',
};

describe('knowledge workflow execution', () => {
  it('uses the scoped entry for customer workflows even with Agent runtime', () => {
    expect(
      shouldUseKnowledgeWorkflowEntry({
        hasAgentRuntimeContext: true,
        isCustomerWorkflow: true,
      }),
    ).toBe(true);
  });

  it('rejects conflicting scope parameters', () => {
    expect(() =>
      assertKnowledgeWorkflowScopeParameters(
        { brandId: 'other-brand' },
        context,
      ),
    ).toThrow('Knowledge source was not found');
  });

  it('attaches provenance from cited passages without fabricating versions', () => {
    const result = attachKnowledgeWorkflowProvenance(
      {
        creditsUsed: 0,
        data: {
          passages: [
            {
              citation: { sourceId: 'src-1', versionId: 'ver-1' },
              content: 'a',
              relevance: 0.9,
            },
            {
              citation: { sourceId: 'src-1', versionId: 'ver-1' },
              content: 'b',
              relevance: 0.8,
            },
          ],
          query: 'voice',
        },
        success: true,
      },
      context,
      'search-1',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        workflowProvenance: {
          nodeId: 'search-1',
          runId: 'run-1',
          sources: [{ sourceId: 'src-1', sourceVersionId: 'ver-1' }],
          workflowVersionId: 'version-1',
        },
      }),
    );
  });
});
