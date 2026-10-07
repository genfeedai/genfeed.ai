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
  const byok = { resolveApiKey: vi.fn() };
  const keys = { getApiKey: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  const accepted = () =>
    of({ status: 200, data: { data: { video_id: 'vid_abc' } } });

  beforeEach(async () => {
    vi.resetAllMocks();
    keys.getApiKey.mockReturnValue('platform-key');
    byok.resolveApiKey.mockResolvedValue(null);
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

  it('fetches every catalog page using the owning organization key and real look ids', async () => {
    byok.resolveApiKey.mockResolvedValue({ apiKey: 'tenant-key' });
    http.get.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          data: [
            {
              id: 'look1',
              name: 'First',
              preview_image_url: 'https://cdn/one.jpg',
            },
          ],
          has_more: true,
          next_token: 'cursor/2',
        },
      }),
    );
    http.get.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          data: [{ id: 'look2', name: 'Second', preview_image_url: null }],
          has_more: false,
          next_token: null,
        },
      }),
    );
    await expect(service.getAvatars('org')).resolves.toEqual([
      {
        avatarId: 'look1',
        name: 'First',
        index: 0,
        preview: 'https://cdn/one.jpg',
      },
      { avatarId: 'look2', name: 'Second', index: 1, preview: '' },
    ]);
    expect(byok.resolveApiKey).toHaveBeenCalledWith('org', 'heygen');
    expect(keys.getApiKey).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      'https://api.heygen.com/v3/avatars/looks',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Api-Key': 'tenant-key' }),
        params: { limit: 50, token: 'cursor/2' },
      }),
    );
  });

  it('maps public and private v3 voices and their audio previews without leaking private voices into the platform catalog', async () => {
    const page = (voice: string) =>
      of({
        status: 200,
        data: {
          data: [
            {
              voice_id: voice,
              name: voice,
              preview_audio_url: 'https://cdn/voice.mp3',
            },
          ],
          has_more: false,
          next_token: null,
        },
      });
    http.get.mockReturnValue(page('public'));
    await expect(service.getVoices()).resolves.toEqual([
      {
        voiceId: 'public',
        name: 'public',
        preview: 'https://cdn/voice.mp3',
        index: 0,
      },
    ]);
    expect(http.get).toHaveBeenCalledTimes(1);
    byok.resolveApiKey.mockResolvedValue({ apiKey: 'tenant-key' });
    http.get
      .mockReturnValueOnce(page('public'))
      .mockReturnValueOnce(page('private'));
    await expect(service.getVoices('org')).resolves.toHaveLength(2);
    expect(http.get).toHaveBeenLastCalledWith(
      'https://api.heygen.com/v3/voices',
      expect.objectContaining({ params: { type: 'private', limit: 100 } }),
    );
  });

  it.each([
    { data: [], has_more: true, next_token: null },
    { data: 'invalid', has_more: false, next_token: null },
    { data: [], has_more: true, next_token: 'same' },
  ])('fails closed on broken pagination: %j', async (data) => {
    http.get.mockReturnValue(of({ status: 200, data }));
    await expect(service.getAvatars()).rejects.toThrow();
    expect(http.get.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('never falls back to the platform credential after a tenant key is rejected', async () => {
    byok.resolveApiKey.mockResolvedValue({ apiKey: 'tenant-key' });
    http.get.mockReturnValue(throwError(() => new Error('unauthorized')));
    await expect(service.getAvatars('org')).rejects.toThrow('unauthorized');
    expect(keys.getApiKey).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);
  });
});
