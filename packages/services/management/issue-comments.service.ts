import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';

export interface CreateIssueCommentInput {
  body: string;
}

const issueCommentSerializer: IServiceSerializer<IssueComment> = {
  serialize: (data) => data,
};

export class IssueComment {
  id!: string;
  organization!: string;
  issue!: string;
  authorUserId?: string;
  authorAgentId?: string;
  body!: string;
  isDeleted!: boolean;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<IssueComment>) {
    Object.assign(this, partial);
  }

  get isAgentComment(): boolean {
    return !!this.authorAgentId && !this.authorUserId;
  }
}

export class IssueCommentsService extends BaseService<
  IssueComment,
  CreateIssueCommentInput,
  Partial<CreateIssueCommentInput>
> {
  constructor(token: string, issueId: string) {
    super(
      `/issues/${issueId}/comments`,
      token,
      IssueComment,
      issueCommentSerializer,
    );
  }

  public static getInstanceForIssue(
    token: string,
    issueId: string,
  ): IssueCommentsService {
    return BaseService.getDataServiceInstance(
      IssueCommentsService,
      token,
      issueId,
    ) as IssueCommentsService;
  }

  async list(): Promise<IssueComment[]> {
    return this.findAll();
  }

  async addComment(body: string): Promise<IssueComment> {
    return this.post({ body });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${commentId}`,
      this.instance.delete(`/${commentId}`).then(() => undefined),
    );
  }
}
