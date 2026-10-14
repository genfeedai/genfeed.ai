import { RouterPriority, VoiceProvider } from '@genfeedai/contracts';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VoicesService', () => {
  let service: VoicesService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VoicesService('voices-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = VoicesService.getInstance('tok');
    expect(VoicesService.getInstance('tok')).toBe(first);
    expect(VoicesService.getInstance('tok-2')).not.toBe(first);
  });

  describe('findCatalog', () => {
    it('passes only the provided filters', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'voice_1', name: 'Ava' }])),
      );

      const result = await service.findCatalog({ search: 'ava' });

      expect(http.get).toHaveBeenCalledWith('/catalog', {
        params: { search: 'ava' },
      });
      expect(result).toEqual([{ id: 'voice_1', name: 'Ava' }]);
    });

    it('defaults to no filters', async () => {
      http.get.mockResolvedValue(axiosResponse(collectionDocument([])));

      await service.findCatalog();

      expect(http.get).toHaveBeenCalledWith('/catalog', { params: {} });
    });
  });

  describe('generate', () => {
    it('sends the voice provider with an explicit speech model', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'speech' }, { id: 'voice_1' })),
      );

      await service.generate({
        autoSelectModel: true,
        model: 'heygen/heygen-voice-1',
        speed: 1,
        text: 'Hello',
        voiceId: 'clone-1',
        voiceProvider: VoiceProvider.HEYGEN,
      });

      const [url, body] = http.post.mock.calls[0];
      expect(url).toBe('/generate');
      expect(body).toEqual({
        model: 'heygen/heygen-voice-1',
        speed: 1,
        text: 'Hello',
        voiceId: 'clone-1',
        voiceProvider: 'HEYGEN',
        waitForCompletion: true,
      });
    });

    it('asks the server to route when Auto is chosen', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'speech' }, { id: 'voice_1' })),
      );

      await service.generate({
        autoSelectModel: true,
        prioritize: RouterPriority.QUALITY,
        speed: 1,
        text: 'Hello',
        voiceId: 'voice-1',
        voiceProvider: VoiceProvider.ELEVENLABS,
      });

      const [, body] = http.post.mock.calls[0];
      expect(body).toMatchObject({
        autoSelectModel: true,
        prioritize: RouterPriority.QUALITY,
        voiceId: 'voice-1',
        voiceProvider: 'ELEVENLABS',
      });
      expect(body).not.toHaveProperty('model');
    });
  });

  describe('importCatalogVoices', () => {
    it('POSTs the provider list and unwraps the result', async () => {
      const sync = { created: 2, total: 5, updated: 3 };
      http.post.mockResolvedValue(axiosResponse({ data: sync }));

      const result = await service.importCatalogVoices([
        'elevenlabs',
      ] as Parameters<VoicesService['importCatalogVoices']>[0]);

      expect(http.post).toHaveBeenCalledWith('/import', {
        providers: ['elevenlabs'],
      });
      expect(result).toEqual(sync);
    });

    it('POSTs an empty body without providers', async () => {
      http.post.mockResolvedValue(
        axiosResponse({ data: { created: 0, total: 0, updated: 0 } }),
      );

      await service.importCatalogVoices();

      expect(http.post).toHaveBeenCalledWith('/import', {});
    });
  });

  it('patchCatalogVoice PATCHes catalog flags', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ isFeatured: true }, { id: 'voice_1' })),
    );

    const result = await service.patchCatalogVoice('voice_1', {
      isFeatured: true,
    });

    expect(http.patch).toHaveBeenCalledWith('/catalog/voice_1', {
      isFeatured: true,
    });
    expect(result).toMatchObject({ isFeatured: true });
  });

  it('wraps failures in a structured error', async () => {
    http.get.mockRejectedValue({
      response: { data: { message: 'boom' }, status: 500 },
    });

    await expect(service.findCatalog()).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('VoiceCloneService', () => {
  let service: VoiceCloneService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VoiceCloneService('clone-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = VoiceCloneService.getInstance('tok');
    expect(VoiceCloneService.getInstance('tok')).toBe(first);
  });

  it('cloneVoice POSTs multipart form data', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Clone' }, { id: 'voice_c' })),
    );
    const formData = new FormData();

    const result = await service.cloneVoice(formData);

    expect(http.post).toHaveBeenCalledWith('/clone', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    expect(result.id).toBe('voice_c');
  });

  it('getClonedVoices GETs the cloned collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'voice_1', label: 'V' }])),
    );

    const result = await service.getClonedVoices();

    expect(http.get).toHaveBeenCalledWith('/cloned');
    expect(result).toHaveLength(1);
  });

  it('deleteClonedVoice DELETEs the clone', async () => {
    http.delete.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'V' }, { id: 'voice_1' })),
    );

    const result = await service.deleteClonedVoice('voice_1');

    expect(http.delete).toHaveBeenCalledWith('/clone/voice_1');
    expect(result.id).toBe('voice_1');
  });
});
