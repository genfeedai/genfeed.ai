import { describe, expect, it } from 'vitest';
import { workflowFailureFingerprint } from './workflow-failure-fingerprint';

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
      'Nodes failed: publish: Job cmhq2x9k40001ab12cd34ef56 timed out at 2026-11-05T05:27:35.560Z',
      'Nodes failed: publish: Job cmhq3z1m80002gh78ij90kl12 timed out at 2026-11-04T09:14:46.131Z',
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
