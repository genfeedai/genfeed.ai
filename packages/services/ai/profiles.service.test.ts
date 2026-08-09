import {
  collectionDocument,
  fetchResponse,
  installMockFetch,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ProfilesService } from '@services/ai/profiles.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('ProfilesService', () => {
  const token = 'profiles-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  function lastCall(): [string, RequestInit] {
    return fetchMock.mock.calls[0] as [string, RequestInit];
  }

  beforeEach(() => {
    ProfilesService.clearInstance(token);
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = ProfilesService.getInstance(token);
    expect(ProfilesService.getInstance(token)).toBe(first);
    ProfilesService.clearInstance(token);
    expect(ProfilesService.getInstance(token)).not.toBe(first);
  });

  it('getToneProfiles GETs and deserializes the collection', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(collectionDocument([{ id: 'tone_1', name: 'Bold' }])),
    );

    const service = ProfilesService.getInstance(token);
    const result = await service.getToneProfiles();

    const [url, init] = lastCall();
    expect(url).toContain('/profiles');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
    expect(result).toEqual([{ id: 'tone_1', name: 'Bold' }]);
  });

  it('getToneProfile GETs and deserializes a resource', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ name: 'Bold' }, { id: 'tone_1' })),
    );

    const service = ProfilesService.getInstance(token);
    const result = await service.getToneProfile('tone_1');

    const [url] = lastCall();
    expect(url).toContain('/profiles/tone_1');
    expect(result).toEqual({ id: 'tone_1', name: 'Bold' });
  });

  describe('getDefaultToneProfile', () => {
    it('returns the first default profile', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(collectionDocument([{ id: 'tone_d', isDefault: true }])),
      );

      const service = ProfilesService.getInstance(token);
      const result = await service.getDefaultToneProfile();

      const [url] = lastCall();
      expect(url).toContain('/profiles?isDefault=true');
      expect(result).toMatchObject({ id: 'tone_d' });
    });

    it('returns null when no default exists', async () => {
      fetchMock.mockResolvedValue(fetchResponse(collectionDocument([])));

      const service = ProfilesService.getInstance(token);
      await expect(service.getDefaultToneProfile()).resolves.toBeNull();
    });
  });

  it('createToneProfile POSTs the profile data', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ name: 'Calm' }, { id: 'tone_new' })),
    );

    const service = ProfilesService.getInstance(token);
    const result = await service.createToneProfile({ name: 'Calm' });

    const [url, init] = lastCall();
    expect(url).toContain('/profiles');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Calm' });
    expect(result).toEqual({ id: 'tone_new', name: 'Calm' });
  });

  it('updateToneProfile PATCHes the updates', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ name: 'Edited' }, { id: 'tone_1' })),
    );

    const service = ProfilesService.getInstance(token);
    await service.updateToneProfile('tone_1', { name: 'Edited' });

    const [url, init] = lastCall();
    expect(url).toContain('/profiles/tone_1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Edited' });
  });

  it('deleteToneProfile DELETEs the profile', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}));

    const service = ProfilesService.getInstance(token);
    await service.deleteToneProfile('tone_1');

    const [url, init] = lastCall();
    expect(url).toContain('/profiles/tone_1');
    expect(init.method).toBe('DELETE');
  });

  it('setAsDefault POSTs to the set-default action', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ id: 'tone_1' }));

    const service = ProfilesService.getInstance(token);
    await service.setAsDefault('tone_1');

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/tone_1/set-default');
    expect(init.method).toBe('POST');
  });

  it('applyTone POSTs the request payload', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({ estimatedConsistency: 0.9, prompt: 'toned' }),
    );

    const service = ProfilesService.getInstance(token);
    const result = await service.applyTone({
      contentType: 'article',
      prompt: 'raw',
    });

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/apply');
    expect(JSON.parse(init.body as string)).toEqual({
      contentType: 'article',
      prompt: 'raw',
    });
    expect(result).toMatchObject({ estimatedConsistency: 0.9 });
  });

  it('analyzeTone POSTs content with optional profile id', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ score: 82 }));

    const service = ProfilesService.getInstance(token);
    const result = await service.analyzeTone('text', 'video', 'tone_1');

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/analyze');
    expect(JSON.parse(init.body as string)).toEqual({
      content: 'text',
      contentType: 'video',
      toneProfileId: 'tone_1',
    });
    expect(result).toEqual({ score: 82 });
  });

  it('generateFromExamples POSTs examples with name and description', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ id: 'tone_gen' }));

    const service = ProfilesService.getInstance(token);
    await service.generateFromExamples(
      [{ content: 'sample', contentType: 'article' }],
      'From examples',
      'desc',
    );

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/generate-from-examples');
    expect(JSON.parse(init.body as string)).toEqual({
      description: 'desc',
      examples: [{ content: 'sample', contentType: 'article' }],
      name: 'From examples',
    });
  });

  it('importFromURL POSTs the source url', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ id: 'tone_imp' }));

    const service = ProfilesService.getInstance(token);
    await service.importFromURL('https://x.com/acme', 'twitter', 'Acme');

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/import-from-url');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Acme',
      platform: 'twitter',
      url: 'https://x.com/acme',
    });
  });

  it('duplicateToneProfile POSTs the new name', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ id: 'tone_dup' }));

    const service = ProfilesService.getInstance(token);
    await service.duplicateToneProfile('tone_1', 'Copy');

    const [url, init] = lastCall();
    expect(url).toContain('/tone-profiles/tone_1/duplicate');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Copy' });
  });

  it('throws the endpoint error on a failed response', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

    const service = ProfilesService.getInstance(token);
    await expect(service.getToneProfiles()).rejects.toThrow(
      'Failed to get tone profiles',
    );
  });
});
