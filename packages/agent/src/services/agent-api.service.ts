import type {
  AgentChatMessage,
  AgentChatPayload,
  AgentChatResponse,
  AgentChatStreamResponse,
  AgentCreditsInfo,
  AgentMemoryEntry,
  AgentRunSummary,
  AgentThread,
  AgentThreadSnapshot,
  CreateThreadPayload,
  SendMessagePayload,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  type AgentApiError,
  AgentApiRequestError,
} from '@genfeedai/agent/services/agent-api-error';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  ContentMentionItem,
  TeamMentionItem,
} from '@genfeedai/agent/types/mention.types';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';
import { Effect } from 'effect';

export type { AgentApiConfig } from '@genfeedai/agent/services/agent-base-api.service';

export interface CredentialMentionItem {
  id: string;
  handle: string;
  name: string;
  platform: string;
  avatar: string | null;
}

export interface AgentInstallReadiness {
  authMode: 'clerk' | 'none';
  billingMode: 'cloud_billing' | 'oss_local';
  localTools: {
    anyDetected: boolean;
    claude: boolean;
    codex: boolean;
    detected: string[];
  };
  providers: {
    anyConfigured: boolean;
    configured: string[];
    fal: boolean;
    imageGenerationReady: boolean;
    openai: boolean;
    replicate: boolean;
    textGenerationReady: boolean;
  };
  ui: {
    showBilling: boolean;
    showCloudUpgradeCta: boolean;
    showCredits: boolean;
    showPricing: boolean;
  };
  workspace: {
    brandId: string | null;
    hasBrand: boolean;
    hasOrganization: boolean;
    organizationId: string | null;
  };
}

export type GenerationModel = IModel;

export interface GenerateIngredientResult {
  id: string;
  url?: string;
}

export interface AgentClonedVoice {
  id: string;
  metadataLabel?: string;
  provider?: string;
  cloneStatus?: string;
  sampleAudioUrl?: string;
}

export interface WorkflowInterfaceField {
  defaultValue?: unknown;
  description?: string;
  label?: string;
  required?: boolean;
  type: string;
  validation?: Record<string, unknown>;
}

export interface WorkflowInterfaceSchema {
  inputs: Record<string, WorkflowInterfaceField>;
  outputs: Record<string, WorkflowInterfaceField>;
}

export interface ManualReviewBatchPayload {
  brandId: string;
  items: Array<{
    caption?: string;
    format: string;
    ingredientId?: string;
    label?: string;
    mediaUrl?: string;
    platform?: string;
    prompt?: string;
    sourceActionId?: string;
    sourceWorkflowId?: string;
    sourceWorkflowName?: string;
  }>;
}

interface PresignedUploadResponse {
  data: {
    id: string;
    attributes: {
      publicUrl: string;
      uploadUrl: string;
    };
  };
}

export class AgentApiService extends AgentBaseApiService {
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  getToken(): Promise<string | null> {
    return this.config.getToken();
  }

  createThreadEffect(
    payload: CreateThreadPayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.fetchResourceEffect<AgentThread>(
      `${this.config.baseUrl}/threads`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Failed to create thread',
      'Failed to deserialize thread',
    );
  }

  sendMessageEffect(
    payload: SendMessagePayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentChatMessage, AgentApiError> {
    const { threadId, ...body } = payload;
    return this.fetchResourceEffect<AgentChatMessage>(
      `${this.config.baseUrl}/threads/${threadId}/messages`,
      { body: JSON.stringify(body), method: 'POST', signal },
      'Failed to send message',
      'Failed to deserialize thread message',
    ).pipe(
      Effect.map((message) => ({
        ...message,
        threadId,
      })),
    );
  }

  chatEffect(
    payload: AgentChatPayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentChatResponse, AgentApiError> {
    return this.fetchJsonEffect<AgentChatResponse>(
      `${this.config.baseUrl}/agent/chat`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Agent chat failed',
    );
  }

  chatStreamEffect(
    payload: AgentChatPayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentChatStreamResponse, AgentApiError> {
    return this.fetchJsonEffect<AgentChatStreamResponse>(
      `${this.config.baseUrl}/agent/chat/stream`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Agent chat stream failed',
    );
  }

  getThreadsEffect(
    params?: {
      page?: number;
      limit?: number;
      status?: AgentThreadStatus;
    },
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread[], AgentApiError> {
    const qs = new URLSearchParams();
    if (params?.page) {
      qs.set('page', String(params.page));
    }
    if (params?.limit) {
      qs.set('limit', String(params.limit));
    }
    if (params?.status) {
      qs.set('status', params.status);
    }
    const queryString = qs.toString();
    return this.fetchCollectionEffect<AgentThread>(
      `${this.config.baseUrl}/threads${queryString ? `?${queryString}` : ''}`,
      { signal },
      'Failed to fetch threads',
      'Failed to deserialize thread collection',
    );
  }

  archiveAllThreadsEffect(
    signal?: AbortSignal,
  ): Effect.Effect<{ archivedCount: number }, AgentApiError> {
    return this.fetchJsonEffect<{ archivedCount: number }>(
      `${this.config.baseUrl}/threads/archive-all`,
      { method: 'POST', signal },
      'Failed to archive all threads',
    );
  }

  archiveThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.updateThreadEffect(
      threadId,
      { status: AgentThreadStatus.ARCHIVED },
      signal,
    );
  }

  unarchiveThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.updateThreadEffect(
      threadId,
      { status: AgentThreadStatus.ACTIVE },
      signal,
    );
  }

  getThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.fetchResourceEffect<AgentThread>(
      `${this.config.baseUrl}/threads/${threadId}`,
      { signal },
      'Failed to fetch thread',
      'Failed to deserialize thread',
    );
  }

  getThreadSnapshotEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThreadSnapshot, AgentApiError> {
    return this.fetchJsonEffect<AgentThreadSnapshot>(
      `${this.config.baseUrl}/threads/${threadId}/snapshot`,
      { signal },
      'Failed to fetch thread snapshot',
    );
  }

  updateThreadEffect(
    threadId: string,
    payload: {
      isPinned?: boolean;
      planModeEnabled?: boolean;
      requestedModel?: string;
      runtimeKey?: string;
      title?: string;
      systemPrompt?: string;
      memoryEntryIds?: string[];
      status?: AgentThreadStatus;
    },
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.fetchResourceEffect<AgentThread>(
      `${this.config.baseUrl}/threads/${threadId}`,
      { body: JSON.stringify(payload), method: 'PATCH', signal },
      'Failed to update thread',
      'Failed to deserialize thread',
    );
  }

  getInstallReadinessEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentInstallReadiness, AgentApiError> {
    return this.fetchJsonEffect<AgentInstallReadiness>(
      `${this.config.baseUrl}/onboarding/install-readiness`,
      { signal },
      'Failed to fetch local install readiness',
    );
  }

  branchThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.fetchResourceEffect<AgentThread>(
      `${this.config.baseUrl}/threads/${threadId}/branches`,
      { method: 'POST', signal },
      'Failed to branch thread',
      'Failed to deserialize thread branch',
    );
  }

  respondToInputRequestEffect(
    threadId: string,
    requestId: string,
    answer: string,
    signal?: AbortSignal,
  ): Effect.Effect<
    {
      answer: string | null;
      requestId: string;
      resolvedAt: string | null;
      status: string;
      threadId: string;
    },
    AgentApiError
  > {
    return this.fetchJsonEffect<{
      answer: string | null;
      requestId: string;
      resolvedAt: string | null;
      status: string;
      threadId: string;
    }>(
      `${this.config.baseUrl}/threads/${threadId}/input-requests/${requestId}/responses`,
      { body: JSON.stringify({ answer }), method: 'POST', signal },
      'Failed to respond to input request',
    );
  }

  respondToUiActionEffect(
    threadId: string,
    action: string,
    payload?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Effect.Effect<AgentChatResponse, AgentApiError> {
    return this.fetchJsonEffect<AgentChatResponse>(
      `${this.config.baseUrl}/threads/${threadId}/ui-actions`,
      {
        body: JSON.stringify({ action, payload }),
        method: 'POST',
        signal,
      },
      'Failed to respond to UI action',
    );
  }

  pinThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.updateThreadEffect(threadId, { isPinned: true }, signal);
  }

  unpinThreadEffect(
    threadId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentThread, AgentApiError> {
    return this.updateThreadEffect(threadId, { isPinned: false }, signal);
  }

  getCreditsInfoEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentCreditsInfo, AgentApiError> {
    return this.fetchJsonEffect<AgentCreditsInfo>(
      `${this.config.baseUrl}/agent/credits`,
      { signal },
      'Failed to fetch credits info',
    );
  }

  getActiveRunsEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentRunSummary[], AgentApiError> {
    return this.fetchCollectionEffect<AgentRunSummary>(
      `${this.config.baseUrl}/runs/active`,
      { signal },
      'Failed to fetch active agent runs',
      'Failed to deserialize active runs',
    );
  }

  cancelRunEffect(
    runId: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentRunSummary, AgentApiError> {
    return this.fetchResourceEffect<AgentRunSummary>(
      `${this.config.baseUrl}/runs/${runId}/cancellations`,
      { method: 'POST', signal },
      'Failed to cancel active agent run',
      'Failed to deserialize agent run',
    );
  }

  getMentionsEffect(
    signal?: AbortSignal,
  ): Effect.Effect<CredentialMentionItem[], AgentApiError> {
    return this.fetchJsonEffect<{ mentions: CredentialMentionItem[] }>(
      `${this.config.baseUrl}/credentials/mentions`,
      { signal },
      'Failed to fetch mentions',
    ).pipe(Effect.map((json) => json.mentions));
  }

  // TODO: Create API endpoint GET /v1/team/mentions
  getTeamMentionsEffect(
    _signal?: AbortSignal,
  ): Effect.Effect<TeamMentionItem[], AgentApiError> {
    return Effect.succeed([]);
  }

  // TODO: Create API endpoint GET /v1/content/mentions
  getContentMentionsEffect(
    _signal?: AbortSignal,
  ): Effect.Effect<ContentMentionItem[], AgentApiError> {
    return Effect.succeed([]);
  }

  listMemoriesEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentMemoryEntry[], AgentApiError> {
    return this.fetchJsonEffect<AgentMemoryEntry[]>(
      `${this.config.baseUrl}/agent/memories`,
      { signal },
      'Failed to list memories',
    );
  }

  createMemoryEffect(
    payload: {
      content: string;
      summary?: string;
      tags?: string[];
      sourceMessageId?: string;
      kind?: string;
      scope?: string;
      contentType?: string;
      brandId?: string;
      platform?: string;
      sourceType?: string;
      sourceUrl?: string;
      sourceContentId?: string;
      importance?: number;
      confidence?: number;
      performanceSnapshot?: Record<string, unknown>;
      saveToContextMemory?: boolean;
    },
    signal?: AbortSignal,
  ): Effect.Effect<AgentMemoryEntry, AgentApiError> {
    return this.fetchJsonEffect<AgentMemoryEntry>(
      `${this.config.baseUrl}/agent/memories`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Failed to create memory',
    );
  }

  deleteMemoryEffect(
    memoryId: string,
    signal?: AbortSignal,
  ): Effect.Effect<{ status: string }, AgentApiError> {
    return this.fetchJsonEffect<{ status: string }>(
      `${this.config.baseUrl}/agent/memories/${memoryId}`,
      { method: 'DELETE', signal },
      'Failed to delete memory',
    );
  }

  getMessagesEffect(
    threadId: string,
    params?: { page?: number; limit?: number },
    signal?: AbortSignal,
  ): Effect.Effect<AgentChatMessage[], AgentApiError> {
    const qs = new URLSearchParams();
    if (params?.page) {
      qs.set('page', String(params.page));
    }
    if (params?.limit) {
      qs.set('limit', String(params.limit));
    }
    const queryString = qs.toString();
    return this.fetchCollectionEffect<AgentChatMessage>(
      `${this.config.baseUrl}/threads/${threadId}/messages${queryString ? `?${queryString}` : ''}`,
      { signal },
      'Failed to fetch messages',
      'Failed to deserialize thread messages',
    ).pipe(
      Effect.map((messages) =>
        messages.map((message) => ({
          ...message,
          threadId,
        })),
      ),
    );
  }

  getModelsEffect(
    signal?: AbortSignal,
  ): Effect.Effect<GenerationModel[], AgentApiError> {
    return this.fetchCollectionEffect<GenerationModel>(
      `${this.config.baseUrl}/models?isActive=true&pagination=false`,
      { signal },
      'Failed to fetch models',
      'Failed to deserialize models',
    );
  }

  getWorkflowInterfaceEffect(
    workflowId: string,
    signal?: AbortSignal,
  ): Effect.Effect<WorkflowInterfaceSchema, AgentApiError> {
    return this.fetchJsonEffect<{
      data?: WorkflowInterfaceSchema;
      inputs?: Record<string, WorkflowInterfaceField>;
      outputs?: Record<string, WorkflowInterfaceField>;
    }>(
      `${this.config.baseUrl}/workflows/${workflowId}/interface`,
      { signal },
      'Failed to fetch workflow interface',
    ).pipe(
      Effect.map(
        (json) =>
          json.data ?? {
            inputs: json.inputs ?? {},
            outputs: json.outputs ?? {},
          },
      ),
    );
  }

  triggerWorkflowEffect(
    workflowId: string,
    inputValues?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Effect.Effect<{ id: string; status: string }, AgentApiError> {
    return this.fetchJsonEffect<{ id: string; status: string }>(
      `${this.config.baseUrl}/workflow-executions`,
      {
        body: JSON.stringify({
          inputValues: inputValues ?? {},
          workflow: workflowId,
        }),
        method: 'POST',
        signal,
      },
      'Failed to trigger workflow',
    );
  }

  createManualReviewBatchEffect(
    payload: ManualReviewBatchPayload,
    signal?: AbortSignal,
  ): Effect.Effect<
    {
      id: string;
      items: Array<{ id: string; postId?: string }>;
    },
    AgentApiError
  > {
    return this.fetchJsonEffect<{
      id: string;
      items: Array<{ id: string; postId?: string }>;
    }>(
      `${this.config.baseUrl}/batches/manual-review`,
      {
        body: JSON.stringify(payload),
        method: 'POST',
        signal,
      },
      'Failed to create manual review batch',
    );
  }

  mergeVideosEffect(
    ids: string[],
    options?: {
      isMuteVideoAudio?: boolean;
      isResizeEnabled?: boolean;
      transition?: string;
      transitionDuration?: number;
    },
    signal?: AbortSignal,
  ): Effect.Effect<{ id: string; status: string }, AgentApiError> {
    return this.fetchJsonEffect<{ id: string; status: string }>(
      `${this.config.baseUrl}/videos/merge`,
      {
        body: JSON.stringify({
          category: 'video',
          ids,
          isMuteVideoAudio: options?.isMuteVideoAudio ?? true,
          isResizeEnabled: options?.isResizeEnabled ?? false,
          transition: options?.transition ?? 'none',
          transitionDuration: options?.transitionDuration ?? 0.5,
        }),
        method: 'POST',
        signal,
      },
      'Failed to merge videos',
    );
  }

  reframeVideoEffect(
    videoId: string,
    payload?: {
      format?: 'landscape' | 'portrait' | 'square';
      height?: number;
      prompt?: string;
      text?: string;
      width?: number;
    },
    signal?: AbortSignal,
  ): Effect.Effect<{ id: string; status: string }, AgentApiError> {
    return this.fetchJsonEffect<{ id: string; status: string }>(
      `${this.config.baseUrl}/videos/${videoId}/reframe`,
      {
        body: JSON.stringify({
          format: payload?.format ?? 'portrait',
          height: payload?.height,
          text: payload?.text ?? payload?.prompt,
          width: payload?.width,
        }),
        method: 'POST',
        signal,
      },
      'Failed to reframe video',
    );
  }

  resizeVideoEffect(
    videoId: string,
    width: number,
    height: number,
    signal?: AbortSignal,
  ): Effect.Effect<{ id: string; status: string }, AgentApiError> {
    return this.fetchJsonEffect<{ id: string; status: string }>(
      `${this.config.baseUrl}/videos/${videoId}/resize`,
      {
        body: JSON.stringify({ height, width }),
        method: 'POST',
        signal,
      },
      'Failed to resize video',
    );
  }

  createPromptEffect(
    body: {
      category: string;
      original: string;
      model?: string;
      ratio?: string;
      duration?: number;
      isSkipEnhancement?: boolean;
    },
    signal?: AbortSignal,
  ): Effect.Effect<{ id: string }, AgentApiError> {
    return this.fetchJsonEffect<{
      data: { id: string };
    }>(
      `${this.config.baseUrl}/prompts`,
      {
        body: JSON.stringify(body),
        method: 'POST',
        signal,
      },
      'Failed to create prompt',
    ).pipe(Effect.map((res) => ({ id: res.data.id })));
  }

  generateIngredientEffect(
    type: 'image' | 'video',
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Effect.Effect<GenerateIngredientResult, AgentApiError> {
    const endpoint = type === 'video' ? '/videos' : '/images';
    return this.fetchJsonEffect<GenerateIngredientResult>(
      `${this.config.baseUrl}${endpoint}`,
      {
        body: JSON.stringify({ ...body, waitForCompletion: true }),
        method: 'POST',
        signal,
      },
      'Generation failed',
    );
  }

  cloneVoiceEffect(
    formData: FormData,
    signal?: AbortSignal,
  ): Effect.Effect<AgentClonedVoice, AgentApiError> {
    return this.fetchResourceEffect<AgentClonedVoice>(
      `${this.config.baseUrl}/voices/clone`,
      {
        body: formData,
        method: 'POST',
        signal,
      },
      'Failed to clone voice',
      'Failed to deserialize cloned voice',
    );
  }

  getClonedVoicesEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentClonedVoice[], AgentApiError> {
    return this.fetchCollectionEffect<AgentClonedVoice>(
      `${this.config.baseUrl}/voices/cloned`,
      { signal },
      'Failed to fetch cloned voices',
      'Failed to deserialize cloned voices',
    );
  }

  setBrandVoiceDefaultsEffect(
    brandId: string,
    payload: {
      defaultVoiceId?: string;
      defaultAvatarPhotoUrl?: string;
      defaultAvatarIngredientId?: string;
    },
    signal?: AbortSignal,
  ): Effect.Effect<void, AgentApiError> {
    return this.fetchJsonEffect<JsonApiResponseDocument>(
      `${this.config.baseUrl}/brands/${brandId}/agent-config`,
      {
        body: JSON.stringify(payload),
        method: 'PATCH',
        signal,
      },
      'Failed to update brand voice defaults',
    ).pipe(Effect.as(undefined));
  }

  uploadAttachmentEffect(
    file: File,
    onProgress?: (pct: number) => void,
  ): Effect.Effect<{ ingredientId: string; url: string }, AgentApiError> {
    return Effect.gen(this, function* () {
      const presigned = yield* this.fetchJsonEffect<PresignedUploadResponse>(
        `${this.config.baseUrl}/images/upload/presigned`,
        {
          body: JSON.stringify({
            contentType: file.type,
            filename: file.name,
            type: 'image',
          }),
          method: 'POST',
        },
        'Failed to get presigned upload URL',
      );

      const { id } = presigned.data;
      const { uploadUrl, publicUrl } = presigned.data.attributes;

      yield* this.uploadFileToPresignedUrlEffect(file, uploadUrl, onProgress);
      yield* this.fetchJsonEffect(
        `${this.config.baseUrl}/images/upload/confirm/${id}`,
        { method: 'POST' },
        'Failed to confirm upload',
      );

      return { ingredientId: id, url: publicUrl };
    }) as Effect.Effect<{ ingredientId: string; url: string }, AgentApiError>;
  }

  private uploadFileToPresignedUrlEffect(
    file: File,
    uploadUrl: string,
    onProgress?: (pct: number) => void,
  ): Effect.Effect<void, AgentApiRequestError> {
    return Effect.tryPromise({
      catch: (cause) =>
        new AgentApiRequestError({
          detail: cause instanceof Error ? cause.message : undefined,
          message: cause instanceof Error ? cause.message : 'S3 upload failed',
          status: 0,
        }),
      try: () =>
        new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
              onProgress(Math.round((event.loaded * 100) / event.total));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
              return;
            }

            reject(new Error(`S3 upload failed: ${xhr.status}`));
          });

          xhr.addEventListener('error', () =>
            reject(new Error('S3 upload failed')),
          );
          xhr.send(file);
        }),
    });
  }
}
