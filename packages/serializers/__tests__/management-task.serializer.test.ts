import { managementTaskAttributes } from '@serializers/attributes/management/task.attributes';
import { taskCommentAttributes } from '@serializers/attributes/management/task-comment.attributes';
import { TaskSerializer } from '@serializers/server/management/task.serializer';
import { TaskCommentSerializer } from '@serializers/server/management/task-comment.serializer';
import { describe, expect, it } from 'vitest';

describe('management task serializers canonical identity contracts', () => {
  it('serializes task scalar IDs and preserves the explicit linked issue ID', () => {
    const output = TaskSerializer.serialize({
      _id: 'legacy-task-id',
      assigneeAgentId: 'agent-1',
      assigneeUserId: 'user-2',
      brand: 'legacy-brand',
      brandId: 'brand-1',
      id: 'task-1',
      linkedIssueId: 'github-issue-2048',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      parent: 'legacy-parent',
      parentId: 'task-parent-1',
      planningThread: 'legacy-thread',
      planningThreadId: 'thread-1',
      title: 'Canonical task',
      user: 'legacy-user',
      userId: 'user-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        relationships?: Record<string, unknown>;
      };
    };

    expect(managementTaskAttributes).toEqual(
      expect.arrayContaining([
        'assigneeAgentId',
        'assigneeUserId',
        'brandId',
        'linkedIssueId',
        'organizationId',
        'parentId',
        'planningThreadId',
        'userId',
      ]),
    );
    expect(output.data.id).toBe('task-1');
    expect(output.data.attributes).toMatchObject({
      assigneeAgentId: 'agent-1',
      assigneeUserId: 'user-2',
      brandId: 'brand-1',
      linkedIssueId: 'github-issue-2048',
      organizationId: 'organization-1',
      parentId: 'task-parent-1',
      planningThreadId: 'thread-1',
      userId: 'user-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('brand');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('parent');
    expect(output.data.attributes).not.toHaveProperty('planningThread');
    expect(output.data.attributes).not.toHaveProperty('user');
    expect(output.data.relationships).toBeUndefined();
  });

  it('serializes task-comment scalar IDs without relation aliases', () => {
    const output = TaskCommentSerializer.serialize({
      _id: 'legacy-comment-id',
      authorAgentId: 'agent-1',
      authorUserId: 'user-1',
      body: 'Looks good.',
      id: 'comment-1',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      task: 'legacy-task',
      taskId: 'task-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        relationships?: Record<string, unknown>;
      };
    };

    expect(taskCommentAttributes).toEqual(
      expect.arrayContaining([
        'authorAgentId',
        'authorUserId',
        'organizationId',
        'taskId',
      ]),
    );
    expect(output.data.id).toBe('comment-1');
    expect(output.data.attributes).toMatchObject({
      authorAgentId: 'agent-1',
      authorUserId: 'user-1',
      organizationId: 'organization-1',
      taskId: 'task-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('task');
    expect(output.data.relationships).toBeUndefined();
  });
});
