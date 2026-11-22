import { ALL_ACTIONS } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  type ActionContractProvenance,
  compileActionContract,
} from './action-contract';

const PROVENANCE: ActionContractProvenance = {
  nodeId: 'discover-analytics',
  runId: 'run-1',
  workflowId: 'analytics-sync',
  workflowVersionId: 'v1',
};

const ITEM = {
  brandId: 'brand-1',
  comments: 2,
  contentType: 'caption',
  likes: 10,
  measuredAt: '2026-11-22T12:00:00.000Z',
  organizationId: 'org-1',
  postId: 'post-1',
  saves: 1,
  shares: 3,
  sourceAnalyticsId: 'analytics-1',
  views: 100,
};

function compile(actionId: string) {
  const action = ALL_ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`missing action: ${actionId}`);
  }
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });
}

describe('analytics.generic.discover output contract', () => {
  it.each([
    ['a provider that reports no clicks', ITEM],
    [
      'a post with hook and prompt text',
      { ...ITEM, clicks: 4, hookUsed: 'Hook line', promptUsed: 'Prompt text' },
    ],
  ])('accepts an item for %s', (_label, item) => {
    expect(() =>
      compile('analytics.generic.discover').validateOutput(
        { items: [item] },
        PROVENANCE,
      ),
    ).not.toThrow();
  });

  it('still rejects an item without a required metric', () => {
    const { views: _views, ...withoutViews } = ITEM;
    expect(() =>
      compile('analytics.generic.discover').validateOutput(
        { items: [withoutViews] },
        PROVENANCE,
      ),
    ).toThrow(/views/);
  });

  it('hands the same item to persist unchanged', () => {
    const item = { ...ITEM, hookUsed: 'Hook line', promptUsed: 'Prompt text' };
    expect(() =>
      compile('analytics.generic.persist').validateInput({ item }, PROVENANCE),
    ).not.toThrow();
  });
});
