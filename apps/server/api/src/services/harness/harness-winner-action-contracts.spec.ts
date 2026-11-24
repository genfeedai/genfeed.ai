import type { PerformanceContentItem } from '@api/collections/content-performance/services/performance-summary.service';
import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

const PROVENANCE = {
  nodeId: 'prepare-brand',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

function contractFor(actionId: string) {
  const action = getActionDefinition(actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });
}

const GENFEED_ITEM: PerformanceContentItem = {
  comments: 2,
  description: 'A hook that worked',
  engagementRate: 4.2,
  id: 'analytics-1',
  likes: 20,
  origin: 'genfeed',
  platform: 'twitter',
  postId: 'post-1',
  publishDate: '2026-11-20T10:00:00.000Z',
  saves: 1,
  shares: 3,
  title: 'Winner',
  views: 900,
};

const IMPORTED_ITEM: PerformanceContentItem = {
  ...GENFEED_ITEM,
  id: 'source-post-1',
  origin: 'imported',
  postId: 'source-post-1',
  sourcePostId: 'source-post-1',
};

describe('harness winner promotion contracts', () => {
  // The winner candidates are the rows PerformanceSummaryService returns, so a
  // row's identity and origin must pass the closed contract or the whole
  // promotion run fails at prepare-brand.
  it.each([
    ['a Genfeed post', GENFEED_ITEM],
    ['an imported post', IMPORTED_ITEM],
  ])('prepare-brand output accepts %s as a candidate', (_name, item) => {
    const contract = contractFor('harness.winners.prepare-brand');

    expect(() =>
      contract.validateOutput(
        {
          baseInput: { contextBaseId: 'context-1', organizationId: 'org-1' },
          brandId: 'brand-1',
          items: [{ content: 'A hook that worked', item }],
          skipped: 0,
        },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('promote-item input accepts the candidate prepare-brand produced', () => {
    const contract = contractFor('harness.winners.promote-item');

    expect(() =>
      contract.validateInput(
        {
          contextBaseId: 'context-1',
          item: { content: 'A hook that worked', item: IMPORTED_ITEM },
          organizationId: 'org-1',
        },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('still refuses a candidate with an unknown field', () => {
    const contract = contractFor('harness.winners.promote-item');

    expect(() =>
      contract.validateInput(
        {
          contextBaseId: 'context-1',
          item: {
            content: 'x',
            item: { ...GENFEED_ITEM, surprise: true },
          },
          organizationId: 'org-1',
        },
        PROVENANCE,
      ),
    ).toThrow();
  });
});
