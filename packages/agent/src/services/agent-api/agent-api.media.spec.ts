import {
  mockError,
  mockFetch,
  mockJsonApiCollection,
  mockJsonApiResource,
  mockOk,
} from '@agent-tests/json-api-fetch.mock';
import {
  cloneVoice,
  createPrompt,
  generateIngredient,
  getClonedVoices,
  getGeneratedAsset,
  getModels,
  mergeVideos,
  reframeVideo,
  resizeVideo,
  setBrandVoiceDefaults,
  uploadAttachment,
} from '@genfeedai/agent/services/agent-api/agent-api.media';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeApi(): AgentBaseApiService {
  return new AgentBaseApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('test-token'),
  });
}

function lastRequest(): { body?: string; url: string } {
  const call = mockFetch.mock.calls.at(-1);
  return { body: call?.[1]?.body as string | undefined, url: call?.[0] };
}

describe('agent-api.media', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getModels fetches the active model catalog', async () => {
    mockJsonApiCollection([{ id: 'model-1', name: 'Test Model' }], 'model');

    const result = await getModels(makeApi());

    expect(result).toEqual([
      expect.objectContaining({ id: 'model-1', name: 'Test Model' }),
    ]);
    expect(lastRequest().url).toContain(
      'http://api.test/models?isActive=true&limit=',
    );
  });

  it('mergeVideos posts merge defaults', async () => {
    mockOk({ id: 'video-1', status: 'processing' });

    const result = await mergeVideos(makeApi(), ['a', 'b']);

    expect(result).toEqual({ id: 'video-1', status: 'processing' });
    const { body, url } = lastRequest();
    expect(url).toBe('http://api.test/videos/merge');
    expect(JSON.parse(body ?? '{}')).toMatchObject({
      category: 'video',
      ids: ['a', 'b'],
      isMuteVideoAudio: true,
      isResizeEnabled: false,
      transition: 'none',
      transitionDuration: 0.5,
    });
  });

  it('mergeVideos honors explicit options', async () => {
    mockOk({ id: 'video-1', status: 'processing' });

    await mergeVideos(makeApi(), ['a'], {
      isMuteVideoAudio: false,
      isResizeEnabled: true,
      transition: 'fade',
      transitionDuration: 1,
    });

    expect(JSON.parse(lastRequest().body ?? '{}')).toMatchObject({
      isMuteVideoAudio: false,
      isResizeEnabled: true,
      transition: 'fade',
      transitionDuration: 1,
    });
  });

  it('reframeVideo defaults to portrait and maps prompt to text', async () => {
    mockOk({ id: 'video-1', status: 'processing' });

    await reframeVideo(makeApi(), 'video-1', { prompt: 'focus on face' });

    const { body, url } = lastRequest();
    expect(url).toBe('http://api.test/videos/video-1/reframe');
    expect(JSON.parse(body ?? '{}')).toMatchObject({
      format: 'portrait',
      text: 'focus on face',
    });
  });

  it('resizeVideo posts width and height', async () => {
    mockOk({ id: 'video-1', status: 'processing' });

    await resizeVideo(makeApi(), 'video-1', 720, 1280);

    const { body, url } = lastRequest();
    expect(url).toBe('http://api.test/videos/video-1/resize');
    expect(JSON.parse(body ?? '{}')).toEqual({ height: 1280, width: 720 });
  });

  it('createPrompt unwraps the created prompt id', async () => {
    mockOk({ data: { id: 'prompt-1' } });

    const result = await createPrompt(makeApi(), {
      category: 'image',
      original: 'A red fox',
    });

    expect(result).toEqual({ id: 'prompt-1' });
    expect(lastRequest().url).toBe('http://api.test/prompts');
  });

  it('generateIngredient targets images or videos by type', async () => {
    mockOk({ id: 'ing-1', status: 'completed' });
    await generateIngredient(makeApi(), 'image', { prompt: 'sunset' });
    expect(lastRequest().url).toBe('http://api.test/images');
    expect(JSON.parse(lastRequest().body ?? '{}')).toMatchObject({
      prompt: 'sunset',
      waitForCompletion: true,
    });

    mockOk({ id: 'ing-2', status: 'completed' });
    await generateIngredient(makeApi(), 'video', { prompt: 'waves' });
    expect(lastRequest().url).toBe('http://api.test/videos');
  });

  it('maps the canonical persisted CDN field to a renderable reconciliation URL', async () => {
    mockJsonApiCollection(
      [
        {
          cdnUrl: 'https://cdn.genfeed.ai/images/generated.png',
          id: 'ing-1',
          status: 'GENERATED',
        },
      ],
      'ingredient',
    );

    const result = await getGeneratedAsset(makeApi(), 'ing-1');

    expect(result).toMatchObject({
      id: 'ing-1',
      status: 'GENERATED',
      url: 'https://cdn.genfeed.ai/images/generated.png',
    });
  });

  it('cloneVoice posts the form data to the clone endpoint', async () => {
    mockJsonApiResource({ id: 'voice-1', name: 'My Voice' }, 'voice');
    const formData = new FormData();
    formData.append('name', 'My Voice');

    const result = await cloneVoice(makeApi(), formData);

    expect(result).toEqual(
      expect.objectContaining({ id: 'voice-1', name: 'My Voice' }),
    );
    expect(lastRequest().url).toBe('http://api.test/voices/clone');
  });

  it('getClonedVoices fetches the cloned voice collection', async () => {
    mockJsonApiCollection([{ id: 'voice-1', name: 'My Voice' }], 'voice');

    const result = await getClonedVoices(makeApi());

    expect(result).toHaveLength(1);
    expect(lastRequest().url).toBe('http://api.test/voices/cloned');
  });

  it('setBrandVoiceDefaults patches the brand agent config', async () => {
    mockOk({ data: null });

    const result = await setBrandVoiceDefaults(makeApi(), 'brand-1', {
      defaultVoiceId: 'voice-1',
    });

    expect(result).toBeUndefined();
    const { body, url } = lastRequest();
    expect(url).toBe('http://api.test/brands/brand-1/agent-config');
    expect(JSON.parse(body ?? '{}')).toEqual({ defaultVoiceId: 'voice-1' });
  });

  it('surfaces request errors from the API', async () => {
    mockError(500);

    await expect(resizeVideo(makeApi(), 'video-1', 10, 10)).rejects.toThrow(
      'Failed to resize video',
    );
  });
});

interface FakeXhrListeners {
  error: Array<() => void>;
  load: Array<() => void>;
}

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  static nextStatus = 200;
  listeners: FakeXhrListeners = { error: [], load: [] };
  progressListeners: Array<(event: ProgressEvent) => void> = [];
  sentBody: unknown = null;
  status = 0;
  upload = {
    addEventListener: (
      _event: string,
      listener: (event: ProgressEvent) => void,
    ) => {
      this.progressListeners.push(listener);
    },
  };
  url = '';

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  addEventListener(event: 'error' | 'load', listener: () => void): void {
    this.listeners[event].push(listener);
  }

  open(_method: string, url: string): void {
    this.url = url;
  }

  send(body: unknown): void {
    this.sentBody = body;
    this.status = FakeXMLHttpRequest.nextStatus;
    for (const listener of this.progressListeners) {
      listener({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
    }
    for (const listener of this.listeners.load) {
      listener();
    }
  }

  setRequestHeader(): void {
    // headers are irrelevant for the fake
  }
}

describe('uploadAttachment', () => {
  const realXhr = global.XMLHttpRequest;

  beforeEach(() => {
    mockFetch.mockReset();
    FakeXMLHttpRequest.instances = [];
    FakeXMLHttpRequest.nextStatus = 200;
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    global.XMLHttpRequest = realXhr;
  });

  it('runs presign, S3 upload with progress, and confirm', async () => {
    mockOk({
      data: {
        attributes: {
          publicUrl: 'https://cdn.test/image.png',
          uploadUrl: 'https://s3.test/upload',
        },
        id: 'ing-1',
      },
    });
    mockOk({ ok: true });
    const onProgress = vi.fn();
    const file = new File(['binary'], 'image.png', { type: 'image/png' });

    const result = await uploadAttachment(makeApi(), file, onProgress);

    expect(result).toEqual({
      ingredientId: 'ing-1',
      url: 'https://cdn.test/image.png',
    });
    expect(FakeXMLHttpRequest.instances[0]?.url).toBe('https://s3.test/upload');
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/images/upload/confirm/ing-1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails with a typed error when the S3 upload rejects', async () => {
    FakeXMLHttpRequest.nextStatus = 403;
    mockOk({
      data: {
        attributes: {
          publicUrl: 'https://cdn.test/image.png',
          uploadUrl: 'https://s3.test/upload',
        },
        id: 'ing-1',
      },
    });
    const file = new File(['binary'], 'image.png', { type: 'image/png' });

    await expect(uploadAttachment(makeApi(), file)).rejects.toThrow(
      'S3 upload failed: 403',
    );
  });
});
