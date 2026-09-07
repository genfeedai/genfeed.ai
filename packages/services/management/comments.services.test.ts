import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  TaskComment,
  TaskCommentsService,
} from '@services/management/task-comments.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TaskComment model', () => {
  it('isAgentComment requires an agent author and no user author', () => {
    expect(new TaskComment({ authorAgentId: 'agent_1' }).isAgentComment).toBe(
      true,
    );
    expect(
      new TaskComment({ authorAgentId: 'agent_1', authorUserId: 'user_1' })
        .isAgentComment,
    ).toBe(false);
    expect(new TaskComment({ authorUserId: 'user_1' }).isAgentComment).toBe(
      false,
    );
  });
});

describe('TaskCommentsService', () => {
  let service: TaskCommentsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskCommentsService('comments-token', 'task_1');
    http = installMockHttp(service);
  });

  it('getInstanceForTask caches per token and task', () => {
    const first = TaskCommentsService.getInstanceForTask('tok', 'task_1');
    expect(TaskCommentsService.getInstanceForTask('tok', 'task_1')).toBe(first);
    expect(TaskCommentsService.getInstanceForTask('tok', 'task_2')).not.toBe(
      first,
    );
  });

  it('list GETs the comments for the task', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ body: 'Nice', id: 'comment_1' }])),
    );

    const result = await service.list();

    expect(http.get).toHaveBeenCalledWith('', {
      params: {},
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(TaskComment);
  });

  it('addComment POSTs the body', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ body: 'Nice' }, { id: 'comment_1' })),
    );

    const result = await service.addComment('Nice');

    expect(http.post).toHaveBeenCalledWith('', { body: 'Nice' });
    expect(result.body).toBe('Nice');
  });

  it('deleteComment DELETEs the comment', async () => {
    http.delete.mockResolvedValue(axiosResponse(undefined));

    await expect(service.deleteComment('comment_1')).resolves.toBeUndefined();

    expect(http.delete).toHaveBeenCalledWith('/comment_1');
  });
});
