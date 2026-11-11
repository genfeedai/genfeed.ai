import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import {
  getJsonApiErrorMessage,
  getJsonApiErrorMetaBoolean,
  getJsonApiErrorMetaCode,
} from '@services/core/json-api-error-message';

/** Machine-readable reasons the API gives when it refuses a mention (#9946). */
export const MENTION_NOT_ALLOWED = 'MENTION_NOT_ALLOWED';
export const MENTION_NEEDS_SHARE = 'MENTION_NEEDS_SHARE';

export interface SendThreadMessageInput {
  content: string;
  mentionedUserIds?: string[];
  /** Share the thread at "Can view" with mentioned teammates who cannot open it. */
  shareMentioned?: boolean;
}

export interface ThreadMessageMention {
  id: string;
  name: string;
}

export class ThreadMessage {
  id!: string;
  userId?: string | null;
  role!: 'user' | 'assistant' | 'system';
  content!: string;
  mentions?: ThreadMessageMention[];
  createdAt!: string;

  constructor(partial: Partial<ThreadMessage>) {
    Object.assign(this, partial);
  }
}

/**
 * Why the API refused a message: a mentioned teammate is not allowed, or cannot
 * open the thread yet. `canShare` says whether the author may share the thread
 * with them in the same step.
 */
export class ThreadMentionRefusedError extends Error {
  constructor(
    message: string,
    readonly reason: typeof MENTION_NOT_ALLOWED | typeof MENTION_NEEDS_SHARE,
    readonly canShare: boolean,
  ) {
    super(message);
    this.name = 'ThreadMentionRefusedError';
  }
}

const MESSAGES_PAGE_LIMIT = 100;
const MENTION_NEEDS_SHARE_STATUS = 409;

/** Messages of an agent thread, the conversation a review request opens. */
export class AgentThreadMessagesService extends BaseService<
  ThreadMessage,
  SendThreadMessageInput,
  Partial<SendThreadMessageInput>
> {
  constructor(token: string) {
    super('/agent/threads', token, ThreadMessage);
  }

  public static getInstance(token: string): AgentThreadMessagesService {
    return BaseService.getDataServiceInstance(
      AgentThreadMessagesService,
      token,
    );
  }

  /** The latest messages of a thread, oldest first. */
  async listMessages(
    threadId: string,
    signal?: AbortSignal,
  ): Promise<ThreadMessage[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${threadId}/messages`,
      this.instance
        .get<JsonApiResponseDocument>(`/${threadId}/messages`, {
          params: { limit: MESSAGES_PAGE_LIMIT },
          signal,
        })
        .then((response) => this.mapMany(response.data)),
    );
  }

  /**
   * Writes a message. A refused mention throws `ThreadMentionRefusedError`
   * so the caller can offer the share; nothing is saved in that case.
   */
  async sendMessage(
    threadId: string,
    input: SendThreadMessageInput,
  ): Promise<ThreadMessage> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${threadId}/messages`,
        input,
      );
      return await this.mapOne(response.data);
    } catch (error: unknown) {
      const reason = getJsonApiErrorMetaCode(error, 'reason');
      if (reason === MENTION_NEEDS_SHARE || reason === MENTION_NOT_ALLOWED) {
        throw new ThreadMentionRefusedError(
          getJsonApiErrorMessage(error, 'That teammate cannot be mentioned.'),
          reason,
          getJsonApiErrorMetaBoolean(error, 'canShare') === true,
        );
      }
      // In production the API error document passes through only when its
      // detail is short; a refusal to share still arrives as a conflict.
      if (
        input.mentionedUserIds?.length &&
        readStatus(error) === MENTION_NEEDS_SHARE_STATUS
      ) {
        throw new ThreadMentionRefusedError(
          getJsonApiErrorMessage(
            error,
            'That teammate cannot open this thread.',
          ),
          MENTION_NEEDS_SHARE,
          false,
        );
      }
      return this.handleOperationError(
        `POST ${this.baseURL}/${threadId}/messages`,
        error,
      );
    }
  }
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const record = error as {
    errors?: Array<{ status?: unknown }>;
    response?: { status?: unknown };
    status?: unknown;
  };
  const candidates = [
    record.status,
    record.response?.status,
    record.errors?.[0]?.status,
  ];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status)) {
      return status;
    }
  }
  return undefined;
}
