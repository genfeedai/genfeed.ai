import { describe, expect, it } from 'vitest';
import { serializeBatchItemAssignee } from './batch-item-assignee.helper';

describe('serializeBatchItemAssignee', () => {
  it('exposes only id, handle, and display name', () => {
    const assignee = serializeBatchItemAssignee({
      firstName: 'Jane',
      handle: 'jane',
      id: 'user-1',
      lastName: 'Doe',
      name: 'Jane Doe',
    });

    expect(assignee).toEqual({
      displayName: 'Jane Doe',
      handle: 'jane',
      id: 'user-1',
    });
    expect(Object.keys(assignee).toSorted()).toEqual([
      'displayName',
      'handle',
      'id',
    ]);
  });

  it('never copies email or credentials from a wider user record', () => {
    const assignee = serializeBatchItemAssignee({
      email: 'secret@example.com',
      handle: 'jane',
      id: 'user-1',
      name: 'Jane',
      password: 'hunter2',
    } as never);

    expect(assignee).toEqual({
      displayName: 'Jane',
      handle: 'jane',
      id: 'user-1',
    });
    expect(JSON.stringify(assignee)).not.toContain('secret');
    expect(JSON.stringify(assignee)).not.toContain('hunter2');
    expect(JSON.stringify(assignee)).not.toContain('@example.com');
  });

  it('falls back to handle, then a bounded team-member label', () => {
    expect(
      serializeBatchItemAssignee({
        handle: 'jane',
        id: 'user-1',
      }),
    ).toEqual({
      displayName: 'jane',
      handle: 'jane',
      id: 'user-1',
    });

    expect(
      serializeBatchItemAssignee({
        id: 'user-abcdef12',
      }),
    ).toEqual({
      displayName: 'Team member user-abc',
      handle: '',
      id: 'user-abcdef12',
    });
  });
});
