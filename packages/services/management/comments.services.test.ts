import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  IssueComment,
  IssueCommentsService,
} from '@services/management/issue-comments.service';
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

describe('IssueComment model', () => {
  it('isAgentComment requires an agent author and no user author', () => {
    expect(new IssueComment({ authorAgentId: 'agent_1' }).isAgentComment).toBe(
      true,
    );
    expect(new IssueComment({ authorUserId: 'user_1' }).isAgentComment).toBe(
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

describe('IssueCommentsService', () => {
  let service: IssueCommentsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IssueCommentsService('comments-token', 'issue_1');
    http = installMockHttp(service);
  });

  it('getInstanceForIssue caches per token and issue', () => {
    const first = IssueCommentsService.getInstanceForIssue('tok', 'issue_1');
    expect(IssueCommentsService.getInstanceForIssue('tok', 'issue_1')).toBe(
      first,
    );
  });

  it('list GETs the comments for the issue', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ body: 'Bug', id: 'comment_2' }])),
    );

    const result = await service.list();

    expect(result[0]).toBeInstanceOf(IssueComment);
  });

  it('addComment POSTs the body', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ body: 'Bug' }, { id: 'comment_2' })),
    );

    const result = await service.addComment('Bug');

    expect(http.post).toHaveBeenCalledWith('', { body: 'Bug' });
    expect(result.body).toBe('Bug');
  });

  it('deleteComment DELETEs the comment', async () => {
    http.delete.mockResolvedValue(axiosResponse(undefined));

    await expect(service.deleteComment('comment_2')).resolves.toBeUndefined();

    expect(http.delete).toHaveBeenCalledWith('/comment_2');
  });
});
