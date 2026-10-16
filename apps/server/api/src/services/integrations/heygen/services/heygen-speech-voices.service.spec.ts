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
    );
  });

  it('lists nothing and never calls HeyGen on the platform key', async () => {
    await expect(speechService.getSpeechVoices('org-1')).resolves.toEqual({
      hasPersonalConnection: false,
      voices: [],
    });
    expect(httpServiceMock.get).not.toHaveBeenCalled();
  });

  it('lists only the active clones of the workspace key', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'workspace-key',
      credentialId: 'cred-1',
    });
    httpServiceMock.get.mockReturnValueOnce(
      voicePage([voice('clone-1'), voice('clone-2', 'FAILED')]),
    );

    await expect(speechService.getSpeechVoices('org-1')).resolves.toEqual({
      hasPersonalConnection: true,
      voices: [
        {
          language: 'en',
          mode: 'instant',
          name: 'Voice clone-1',
          ownership: 'private',
          voiceId: 'clone-1',
        },
      ],
    });
    expect(httpServiceMock.get).toHaveBeenCalledTimes(1);
    expect(httpServiceMock.get.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'X-Api-Key': 'workspace-key' },
    });
    expect(httpServiceMock.get.mock.calls[0]?.[1].params).not.toHaveProperty(
      'type',
    );
  });

  it('surfaces a listing failure instead of an empty catalog', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'workspace-key',
      credentialId: 'cred-1',
    });
    httpServiceMock.get.mockReturnValueOnce(
      throwError(() => new Error('heygen down')),
    );

    await expect(speechService.getSpeechVoices('org-1')).rejects.toThrow(
      'heygen down',
    );
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

  it("refuses every voice on the platform key, including Genfeed's private clones", async () => {
    for (const voiceId of ['genfeed-private-clone', 'any-other-voice'])
      await expect(
        speechService.resolveSpeechConnection('org-1', voiceId),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(httpServiceMock.get).not.toHaveBeenCalled();
  });
});
