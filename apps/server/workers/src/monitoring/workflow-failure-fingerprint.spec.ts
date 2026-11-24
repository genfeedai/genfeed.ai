import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import {
  isExpectedPublishRefusal,
  workflowFailureFingerprint,
} from './workflow-failure-fingerprint';

describe('workflowFailureFingerprint', () => {
  it.each([
    [
      'Nodes failed: transcribe: Media download is unavailable (HTTP 403)',
      [
        'workflow-node-failed',
        'transcribe',
        'Media download is unavailable (HTTP 403)',
      ],
    ],
    [
      'Nodes failed: infer-turn: The planner returned an empty plan.',
      [
        'workflow-node-failed',
        'infer-turn',
        'The planner returned an empty plan.',
      ],
    ],
    [
      'Nodes failed: load-context: Template prompt.article.generate not found',
      [
        'workflow-node-failed',
        'load-context',
        'Template prompt.article.generate not found',
      ],
    ],
    [
      'Nodes failed: prepare-source',
      ['workflow-node-failed', 'prepare-source', ''],
    ],
    [
      'System workflow trend-refresh failed',
      ['system-workflow', 'trend-refresh', 'failed'],
    ],
    [
      'System workflow trend-refresh was cancelled',
      ['system-workflow', 'trend-refresh', 'was cancelled'],
    ],
  ])('groups %s by node and cause', (message, fingerprint) => {
    expect(workflowFailureFingerprint(new Error(message))).toEqual(fingerprint);
  });

  it.each([
    [
      'Nodes failed: transcribe: Download of https://cdn.example/a.mp4?sig=abc failed',
      'Nodes failed: transcribe: Download of https://cdn.example/b.mp4?sig=xyz failed',
    ],
    [
      'Nodes failed: publish: Post 3f2b9c1e-8a4d-4b6e-9f1a-2c3d4e5f6a7b rejected',
      'Nodes failed: publish: Post 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d rejected',
    ],
    [
      `Nodes failed: publish: Job ${testId('job', 1)} timed out at 2026-11-05T05:27:35.560Z`,
      `Nodes failed: publish: Job ${testId('job', 2)} timed out at 2026-11-04T09:14:46.131Z`,
    ],
  ])(
    'puts runs that differ only in ids, urls or times together',
    (first, second) => {
      expect(workflowFailureFingerprint(new Error(first))).toEqual(
        workflowFailureFingerprint(new Error(second)),
      );
    },
  );

  it('keeps different HTTP statuses apart', () => {
    expect(
      workflowFailureFingerprint(
        new Error(
          'Nodes failed: transcribe: Media download is unavailable (HTTP 403)',
        ),
      ),
    ).not.toEqual(
      workflowFailureFingerprint(
        new Error(
          'Nodes failed: transcribe: Media download is unavailable (HTTP 404)',
        ),
      ),
    );
  });

  it.each([
    [new Error('Unknown workflow execution job type: other')],
    ['Nodes failed: transcribe: not an Error'],
    [undefined],
  ])('leaves default grouping for %s', (error) => {
    expect(workflowFailureFingerprint(error)).toBeUndefined();
  });
});

describe('isExpectedPublishRefusal', () => {
  it.each([
    'Nodes failed: claim-publish: Branded Publish Hold Exception',
    'Nodes failed: claim-publish: This post is held: it breaks the brand Policy. A member must approve it in the app before it can publish.',
    'Nodes failed: claim-publish: Publish approval is not queued.',
    'Nodes failed: claim-publish: Publish approval cannot transition from invalidated to queued.',
  ])('treats a refused claim as handled: %s', (message) => {
    expect(isExpectedPublishRefusal(new Error(message))).toBe(true);
  });

  it.each([
    'Nodes failed: claim-publish: connect ECONNRESET',
    'Nodes failed: publish: Branded Publish Hold Exception',
    'Nodes failed: claim-publish: Conflict Exception',
  ])('still reports a failure that may be ours: %s', (message) => {
    expect(isExpectedPublishRefusal(new Error(message))).toBe(false);
  });

  it('ignores a value that is not an Error', () => {
    expect(isExpectedPublishRefusal('Nodes failed: claim-publish: x')).toBe(
      false,
    );
  });
});
