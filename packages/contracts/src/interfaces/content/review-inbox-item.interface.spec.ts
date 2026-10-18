import { describe, expect, it } from 'vitest';
import {
  buildReviewInboxItemId,
  parseReviewInboxItemId,
} from './review-inbox-item.interface';

describe('review inbox item ids', () => {
  it('round-trips a workflow review gate, keeping colons in the node id', () => {
    const id = buildReviewInboxItemId({
      executionId: 'exec-1',
      kind: 'workflow_review_gate',
      nodeId: 'gate:caption',
    });

    expect(id).toBe('workflow_review_gate:exec-1:gate:caption');
    expect(parseReviewInboxItemId(id)).toEqual({
      executionId: 'exec-1',
      kind: 'workflow_review_gate',
      nodeId: 'gate:caption',
    });
  });

  it('round-trips an MCP approval', () => {
    const id = buildReviewInboxItemId({
      approvalId: 'apr-1',
      kind: 'mcp_approval',
    });

    expect(id).toBe('mcp_approval:apr-1');
    expect(parseReviewInboxItemId(id)).toEqual({
      approvalId: 'apr-1',
      kind: 'mcp_approval',
    });
  });

  it.each([
    '',
    'apr-1',
    ':apr-1',
    'mcp_approval:',
    'mcp_approval:a:b',
    'workflow_review_gate:exec-1',
    'workflow_review_gate::node',
    'workflow_review_gate:exec-1:',
    'turbo_run_item:run-1:item-1',
  ])('rejects malformed id %j', (value) => {
    expect(parseReviewInboxItemId(value)).toBeNull();
  });
});
