import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { isAxiosError } from 'axios';
import { of, throwError } from 'rxjs';

// Contracts verified against developers.heygen.com/reference on 2026-10-07.
describe('HeyGen v3 contracts', () => {
  let service: HeyGenService;
  const http = { get: vi.fn(), post: vi.fn() };
  const byok = { resolveApiKey: vi.fn(), lookupApiKeyWithIdentity: vi.fn() };
  const keys = { getApiKey: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  const accepted = () =>
    of({ status: 200, data: { data: { video_id: 'vid_abc' } } });

  beforeEach(async () => {
    vi.resetAllMocks();
    keys.getApiKey.mockReturnValue('platform-key');
    byok.resolveApiKey.mockResolvedValue(null);
    byok.lookupApiKeyWithIdentity.mockResolvedValue(null);
    http.post.mockReturnValue(accepted());
    const module = await Test.createTestingModule({
      providers: [
        HeyGenService,
        { provide: LoggerService, useValue: logger },
        { provide: ApiKeyHelperService, useValue: keys },
        { provide: ByokService, useValue: byok },
        { provide: HttpService, useValue: http },
        { provide: PollUntilService, useValue: { poll: vi.fn() } },
      ],
    }).compile();
    service = module.get(HeyGenService);
  });

  it('submits a native avatar with its script, voice and callback correlation', async () => {
    await expect(
      service.generateAvatarVideo('meta', 'look', 'voice', 'Hello'),
    ).resolves.toBe('vid_abc');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/videos',
      {
        type: 'avatar',
        avatar_id: 'look',
        script: 'Hello',
        voice_id: 'voice',
        aspect_ratio: '16:9',
        resolution: '720p',
        callback_id: 'meta',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Api-Key': 'platform-key',
          'Idempotency-Key': expect.any(String),
        }),
      }),
    );
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('callback_url');
  });

  it('animates an image with external audio and preserves framing', async () => {
    await expect(
      service.generatePhotoAvatarVideo(
        'meta',
        'https://cdn/photo.png',
        {
          audioUrl: 'https://cdn/audio.mp3',
          inputText: 'unused',
          voiceId: 'unused',
        },
        undefined,
        undefined,
        'pinned-key',
        '1:1',
      ),
    ).resolves.toBe('vid_abc');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/videos',
      {
        type: 'image',
        image: { type: 'url', url: 'https://cdn/photo.png' },
        audio_url: 'https://cdn/audio.mp3',
        aspect_ratio: '1:1',
        resolution: '1080p',
        callback_id: 'meta',
      },
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Api-Key': 'pinned-key' }),
      }),
    );
    expect(byok.resolveApiKey).not.toHaveBeenCalled();
  });

  it('animates an image with a script and a HeyGen voice', async () => {
    await service.generatePhotoAvatarVideo('meta', 'https://cdn/photo.png', {
      inputText: 'Hello',
      voiceId: 'voice',
    });
    expect(http.post.mock.calls[0][1]).toEqual({
      type: 'image',
      image: { type: 'url', url: 'https://cdn/photo.png' },
      script: 'Hello',
      voice_id: 'voice',
      aspect_ratio: '9:16',
      resolution: '720p',
      callback_id: 'meta',
    });
  });

  it.each([{}, { voiceId: 'voice' }, { voiceId: 'voice', inputText: ' ' }])(
    'rejects incomplete speech before submission: %j',
    async (input) => {
      await expect(
        service.generatePhotoAvatarVideo(
          'meta',
          'https://cdn/photo.png',
          input,
        ),
      ).rejects.toThrow();
      expect(http.post).not.toHaveBeenCalled();
    },
  );

  it('accepts the terminal catalogue page when HeyGen omits next_token', async () => {
    http.get
      .mockReturnValueOnce(
        page([{ voice_id: 'first', name: 'First voice' }], 'last-page'),
      )
      .mockReturnValueOnce(
        of({
          status: 200,
          data: {
            data: [{ voice_id: 'last', name: 'Last voice' }],
            has_more: false,
          },
        }),
      );
    const voices = await service.getVoices();
    expect(voices.map((voice) => voice.voiceId)).toEqual(['first', 'last']);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[1][1].params.token).toBe('last-page');
  });

  it.each([
    { data: {} },
    { data: { task_id: 'legacy-task' } },
    { data: { video_id: ' ' } },
  ])('rejects ambiguous acceptance without a v3 video id: %j', async (data) => {
    http.post.mockReturnValue(of({ status: 200, data }));
    await expect(
      service.generateAvatarVideo('meta', 'look', 'voice', 'Hello'),
    ).rejects.toThrow('HeyGen submission returned no operation identity');
  });

  it('classifies payment rejection while preserving transport ambiguity', async () => {
    vi.mocked(isAxiosError).mockReturnValueOnce(true);
    http.post.mockReturnValueOnce(
      throwError(() => ({ isAxiosError: true, response: { status: 402 } })),
    );
    await expect(
      service.generatePhotoAvatarVideo('meta', 'https://cdn/photo.png', {
        voiceId: 'voice',
        inputText: 'Hello',
      }),
    ).rejects.toBeInstanceOf(HeyGenSubmissionRejectedError);
    const transport = new Error('Response lost');
    http.post.mockReturnValueOnce(throwError(() => transport));
    await expect(
      service.generateAvatarVideo('meta', 'look', 'voice', 'Hello'),
    ).rejects.toBe(transport);
  });

  it('does not retry an ambiguous paid submission', async () => {
    http.post.mockReturnValue(throwError(() => new Error('timeout')));
    await expect(
      service.generateAvatarVideo('meta', 'look', 'voice', 'Hello'),
    ).rejects.toThrow('timeout');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  const page = (data: unknown[], next_token: string | null = null) =>
    of({
      status: 200,
      data: { data, has_more: next_token !== null, next_token },
    });
  const look = (patch: Record<string, unknown> = {}) => ({
    id: 'look',
    name: 'Saved look',
    avatar_type: 'digital_twin',
    group_id: null,
    supported_api_engines: ['avatar_iv'],
    status: 'completed',
    preview_image_url: 'https://cdn/preview.jpg',
    ...patch,
  });
  const credential = { apiKey: 'tenant-key', credentialId: 'version-2' };

  it('paginates public presets with the platform key and preserves renderable look ids', async () => {
    http.get
      .mockReturnValueOnce(page([look({ id: 'look1' })], 'cursor/2'))
      .mockReturnValueOnce(page([look({ id: 'look2' })]));
    const avatars = await service.getAvatars('org');
    expect(avatars.map((avatar) => avatar.avatarId)).toEqual([
      'look1',
      'look2',
    ]);
    expect(avatars[0].avatarRef).toMatchObject({
      source: 'heygen-look',
      lookId: 'look1',
      ownership: 'public',
      connection: { kind: 'platform', organizationId: 'org' },
      readiness: { usable: true },
    });
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'https://api.heygen.com/v3/avatars/looks',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Api-Key': 'platform-key' }),
        params: { ownership: 'public', limit: 50, token: 'cursor/2' },
      }),
    );
  });

  it('retains accessible saved private looks after key rotation, with the current binding', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockReturnValue(page([look()]));
    const result = await service.resolveAvatarSelection(
      {
        lookId: 'look',
        ownership: 'private',
        connection: {
          provider: 'heygen',
          kind: 'byok',
          organizationId: 'org',
          credentialVersionId: 'old-version',
        },
      },
      'org',
    );
    expect(result.avatarRef.connection.credentialVersionId).toBe('version-2');
    expect(result.connection.apiKey).toBe('tenant-key');
    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Api-Key': 'tenant-key' }),
        params: { ownership: 'private', limit: 50 },
      }),
    );
    expect(keys.getApiKey).not.toHaveBeenCalled();
  });

  it.each([
    ['training', look({ status: 'processing' }), null],
    ['engine', look({ supported_api_engines: ['avatar_v'] }), null],
    ['type', look({ avatar_type: 'unknown' }), null],
    [
      'group training',
      look({ group_id: 'group' }),
      { id: 'group', status: 'processing', consent_status: 'accepted' },
    ],
    [
      'consent',
      look({ group_id: 'group' }),
      { id: 'group', status: 'completed', consent_status: 'pending' },
    ],
    [
      'unknown consent',
      look({ group_id: 'group' }),
      { id: 'group', status: 'completed' },
    ],
  ])(
    'rejects unusable private %s before submission',
    async (_name, selected, group) => {
      byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
      http.get.mockImplementation((url: string) =>
        url.endsWith('/looks')
          ? page([selected])
          : of({ data: { data: group }, status: 200 }),
      );
      await expect(
        service.resolveAvatarSelection(
          { lookId: 'look', ownership: 'private' },
          'org',
        ),
      ).rejects.toThrow();
      expect(http.post).not.toHaveBeenCalled();
    },
  );

  it('accepts documented null consent and deduplicates shared group reads', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockImplementation((url: string) =>
      url.endsWith('/looks')
        ? page([
            look({ group_id: 'group' }),
            look({ id: 'second', group_id: 'group' }),
          ])
        : of({
            status: 200,
            data: {
              data: { id: 'group', status: 'completed', consent_status: null },
            },
          }),
    );
    const result = await service.resolveAvatarSelection(
      { lookId: 'look', ownership: 'private' },
      'org',
    );
    expect(result.avatarRef.readiness.usable).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('rejects foreign refs and missing private connections without public fallback', async () => {
    await expect(
      service.resolveAvatarSelection(
        {
          lookId: 'look',
          ownership: 'private',
          connection: {
            provider: 'heygen',
            kind: 'byok',
            organizationId: 'foreign',
          },
        },
        'org',
      ),
    ).rejects.toThrow('another organization');
    await expect(
      service.resolveAvatarSelection(
        { lookId: 'look', ownership: 'private' },
        'org',
      ),
    ).rejects.toThrow('Reconnect');
    expect(http.get).not.toHaveBeenCalled();
    expect(keys.getApiKey).not.toHaveBeenCalled();
  });

  it('keeps public voices on the platform connection and private voices on BYOK', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockImplementation((_url, config) =>
      page([{ voice_id: config.params.type, name: config.params.type }]),
    );
    const voices = await service.getVoices('org');
    expect(
      voices.map((voice) => [voice.ownership, voice.connection.kind]),
    ).toEqual([
      ['public', 'platform'],
      ['private', 'byok'],
    ]);
    expect(voices[1].connection.credentialVersionId).toBe('version-2');
    http.get.mockClear();
    byok.lookupApiKeyWithIdentity.mockResolvedValue(null);
    expect(await service.getVoices('other')).toHaveLength(1);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it.each(['avatars', 'voices'] as const)(
    'loads the authorized private %s when the platform catalogue rejects its key',
    async (catalog) => {
      byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
      http.get.mockImplementation((_url, config) =>
        config.headers['X-Api-Key'] === 'platform-key'
          ? throwError(() => new Error('platform unauthorized'))
          : page(
              catalog === 'avatars'
                ? [look()]
                : [{ voice_id: 'mine', name: 'Personal voice' }],
            ),
      );
      const result =
        catalog === 'avatars'
          ? await service.getAvatars('org')
          : await service.getVoices('org');
      expect(result).toHaveLength(1);
      const identity =
        'avatarRef' in result[0] ? result[0].avatarRef : result[0];
      expect(identity).toMatchObject({
        ownership: 'private',
        connection: {
          kind: 'byok',
          organizationId: 'org',
          credentialVersionId: 'version-2',
        },
      });
      expect(http.post).not.toHaveBeenCalled();
    },
  );

  it('does not hide a platform failure as an empty catalogue when the tenant has no binding', async () => {
    http.get.mockReturnValue(
      throwError(() => new Error('platform unauthorized')),
    );
    await expect(service.getAvatars('org')).rejects.toThrow(
      'platform unauthorized',
    );
    expect(byok.lookupApiKeyWithIdentity).toHaveBeenCalledWith('org', 'heygen');
  });

  it('loads a configured private catalogue when no platform key exists', async () => {
    keys.getApiKey.mockReturnValue('');
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockReturnValue(
      page([{ voice_id: 'mine', name: 'Personal voice' }]),
    );
    expect(await service.getVoices('org')).toMatchObject([
      {
        ownership: 'private',
        connection: { kind: 'byok', credentialVersionId: 'version-2' },
      },
    ]);
    expect(http.get).toHaveBeenCalledOnce();
    expect(http.get.mock.calls[0][1].headers['X-Api-Key']).toBe('tenant-key');
  });

  it('preserves explicit override public and private partitions without a tenant lookup', async () => {
    byok.lookupApiKeyWithIdentity.mockRejectedValue(new Error('unused lookup'));
    http.get.mockReturnValue(page([{ voice_id: 'voice', name: 'Voice' }]));
    expect(
      await service.getVoices('org', undefined, 'override-key'),
    ).toMatchObject([
      {
        ownership: 'public',
        connection: { kind: 'byok', organizationId: 'org' },
      },
      {
        ownership: 'private',
        connection: { kind: 'byok', organizationId: 'org' },
      },
    ]);
    expect(byok.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
    expect(keys.getApiKey).not.toHaveBeenCalled();
    expect(
      http.get.mock.calls.every(
        ([, config]) => config.headers['X-Api-Key'] === 'override-key',
      ),
    ).toBe(true);
  });

  it('does not reinterpret a strict tenant lookup failure as permission to use platform identities', async () => {
    byok.lookupApiKeyWithIdentity.mockRejectedValue(
      new Error('credential lookup failed'),
    );
    await expect(service.getVoices('org')).rejects.toThrow(
      'credential lookup failed',
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('keeps the authorized public catalogue when only the private provider request fails', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockImplementation((_url, config) =>
      config.headers['X-Api-Key'] === 'platform-key'
        ? page([{ voice_id: 'public', name: 'Public voice' }])
        : throwError(() => new Error('personal unauthorized')),
    );
    expect(await service.getVoices('org')).toMatchObject([
      { ownership: 'public', connection: { kind: 'platform' } },
    ]);
    await expect(
      service.resolveAvatarSelection(
        { lookId: 'look', ownership: 'private' },
        'org',
      ),
    ).rejects.toThrow('personal unauthorized');
  });

  it.each([
    { data: [], has_more: true },
    { data: [], has_more: true, next_token: null },
    { data: 'invalid', has_more: false, next_token: null },
    { data: [], has_more: true, next_token: 'same' },
  ])('fails closed on broken pagination: %j', async (data) => {
    http.get.mockReturnValue(of({ status: 200, data }));
    await expect(service.getAvatars()).rejects.toThrow();
    expect(http.get.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('never substitutes a platform key when a private account is rejected', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    http.get.mockReturnValue(throwError(() => new Error('unauthorized')));
    await expect(
      service.resolveAvatarSelection(
        { lookId: 'look', ownership: 'private' },
        'org',
      ),
    ).rejects.toThrow('unauthorized');
    expect(keys.getApiKey).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('reports the personal account as disconnected when only platform presets exist', async () => {
    await expect(service.getConnectionStatus('org')).resolves.toEqual({
      hasCustomKey: false,
      isConnected: false,
      state: 'disconnected',
    });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('renders a native look with audio without converting its preview to an image', async () => {
    await service.generateNativeAvatarVideo(
      'meta',
      'look',
      { audioUrl: 'https://cdn/narration.mp3' },
      'tenant-key',
    );
    expect(http.post.mock.calls[0][1]).toEqual({
      type: 'avatar',
      avatar_id: 'look',
      audio_url: 'https://cdn/narration.mp3',
      aspect_ratio: '9:16',
      resolution: '720p',
      callback_id: 'meta',
    });
  });
});
