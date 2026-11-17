import {
  approvedImageMessage,
  buildImageGenerationResult,
  readImageDispatchResult,
} from '@api/services/agent-orchestrator/tools/agent-image-generation-result';
import { resolveInputContinuationContent } from '@api/services/agent-threading/utils/agent-input-request-response.util';
import { describe, expect, it } from 'vitest';

const endpoint = 'https://cdn.example.com/ingredients';
const url = 'https://cdn.example.com/one.png';

describe('approved image output', () => {
  it('carries the question with a generic choice into the next turn', () => {
    expect(
      resolveInputContinuationContent(
        undefined,
        { answer: 'Approve and generate', optionIds: ['approve'] },
        'One square sunset image?',
      ),
    ).toBe(
      'Question: One square sunset image?\nSelected answer: Approve and generate',
    );
  });
  it.each(['queued', 'pending', 'PROCESSING'])(
    'keeps %s queued even with a placeholder URL',
    (status) => {
      expect(
        readImageDispatchResult({ id: 'one', status, url }, endpoint),
      ).toEqual({ id: 'one' });
    },
  );
  it.each(['FAILED', 'cancelled', 'draft'])(
    'rejects %s with an otherwise renderable URL',
    (status) => {
      expect(
        readImageDispatchResult({ id: 'one', status, url }, endpoint),
      ).toHaveProperty('error');
    },
  );
  it('requires a card for the same Library image and distinguishes queued from ready', () => {
    const done = buildImageGenerationResult('one', url, 'sunset', []);
    expect(approvedImageMessage(done)).toContain('saved to the Library');
    expect(
      approvedImageMessage(
        buildImageGenerationResult('one', undefined, 'sunset', []),
      ),
    ).toContain('queued');
    expect(approvedImageMessage({ ...done, nextActions: [] })).toBeUndefined();
    expect(
      approvedImageMessage({ ...done, data: { ...done.data, id: 'two' } }),
    ).toBeUndefined();
  });
});
