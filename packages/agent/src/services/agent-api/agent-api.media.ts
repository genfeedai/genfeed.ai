import type {
  AgentClonedVoice,
  AgentGeneratedAsset,
  GenerateIngredientResult,
  GenerationModel,
  PresignedUploadResponse,
} from '@genfeedai/agent/services/agent-api.types';
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';

export async function getModels(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<GenerationModel[]> {
  // List endpoints are always paginated server-side (HTTP does not accept a
  // `pagination` flag) — the active model catalog fits in one max-size page.
  return api.fetchCollection<GenerationModel>(
    `${api.config.baseUrl}/models?isActive=true&limit=${MAX_PAGE_SIZE}`,
    { signal },
    'Failed to fetch models',
    'Failed to deserialize models',
  );
}

export async function getGeneratedAsset(
  api: AgentBaseApiService,
  id: string,
  signal?: AbortSignal,
): Promise<AgentGeneratedAsset> {
  const assets = await api.fetchCollection<AgentGeneratedAsset>(
    `${api.config.baseUrl}/ingredients/batch?ids=${encodeURIComponent(id)}`,
    { signal },
    'Failed to reconcile generated asset',
    'Failed to deserialize generated asset',
  );

  const asset = assets[0];
  if (!asset) {
    throw new AgentApiRequestError({
      detail: `Generated asset ${id} was not found`,
      message: 'Generated asset was not found',
      status: 404,
    });
  }

  return { ...asset, url: asset.url ?? asset.cdnUrl };
}

export async function mergeVideos(
  api: AgentBaseApiService,
  ids: string[],
  options?: {
    isMuteVideoAudio?: boolean;
    isResizeEnabled?: boolean;
    transition?: string;
    transitionDuration?: number;
  },
  signal?: AbortSignal,
): Promise<{ id: string; status: string }> {
  return api.fetchJson<{ id: string; status: string }>(
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

export async function reframeVideo(
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
): Promise<{ id: string; status: string }> {
  return api.fetchJson<{ id: string; status: string }>(
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

export async function resizeVideo(
  api: AgentBaseApiService,
  videoId: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<{ id: string; status: string }> {
  return api.fetchJson<{ id: string; status: string }>(
    `${api.config.baseUrl}/videos/${videoId}/resize`,
    {
      body: JSON.stringify({ height, width }),
      method: 'POST',
      signal,
    },
    'Failed to resize video',
  );
}

export async function createPrompt(
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
): Promise<{ id: string }> {
  const res = await api.fetchJson<{
    data: { id: string };
  }>(
    `${api.config.baseUrl}/prompts`,
    {
      body: JSON.stringify(body),
      method: 'POST',
      signal,
    },
    'Failed to create prompt',
  );

  return { id: res.data.id };
}

export async function generateIngredient(
  api: AgentBaseApiService,
  type: 'image' | 'video',
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<GenerateIngredientResult> {
  const endpoint = type === 'video' ? '/videos' : '/images';
  const asset = await api.fetchResource<AgentGeneratedAsset>(
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
    'Failed to deserialize generated asset',
  );

  return { id: asset.id, url: asset.url ?? asset.cdnUrl };
}

export async function cloneVoice(
  api: AgentBaseApiService,
  formData: FormData,
  signal?: AbortSignal,
): Promise<AgentClonedVoice> {
  return api.fetchResource<AgentClonedVoice>(
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

export async function generateVoice(
  api: AgentBaseApiService,
  payload: {
    sourceActionId?: string;
    text: string;
    voiceId: string;
    waitForCompletion: false;
  },
  signal?: AbortSignal,
): Promise<AgentGeneratedAsset> {
  return api.fetchResource<AgentGeneratedAsset>(
    `${api.config.baseUrl}/voices/generate`,
    { body: JSON.stringify(payload), method: 'POST', signal },
    'Failed to generate voice',
    'Failed to deserialize generated voice',
  );
}

export async function getClonedVoices(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Promise<AgentClonedVoice[]> {
  return api.fetchCollection<AgentClonedVoice>(
    `${api.config.baseUrl}/voices/cloned`,
    { signal },
    'Failed to fetch cloned voices',
    'Failed to deserialize cloned voices',
  );
}

export async function setBrandVoiceDefaults(
  api: AgentBaseApiService,
  brandId: string,
  payload: {
    defaultVoiceId?: string;
    defaultAvatarPhotoUrl?: string;
    defaultAvatarIngredientId?: string;
  },
  signal?: AbortSignal,
): Promise<void> {
  await api.fetchJson<JsonApiResponseDocument>(
    `${api.config.baseUrl}/brands/${brandId}/agent-config`,
    {
      body: JSON.stringify(payload),
      method: 'PATCH',
      signal,
    },
    'Failed to update brand voice defaults',
  );
}

export async function uploadAttachment(
  api: AgentBaseApiService,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ingredientId: string; url: string }> {
  const presigned = await api.fetchJson<PresignedUploadResponse>(
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

  await uploadFileToPresignedUrl(api, file, uploadUrl, onProgress);
  await api.fetchJson(
    `${api.config.baseUrl}/images/upload/confirm/${id}`,
    { method: 'POST' },
    'Failed to confirm upload',
  );

  return { ingredientId: id, url: publicUrl };
}

async function uploadFileToPresignedUrl(
  _api: AgentBaseApiService,
  file: File,
  uploadUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
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
    });
  } catch (cause) {
    throw new AgentApiRequestError({
      detail: cause instanceof Error ? cause.message : undefined,
      message: cause instanceof Error ? cause.message : 'S3 upload failed',
      status: 0,
    });
  }
}
