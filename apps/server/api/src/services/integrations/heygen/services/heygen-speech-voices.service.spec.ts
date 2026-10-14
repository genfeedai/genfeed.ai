import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenSpeechVoicesService } from '@api/services/integrations/heygen/services/heygen-speech-voices.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('HeyGenSpeechVoicesService', () => {
  const httpServiceMock = { get: vi.fn() };
  const apiKeyHelperMock = {
    getApiKey: vi.fn().mockReturnValue('test-api-key'),
  };
  const byok = {
    lookupApiKeyWithIdentity: vi.fn(),
    resolveApiKey: vi.fn(),
  };
  let speechService: HeyGenSpeechVoicesService;

  function voicePage(voices: Record<string, unknown>[]) {
    return of({
      data: { data: voices, has_more: false, next_token: null },
      status: 200,
    });
  }

  function voice(id: string, status = 'ACTIVE') {
    return {
      created_at: 1_760_000_000,
      language: 'en',
      mode: 'instant',
      name: `Voice ${id}`,
      status,
      voice_id: id,
    };
  }

  function requestedTypes(): unknown[] {
    return httpServiceMock.get.mock.calls.map(
      ([url, config]) => `${url}?type=${config.params.type}`,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyHelperMock.getApiKey.mockReturnValue('test-api-key');
    httpServiceMock.get.mockReturnValue(voicePage([]));
    byok.lookupApiKeyWithIdentity.mockResolvedValue(null);
    const heygen = new HeyGenService(
      { error: vi.fn(), log: vi.fn() } as unknown as LoggerService,
      httpServiceMock as unknown as HttpService,
      apiKeyHelperMock as unknown as ApiKeyHelperService,
      {} as PollUntilService,
      byok as unknown as ByokService,
    );
    speechService = new HeyGenSpeechVoicesService(
      heygen,
      byok as unknown as ByokService,
      apiKeyHelperMock as unknown as ApiKeyHelperService,
    );
  });

  it('lists only public voices on the platform key, never its private clones', async () => {
    httpServiceMock.get.mockReturnValueOnce(
      voicePage([voice('public-1'), voice('public-2', 'PENDING')]),
    );

    await expect(speechService.getSpeechVoices('org-1')).resolves.toEqual({
      hasPersonalConnection: false,
      voices: [
        {
          language: 'en',
          mode: 'instant',
          name: 'Voice public-1',
          ownership: 'public',
          voiceId: 'public-1',
        },
      ],
    });
    expect(requestedTypes()).toEqual([
      'https://api.heygen.com/v3/models/audio/voices?type=public',
    ]);
    expect(httpServiceMock.get.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'X-Api-Key': 'test-api-key' },
    });
  });

  it('lists the workspace clones and public voices with the workspace key', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'workspace-key',
      credentialId: 'cred-1',
    });
    httpServiceMock.get
      .mockReturnValueOnce(
        voicePage([voice('clone-1'), voice('clone-2', 'FAILED')]),
      )
      .mockReturnValueOnce(voicePage([voice('public-1')]));

    const catalog = await speechService.getSpeechVoices('org-1');

    expect(catalog.hasPersonalConnection).toBe(true);
    expect(
      catalog.voices.map(({ ownership, voiceId }) => [ownership, voiceId]),
    ).toEqual([
      ['private', 'clone-1'],
      ['public', 'public-1'],
    ]);
    for (const [, config] of httpServiceMock.get.mock.calls)
      expect(config).toMatchObject({
        headers: { 'X-Api-Key': 'workspace-key' },
      });
  });

  it('keeps the public voices when the private listing fails', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'workspace-key',
      credentialId: 'cred-1',
    });
    httpServiceMock.get
      .mockReturnValueOnce(throwError(() => new Error('private down')))
      .mockReturnValueOnce(voicePage([voice('public-1')]));

    const catalog = await speechService.getSpeechVoices('org-1');

    expect(catalog.voices.map((entry) => entry.voiceId)).toEqual(['public-1']);
  });

  it('returns an empty catalog when no HeyGen key exists at all', async () => {
    apiKeyHelperMock.getApiKey.mockReturnValueOnce('');

    await expect(speechService.getSpeechVoices('org-1')).resolves.toEqual({
      hasPersonalConnection: false,
      voices: [],
    });
    expect(httpServiceMock.get).not.toHaveBeenCalled();
  });

  it('speaks a workspace clone on the workspace key without a pre-check', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'workspace-key',
      credentialId: 'cred-1',
    });

    const connection = await speechService.resolveSpeechConnection(
      'org-1',
      'clone-1',
    );

    expect(connection).toMatchObject({
      apiKey: 'workspace-key',
      binding: { kind: 'byok' },
    });
    expect(httpServiceMock.get).not.toHaveBeenCalled();
  });

  it('accepts an active public voice on the platform key', async () => {
    httpServiceMock.get.mockReturnValueOnce(voicePage([voice('public-1')]));

    await expect(
      speechService.resolveSpeechConnection('org-1', 'public-1'),
    ).resolves.toMatchObject({
      apiKey: 'test-api-key',
      binding: { kind: 'platform' },
    });
  });

  it("refuses the platform key's private clones and inactive voices", async () => {
    httpServiceMock.get.mockReturnValue(
      voicePage([voice('public-pending', 'PENDING')]),
    );

    for (const voiceId of ['genfeed-private-clone', 'public-pending'])
      await expect(
        speechService.resolveSpeechConnection('org-1', voiceId),
      ).rejects.toBeInstanceOf(BadRequestException);
  });
});
