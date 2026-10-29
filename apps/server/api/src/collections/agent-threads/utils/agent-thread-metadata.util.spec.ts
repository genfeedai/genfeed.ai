import { pickAgentThreadMetadata } from '@api/collections/agent-threads/utils/agent-thread-metadata.util';
import { describe, expect, it } from 'vitest';

describe('pickAgentThreadMetadata', () => {
  it('keeps the client-editable fields', () => {
    expect(
      pickAgentThreadMetadata({
        isPinned: true,
        memoryEntryIds: ['m1'],
        requestedModel: 'model',
        runtimeKey: 'claude-code',
        systemPrompt: 'Be brief',
        title: 'Renamed',
      }),
    ).toEqual({
      isPinned: true,
      memoryEntryIds: ['m1'],
      requestedModel: 'model',
      runtimeKey: 'claude-code',
      systemPrompt: 'Be brief',
      title: 'Renamed',
    });
  });

  it('drops columns the API owns, so the master cannot be demoted then archived', () => {
    const body = {
      isDeleted: true,
      kind: 'thread',
      parentThreadId: 'other',
      title: 'Kept',
      userId: 'someone-else',
    };

    expect(pickAgentThreadMetadata(body)).toEqual({ title: 'Kept' });
  });
});
