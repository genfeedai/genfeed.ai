import type {
  AgentClonedVoice,
  AgentGeneratedAsset,
  GenerateIngredientResult,
  GenerationModel,
  PresignedUploadResponse,
} from '@genfeedai/agent/services/agent-api.types';
import {
  type AgentApiError,
  AgentApiRequestError,
} from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';
import { Effect } from 'effect';

export function getModelsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<GenerationModel[], AgentApiError> {
  // List endpoints are always paginated server-side (HTTP does not accept a
  // `pagination` flag) — the active model catalog fits in one max-size page.
  return api.fetchCollectionEffect<GenerationModel>(
    `${api.config.baseUrl}/models?isActive=true&limit=${MAX_PAGE_SIZE}`,
    { signal },
    'Failed to fetch models',
    'Failed to deserialize models',
  );
}

export function getGeneratedAssetEffect(
  api: AgentBaseApiService,
  id: string,
  signal?: AbortSignal,
): Effect.Effect<AgentGeneratedAsset, AgentApiError> {
  return api
    .fetchCollectionEffect<AgentGeneratedAsset>(
      `${api.config.baseUrl}/ingredients/batch?ids=${encodeURIComponent(id)}`,
      { signal },
      'Failed to reconcile generated asset',
      'Failed to deserialize generated asset',
    )
    .pipe(
      Effect.flatMap((assets) =>
        assets[0]
          ? Effect.succeed({
              ...assets[0],
              url: assets[0].url ?? assets[0].cdnUrl,
            })
          : Effect.fail(
              new AgentApiRequestError({
                detail: `Generated asset ${id} was not found`,
                message: 'Generated asset was not found',
                status: 404,
              }),
            ),
      ),
    );
}

export function mergeVideosEffect(
  api: AgentBaseApiService,
  ids: string[],
  options?: {
    isMuteVideoAudio?: boolean;
    isResizeEnabled?: boolean;
    transition?: string;
    transitionDuration?: number;
  },
  signal?: AbortSignal,
): Effect.Effect<{ id: string; status: string }, AgentApiError> {
  return api.fetchJsonEffect<{ id: string; status: string }>(
    `${api.config.baseUrl}/videos/merge`,
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

export function reframeVideoEffect(
  api: AgentBaseApiService,
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
  return api.fetchJsonEffect<{ id: string; status: string }>(
    `${api.config.baseUrl}/videos/${videoId}/reframe`,
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

export function resizeVideoEffect(
  api: AgentBaseApiService,
  videoId: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Effect.Effect<{ id: string; status: string }, AgentApiError> {
  return api.fetchJsonEffect<{ id: string; status: string }>(
    `${api.config.baseUrl}/videos/${videoId}/resize`,
    {
      body: JSON.stringify({ height, width }),
      method: 'POST',
      signal,
    },
    'Failed to resize video',
  );
}

export function createPromptEffect(
  api: AgentBaseApiService,
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
  return api
    .fetchJsonEffect<{
      data: { id: string };
    }>(
      `${api.config.baseUrl}/prompts`,
      {
        body: JSON.stringify(body),
        method: 'POST',
        signal,
      },
      'Failed to create prompt',
    )
    .pipe(Effect.map((res) => ({ id: res.data.id })));
}

export function generateIngredientEffect(
  api: AgentBaseApiService,
  type: 'image' | 'video',
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Effect.Effect<GenerateIngredientResult, AgentApiError> {
  const endpoint = type === 'video' ? '/videos' : '/images';
  return api.fetchJsonEffect<GenerateIngredientResult>(
    `${api.config.baseUrl}${endpoint}`,
    {
      body: JSON.stringify({
        ...body,
        waitForCompletion: body.waitForCompletion ?? true,
      }),
      method: 'POST',
      signal,
    },
    'Generation failed',
  );
}

export function cloneVoiceEffect(
  api: AgentBaseApiService,
  formData: FormData,
  signal?: AbortSignal,
): Effect.Effect<AgentClonedVoice, AgentApiError> {
  return api.fetchResourceEffect<AgentClonedVoice>(
    `${api.config.baseUrl}/voices/clone`,
    {
      body: formData,
      method: 'POST',
      signal,
    },
    'Failed to clone voice',
    'Failed to deserialize cloned voice',
  );
}

export function generateVoiceEffect(
  api: AgentBaseApiService,
  payload: {
    sourceActionId?: string;
    text: string;
    voiceId: string;
    waitForCompletion: false;
  },
  signal?: AbortSignal,
): Effect.Effect<AgentGeneratedAsset, AgentApiError> {
  return api.fetchResourceEffect<AgentGeneratedAsset>(
    `${api.config.baseUrl}/voices/generate`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to generate voice',
    'Failed to deserialize generated voice',
  );
}

export function getClonedVoicesEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentClonedVoice[], AgentApiError> {
  return api.fetchCollectionEffect<AgentClonedVoice>(
    `${api.config.baseUrl}/voices/cloned`,
    { signal },
    'Failed to fetch cloned voices',
    'Failed to deserialize cloned voices',
  );
}

export function setBrandVoiceDefaultsEffect(
  api: AgentBaseApiService,
  brandId: string,
  payload: {
    defaultVoiceId?: string;
    defaultAvatarPhotoUrl?: string;
    defaultAvatarIngredientId?: string;
  },
  signal?: AbortSignal,
): Effect.Effect<void, AgentApiError> {
  return api
    .fetchJsonEffect<JsonApiResponseDocument>(
      `${api.config.baseUrl}/brands/${brandId}/agent-config`,
      {
        body: JSON.stringify(payload),
        method: 'PATCH',
        signal,
      },
      'Failed to update brand voice defaults',
    )
    .pipe(Effect.as(undefined));
}

export function uploadAttachmentEffect(
  api: AgentBaseApiService,
  file: File,
  onProgress?: (pct: number) => void,
): Effect.Effect<{ ingredientId: string; url: string }, AgentApiError> {
  return Effect.gen(function* () {
    const presigned = yield* api.fetchJsonEffect<PresignedUploadResponse>(
      `${api.config.baseUrl}/images/upload/presigned`,
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

    yield* uploadFileToPresignedUrlEffect(api, file, uploadUrl, onProgress);
    yield* api.fetchJsonEffect(
      `${api.config.baseUrl}/images/upload/confirm/${id}`,
      { method: 'POST' },
      'Failed to confirm upload',
    );

    return { ingredientId: id, url: publicUrl };
  }) as Effect.Effect<{ ingredientId: string; url: string }, AgentApiError>;
}

function uploadFileToPresignedUrlEffect(
  _api: AgentBaseApiService,
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
