import type { IServiceSerializer } from '@cloud/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';

export interface CreateTaskCommentInput {
  body: string;
}

const taskCommentSerializer: IServiceSerializer<TaskComment> = {
  serialize: (data) => data,
};

export class TaskComment {
  id!: string;
  organization!: string;
  task!: string;
  authorUserId?: string;
  authorAgentId?: string;
  body!: string;
  isDeleted!: boolean;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<TaskComment>) {
    Object.assign(this, partial);
  }

  get isAgentComment(): boolean {
    return !!this.authorAgentId && !this.authorUserId;
  }
}

export class TaskCommentsService extends BaseService<
  TaskComment,
  CreateTaskCommentInput,
  Partial<CreateTaskCommentInput>
> {
  constructor(token: string, taskId: string) {
    super(
      `/tasks/${taskId}/comments`,
      token,
      TaskComment,
      taskCommentSerializer,
    );
  }

  public static getInstanceForTask(
    token: string,
    taskId: string,
  ): TaskCommentsService {
    return BaseService.getDataServiceInstance(
      TaskCommentsService,
      token,
      taskId,
    ) as TaskCommentsService;
  }

  async list(): Promise<TaskComment[]> {
    return this.findAll();
  }

  async addComment(body: string): Promise<TaskComment> {
    return this.post({ body });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.executeWithErrorHandling(
      `DELETE ${this.baseURL}/${commentId}`,
      this.instance.delete(`/${commentId}`).then(() => undefined),
    );
  }
}
