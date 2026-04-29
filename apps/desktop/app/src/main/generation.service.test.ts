import { afterEach, describe, expect, it } from 'bun:test';
import type {
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
} from '@genfeedai/desktop-contracts';
import type { DesktopDatabaseService, SyncJobRow } from './database.service';
import {
  __desktopGenerationServiceTestUtils,
  DesktopGenerationService,
} from './generation.service';

const createDatabaseMock = () => {
  const kv = new Map<string, string>();
  const syncJobs = new Map<string, SyncJobRow>();

  return {
    deleteValue: async (key: string) => {
      kv.delete(key);
    },
    getValue: async (key: string) => kv.get(key) ?? null,
    kv,
    syncJobs,
    setValue: async (key: string, value: string) => {
      kv.set(key, value);
    },
    upsertSyncJob: async (row: SyncJobRow) => {
      syncJobs.set(row.id, row);
    },
  };
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
      database as unknown as DesktopDatabaseService,
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
      database as unknown as DesktopDatabaseService,
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

  it('marks the local generation job as failed when the provider fails', async () => {
    const database = createDatabaseMock();
    const service = new DesktopGenerationService(
      database as unknown as DesktopDatabaseService,
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
});
