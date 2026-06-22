import { afterEach, describe, expect, it } from 'bun:test';
import type {
  IDesktopAsset,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
} from '@genfeedai/desktop-contracts';
import {
  __desktopGenerationServiceTestUtils,
  DesktopGenerationService,
  type DesktopGenerationStore,
  type GenerationSyncJobRow,
} from './generation.service';

const createDatabaseMock = () => {
  const kv = new Map<string, string>();
  const syncJobs = new Map<string, GenerationSyncJobRow>();

  return {
    deleteValue: async (key: string) => {
      kv.delete(key);
    },
    getSyncJob: async (jobId: string) => syncJobs.get(jobId) ?? null,
    getValue: async (key: string) => kv.get(key) ?? null,
    kv,
    listSyncJobs: async (type: string, workspaceId?: string) =>
      Array.from(syncJobs.values()).filter(
        (job) =>
          job.type === type &&
          (!workspaceId || job.workspaceId === workspaceId),
      ),
    syncJobs,
    setValue: async (key: string, value: string) => {
      kv.set(key, value);
    },
    upsertSyncJob: async (row: GenerationSyncJobRow) => {
      syncJobs.set(row.id, row);
    },
  };
};

const createAssetWriterMock = () => {
  const assets: IDesktopAsset[] = [];

  return {
    assets,
    writeGeneratedAsset: async (options: {
      bytes: Uint8Array;
      jobId: string;
      mimeType: string;
      model: string;
      provider: string;
      uploadPolicy?: IDesktopAsset['uploadPolicy'];
      workspaceId: string;
    }): Promise<IDesktopAsset> => {
      const asset: IDesktopAsset = {
        createdAt: '2026-05-17T00:00:00.000Z',
        displayName: `${options.provider} ${options.model}`,
        id: `asset-${String(assets.length + 1)}`,
        kind: 'image',
        localPath: `/tmp/${options.jobId}.png`,
        mimeType: options.mimeType,
        organizationId: 'local-org',
        origin: 'local-generation',
        originalFileName: `${options.jobId}.png`,
        residency: 'local-only',
        sha256: 'sha',
        sizeBytes: options.bytes.byteLength,
        updatedAt: '2026-05-17T00:00:00.000Z',
        uploadPolicy: options.uploadPolicy ?? 'never',
        workspaceId: options.workspaceId,
      };
      assets.push(asset);
      return asset;
    },
  };
};

const waitForJobStatus = async (
  service: DesktopGenerationService,
  jobId: string,
  expectedStatus: string,
) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await service.getGenerationJob(jobId);
    if (job?.status === expectedStatus) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${expectedStatus}`);
};

const generationParams: IDesktopGenerationOptions = {
  platform: 'twitter',
  prompt: 'Write a launch hook for local desktop generation.',
  publishIntent: 'review',
  type: 'hook',
};

const providerConfig: IDesktopGenerationProviderConfig = {
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.1',
  provider: 'ollama',
};

describe('DesktopGenerationService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('persists provider config without exposing the api key publicly', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    const publicConfig = await service.saveProviderConfig({
      ...providerConfig,
      apiKey: 'local-secret',
      baseUrl: 'http://localhost:11434/v1/',
    });

    expect(publicConfig).toEqual({
      apiKeyConfigured: true,
      baseUrl: 'http://localhost:11434/v1',
      displayName: 'Ollama',
      model: 'llama3.1',
      provider: 'ollama',
    });
    await expect(service.getPublicProviderConfig()).resolves.toEqual(
      publicConfig,
    );
  });

  it('runs generation through an OpenAI-compatible provider and records the local job', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    await service.saveProviderConfig(providerConfig);

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('http://localhost:11434/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string; role: string }>;
        model: string;
      };
      expect(body.model).toBe('llama3.1');
      expect(body.messages[1]?.content).toContain('Platform: twitter');

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Ship the local desktop generation loop.',
              },
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    await expect(service.generateContent(generationParams)).resolves.toBe(
      'Ship the local desktop generation loop.',
    );

    const jobs = Array.from(database.syncJobs.values());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('completed');
    expect(jobs[0]?.type).toBe('generation');
  });

  it('throws and records no job when generating offline without a provider configured', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    await expect(service.generateContent(generationParams)).rejects.toThrow(
      'Configure a local generation provider before generating content.',
    );

    // The provider guard short-circuits before any job is created or any
    // network call is attempted, so no orphaned sync job is left behind.
    expect(Array.from(database.syncJobs.values())).toHaveLength(0);
  });

  it('injects saved trend brief context into the local provider prompt', () => {
    const prompt = __desktopGenerationServiceTestUtils.buildUserPrompt({
      ...generationParams,
      brief: {
        angle: 'Launch teardown posts',
        channelFit: 'linkedin article adapted from a live trend signal.',
        evidence: ['Virality score: 86/100'],
        hypothesis: 'Turn the launch teardown trend into a founder lesson.',
      },
      platform: 'linkedin',
      sourceTrendTopic: 'Launch teardown posts',
      type: 'article',
    });

    expect(prompt).toContain('Platform: linkedin');
    expect(prompt).toContain('Brief angle: Launch teardown posts');
    expect(prompt).toContain('Evidence: Virality score: 86/100');
    expect(prompt).not.toContain('Source trend: Launch teardown posts');
  });

  it('marks the local generation job as failed when the provider fails', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    await service.saveProviderConfig(providerConfig);

    globalThis.fetch = (async () =>
      new Response('model missing', { status: 404 })) as typeof fetch;

    await expect(service.generateContent(generationParams)).rejects.toThrow(
      'Local provider request failed (404): model missing',
    );

    const jobs = Array.from(database.syncJobs.values());
    expect(jobs[0]?.status).toBe('failed');
    expect(jobs[0]?.error).toContain('model missing');
  });

  it('generates workflows through the same local provider', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    await service.saveProviderConfig(providerConfig);

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('http://localhost:11434/v1/chat/completions');
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string; role: string }>;
      };
      expect(body.messages[0]?.content).toContain('Available node types');

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  description: 'Local workflow',
                  edges: [],
                  name: 'Local Workflow',
                  nodes: [],
                }),
              },
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    await expect(
      service.generateWorkflow({ description: 'Make a local workflow' }),
    ).resolves.toEqual({
      tokensUsed: 0,
      workflow: {
        description: 'Local workflow',
        edges: [],
        name: 'Local Workflow',
        nodes: [],
      },
    });
  });

  it('runs generation through Replicate model predictions with a provider API key', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    await service.saveProviderConfig({
      apiKey: 'replicate-secret',
      baseUrl: 'https://api.replicate.com/v1',
      model: 'meta/llama-2-70b-chat',
      provider: 'replicate',
    });

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.replicate.com/v1/models/meta/llama-2-70b-chat/predictions',
      );
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer replicate-secret',
        Prefer: 'wait=60',
      });

      const body = JSON.parse(String(init?.body)) as {
        input: { prompt: string };
      };
      expect(body.input.prompt).toContain('Platform: twitter');

      return new Response(
        JSON.stringify({
          output: ['Replicate generated content.'],
          status: 'succeeded',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    await expect(service.generateContent(generationParams)).resolves.toBe(
      'Replicate generated content.',
    );
  });

  it('polls Replicate predictions until output is ready', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );
    const calls: string[] = [];

    await service.saveProviderConfig({
      apiKey: 'replicate-secret',
      baseUrl: 'https://api.replicate.com/v1',
      model: 'meta/slow-model',
      provider: 'replicate',
    });

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push(String(input));
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer replicate-secret',
      });

      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            id: 'prediction-1',
            status: 'processing',
            urls: {
              get: 'https://api.replicate.com/v1/predictions/prediction-1',
            },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          output: ['Replicate completed after polling.'],
          status: 'succeeded',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    await expect(service.generateContent(generationParams)).resolves.toBe(
      'Replicate completed after polling.',
    );
    expect(calls).toEqual([
      'https://api.replicate.com/v1/models/meta/slow-model/predictions',
      'https://api.replicate.com/v1/predictions/prediction-1',
    ]);
  });

  it('runs generation through the fal queue API with a provider API key', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );
    const calls: string[] = [];

    await service.saveProviderConfig({
      apiKey: 'fal-secret',
      baseUrl: 'https://queue.fal.run',
      model: 'fal-ai/any-llm',
      provider: 'fal',
    });

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push(String(input));
      expect(init?.headers).toMatchObject({
        Authorization: 'Key fal-secret',
      });

      if (calls.length === 1) {
        const body = JSON.parse(String(init?.body)) as { prompt: string };
        expect(body.prompt).toContain('Platform: twitter');
        return new Response(
          JSON.stringify({
            request_id: 'fal-request-1',
            status_url:
              'https://queue.fal.run/fal-ai/any-llm/requests/fal-request-1/status',
            response_url:
              'https://queue.fal.run/fal-ai/any-llm/requests/fal-request-1',
          }),
          { status: 200 },
        );
      }

      if (calls.length === 2) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          output: {
            text: 'fal generated content.',
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(service.generateContent(generationParams)).resolves.toBe(
      'fal generated content.',
    );
    expect(calls).toEqual([
      'https://queue.fal.run/fal-ai/any-llm',
      'https://queue.fal.run/fal-ai/any-llm/requests/fal-request-1/status',
      'https://queue.fal.run/fal-ai/any-llm/requests/fal-request-1',
    ]);
  });

  it('normalizes completion URLs for OpenAI-compatible providers', () => {
    expect(
      __desktopGenerationServiceTestUtils.buildCompletionUrl(
        'http://localhost:1234/v1',
      ),
    ).toBe('http://localhost:1234/v1/chat/completions');
    expect(
      __desktopGenerationServiceTestUtils.buildCompletionUrl(
        'http://localhost:1234/v1/chat/completions',
      ),
    ).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('extracts generated image URLs from provider payloads', () => {
    expect(
      __desktopGenerationServiceTestUtils.extractFirstImageUrl({
        output: [
          {
            url: 'https://cdn.example.com/generated.webp',
          },
        ],
      }),
    ).toBe('https://cdn.example.com/generated.webp');
    expect(
      __desktopGenerationServiceTestUtils.extractFirstImageUrl({
        images: [{ image_url: 'https://cdn.example.com/generated.png' }],
      }),
    ).toBe('https://cdn.example.com/generated.png');
  });

  it('rejects generated asset downloads with non-image MIME types', async () => {
    globalThis.fetch = (async () =>
      new Response('not an image', {
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })) as typeof fetch;

    await expect(
      __desktopGenerationServiceTestUtils.downloadGeneratedImage(
        'https://cdn.example.com/not-image.txt',
      ),
    ).rejects.toThrow('instead of an image');
  });

  it('generates a Replicate image asset through the queued desktop path', async () => {
    const database = createDatabaseMock();
    const assetWriter = createAssetWriterMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
      assetWriter,
    );
    const calls: string[] = [];

    await service.saveProviderConfig({
      apiKey: 'replicate-secret',
      baseUrl: 'https://api.replicate.com/v1',
      model: 'black-forest-labs/flux-schnell',
      provider: 'replicate',
    });

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls.push(String(input));

      if (calls.length === 1) {
        const body = JSON.parse(String(init?.body)) as {
          input: { prompt: string };
        };
        expect(body.input.prompt).toBe('local image prompt');
        return new Response(
          JSON.stringify({
            output: ['https://cdn.example.com/image.png'],
            status: 'succeeded',
          }),
          { status: 200 },
        );
      }

      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
        status: 200,
      });
    }) as typeof fetch;

    const job = await service.enqueueAssetGeneration({
      model: 'black-forest-labs/flux-schnell',
      prompt: 'local image prompt',
      provider: 'replicate',
      workspaceId: 'ws-1',
    });

    await expect(
      waitForJobStatus(service, job.id, 'succeeded'),
    ).resolves.toMatchObject({
      assetIds: ['asset-1'],
      provider: 'replicate',
      status: 'succeeded',
    });
    expect(assetWriter.assets[0]).toMatchObject({
      origin: 'local-generation',
      residency: 'local-only',
      uploadPolicy: 'never',
    });
  });

  it('generates a fal image asset through the queued desktop path', async () => {
    const database = createDatabaseMock();
    const assetWriter = createAssetWriterMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
      assetWriter,
    );
    const calls: string[] = [];

    await service.saveProviderConfig({
      apiKey: 'fal-secret',
      baseUrl: 'https://queue.fal.run',
      model: 'fal-ai/flux/schnell',
      provider: 'fal',
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));

      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            images: [{ url: 'https://cdn.example.com/fal.png' }],
          }),
          { status: 200 },
        );
      }

      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
        status: 200,
      });
    }) as typeof fetch;

    const job = await service.enqueueAssetGeneration({
      model: 'fal-ai/flux/schnell',
      prompt: 'local fal prompt',
      provider: 'fal',
      workspaceId: 'ws-1',
    });

    await expect(
      waitForJobStatus(service, job.id, 'succeeded'),
    ).resolves.toMatchObject({
      assetIds: ['asset-1'],
      provider: 'fal',
      status: 'succeeded',
    });
  });

  it('requeues running asset jobs on desktop restart', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopGenerationStore,
    );

    database.syncJobs.set('job-running', {
      createdAt: '2026-05-17T00:00:00.000Z',
      error: null,
      id: 'job-running',
      payload: JSON.stringify({
        assetIds: [],
        kind: 'asset-generation',
        request: {
          model: 'black-forest-labs/flux-schnell',
          prompt: 'resume prompt',
          provider: 'replicate',
          workspaceId: 'ws-1',
        },
      }),
      retryCount: 0,
      status: 'running',
      type: 'asset-generation',
      updatedAt: '2026-05-17T00:00:00.000Z',
      workspaceId: 'ws-1',
    });

    await service.resumeAssetGenerationJobs();

    expect(database.syncJobs.get('job-running')).toMatchObject({
      error: 'Desktop restarted before this asset generation finished.',
      status: 'queued',
    });
  });
});
