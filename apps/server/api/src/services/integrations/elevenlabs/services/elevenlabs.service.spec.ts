import type { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ApiKeyCategory, FileInputType } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

const clientConstructor = vi.fn();
const forcedAlignmentCreate = vi.fn();
const ivcCreate = vi.fn();
const textToSpeechConvert = vi.fn();
const voicesDelete = vi.fn();
const voicesGetAll = vi.fn();

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: function ElevenLabsClient(this: never, options: unknown) {
    clientConstructor(options);
    return {
      forcedAlignment: { create: forcedAlignmentCreate },
      textToSpeech: { convertWithTimestamps: textToSpeechConvert },
      voices: {
        delete: voicesDelete,
        getAll: voicesGetAll,
        ivc: { create: ivcCreate },
      },
    };
  },
}));

const createReadStream = vi.fn(() => 'read-stream');

vi.mock('node:fs', () => ({
  default: { createReadStream },
}));

const { ElevenLabsService } = await import('./elevenlabs.service');

function createHarness() {
  const configService = {
    get: vi.fn((key: string) =>
      key === 'ELEVENLABS_MODEL' ? 'eleven_multilingual_v2' : undefined,
    ),
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const getApiKey = vi.fn().mockReturnValue('env-key');
  const apiKeyHelperService = { getApiKey } as unknown as ApiKeyHelperService;
  const uploadToS3 = vi.fn();
  const filesClientService = { uploadToS3 } as unknown as FilesClientService;

  return {
    getApiKey,
    loggerService,
    service: new ElevenLabsService(
      configService,
      loggerService,
      apiKeyHelperService,
      filesClientService,
    ),
    uploadToS3,
  };
}

describe('ElevenLabsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voicesGetAll.mockResolvedValue({ voices: [] });
    textToSpeechConvert.mockResolvedValue({ audioBase64: 'AAAA' });
    ivcCreate.mockResolvedValue({ voiceId: 'voice-new' });
    voicesDelete.mockResolvedValue(undefined);
    forcedAlignmentCreate.mockResolvedValue({ words: [] });
  });

  describe('client construction', () => {
    it('builds a single cached client from the configured API key', async () => {
      const { getApiKey, service } = createHarness();

      await service.getVoices();
      await service.getVoices();

      expect(getApiKey).toHaveBeenCalledWith(ApiKeyCategory.ELEVENLABS);
      expect(clientConstructor).toHaveBeenCalledTimes(1);
      expect(clientConstructor).toHaveBeenCalledWith({ apiKey: 'env-key' });
    });

    it('builds a fresh uncached client for a BYOK override', async () => {
      const { getApiKey, service } = createHarness();

      await service.getVoices(undefined, undefined, 'byok-key');
      await service.getVoices(undefined, undefined, 'byok-key');

      expect(getApiKey).not.toHaveBeenCalled();
      expect(clientConstructor).toHaveBeenCalledTimes(2);
      expect(clientConstructor).toHaveBeenCalledWith({ apiKey: 'byok-key' });
    });
  });

  describe('getVoices', () => {
    it('maps provider voices onto the domain shape', async () => {
      const { service } = createHarness();
      voicesGetAll.mockResolvedValue({
        voices: [
          {
            name: 'Rachel',
            previewUrl: 'https://cdn.test/rachel.mp3',
            voiceId: 'v1',
          },
          { name: null, previewUrl: null, voiceId: 'v2' },
        ],
      });

      await expect(service.getVoices()).resolves.toEqual([
        {
          name: 'Rachel',
          preview: 'https://cdn.test/rachel.mp3',
          voiceId: 'v1',
        },
        { name: 'Untitled Voice', preview: undefined, voiceId: 'v2' },
      ]);
    });

    it('logs and rethrows a provider failure', async () => {
      const { loggerService, service } = createHarness();
      const providerError = new Error('unauthorized');
      voicesGetAll.mockRejectedValue(providerError);

      await expect(service.getVoices()).rejects.toThrowError(providerError);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        providerError,
      );
    });
  });

  describe('textToSpeech', () => {
    it('requests the configured model at a fixed output format', async () => {
      const { service } = createHarness();
      textToSpeechConvert.mockResolvedValue({ audioBase64: 'BBBB' });

      await expect(service.textToSpeech('v1', 'hello')).resolves.toEqual({
        audioBase64: 'BBBB',
      });
      expect(textToSpeechConvert).toHaveBeenCalledWith('v1', {
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
        text: 'hello',
      });
    });
  });

  describe('generateAndUploadAudio', () => {
    it('uploads the decoded audio and returns the CDN url', async () => {
      const { service, uploadToS3 } = createHarness();
      textToSpeechConvert.mockResolvedValue({
        audioBase64: Buffer.from('audio-bytes').toString('base64'),
        normalizedAlignment: { characterEndTimesSeconds: [0.5, 1.25, 3.75] },
      });
      uploadToS3.mockResolvedValue({ publicUrl: 'https://cdn.test/a.mp3' });

      const result = await service.generateAndUploadAudio(
        'v1',
        'hello',
        'ingredient-1',
      );

      expect(uploadToS3).toHaveBeenCalledWith('ingredient-1', 'musics', {
        contentType: 'audio/mpeg',
        data: Buffer.from('audio-bytes'),
        type: FileInputType.BUFFER,
      });
      expect(result.audioUrl).toBe('https://cdn.test/a.mp3');
      expect(result.duration).toBe(3.75);
    });

    it('falls back to the raw alignment when no normalised one is present', async () => {
      const { service, uploadToS3 } = createHarness();
      textToSpeechConvert.mockResolvedValue({
        alignment: { characterEndTimesSeconds: [1, 2] },
        audioBase64: 'AAAA',
      });
      uploadToS3.mockResolvedValue({ publicUrl: 'https://cdn.test/a.mp3' });

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).resolves.toMatchObject({ duration: 2 });
    });

    it('prefers the duration reported by the upload service', async () => {
      const { service, uploadToS3 } = createHarness();
      textToSpeechConvert.mockResolvedValue({
        alignment: { characterEndTimesSeconds: [1, 2] },
        audioBase64: 'AAAA',
      });
      uploadToS3.mockResolvedValue({
        duration: 9.5,
        publicUrl: 'https://cdn.test/a.mp3',
      });

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).resolves.toMatchObject({ duration: 9.5 });
    });

    it('reports a zero duration when no alignment is returned', async () => {
      const { service, uploadToS3 } = createHarness();
      textToSpeechConvert.mockResolvedValue({ audioBase64: 'AAAA' });
      uploadToS3.mockResolvedValue({ publicUrl: 'https://cdn.test/a.mp3' });

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).resolves.toMatchObject({ duration: 0 });
    });

    it('reports a zero duration for an empty alignment array', async () => {
      const { service, uploadToS3 } = createHarness();
      textToSpeechConvert.mockResolvedValue({
        audioBase64: 'AAAA',
        normalizedAlignment: { characterEndTimesSeconds: [] },
      });
      uploadToS3.mockResolvedValue({ publicUrl: 'https://cdn.test/a.mp3' });

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).resolves.toMatchObject({ duration: 0 });
    });

    it('fails loudly when the upload yields no public url', async () => {
      const { loggerService, service, uploadToS3 } = createHarness();
      uploadToS3.mockResolvedValue({ publicUrl: undefined });

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).rejects.toThrowError('Failed to get public URL after upload');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('logs and rethrows an upload failure', async () => {
      const { loggerService, service, uploadToS3 } = createHarness();
      const uploadError = new Error('S3 unavailable');
      uploadToS3.mockRejectedValue(uploadError);

      await expect(
        service.generateAndUploadAudio('v1', 'hello', 'ingredient-1'),
      ).rejects.toThrowError(uploadError);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        uploadError,
      );
    });
  });

  describe('cloneVoice', () => {
    it('submits every sample with a generated filename', async () => {
      const { service } = createHarness();

      await expect(
        service.cloneVoice('My Voice', [
          Buffer.from('one'),
          Buffer.from('two'),
        ]),
      ).resolves.toEqual({ name: 'My Voice', voiceId: 'voice-new' });

      expect(ivcCreate).toHaveBeenCalledWith({
        files: [
          {
            contentLength: 3,
            contentType: 'audio/mpeg',
            data: Buffer.from('one'),
            filename: 'voice-sample-1.mp3',
          },
          {
            contentLength: 3,
            contentType: 'audio/mpeg',
            data: Buffer.from('two'),
            filename: 'voice-sample-2.mp3',
          },
        ],
        name: 'My Voice',
      });
    });

    it('forwards optional description and noise-removal flags', async () => {
      const { service } = createHarness();

      await service.cloneVoice('My Voice', [Buffer.from('one')], {
        description: 'warm narrator',
        removeBackgroundNoise: false,
      });

      expect(ivcCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'warm narrator',
          removeBackgroundNoise: false,
        }),
      );
    });

    it('logs and rethrows a provider failure', async () => {
      const { loggerService, service } = createHarness();
      const providerError = new Error('quota exceeded');
      ivcCreate.mockRejectedValue(providerError);

      await expect(
        service.cloneVoice('My Voice', [Buffer.from('one')]),
      ).rejects.toThrowError(providerError);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('deleteVoice', () => {
    it('delegates to the provider', async () => {
      const { service } = createHarness();

      await expect(service.deleteVoice('v1')).resolves.toBeUndefined();
      expect(voicesDelete).toHaveBeenCalledWith('v1');
    });

    it('logs and rethrows a provider failure', async () => {
      const { loggerService, service } = createHarness();
      const providerError = new Error('not found');
      voicesDelete.mockRejectedValue(providerError);

      await expect(service.deleteVoice('v1')).rejects.toThrowError(
        providerError,
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('forcedAlignment', () => {
    it('streams the file and renders SRT cues from the word timings', async () => {
      const { service } = createHarness();
      forcedAlignmentCreate.mockResolvedValue({
        words: [
          { end: 1.5, start: 0, text: 'Hello' },
          { end: 3.25, start: 1.5, text: 'world' },
        ],
      });

      const srt = await service.forcedAlignment('/tmp/a.mp3', 'Hello world');

      expect(createReadStream).toHaveBeenCalledWith('/tmp/a.mp3');
      expect(forcedAlignmentCreate).toHaveBeenCalledWith({
        file: 'read-stream',
        text: 'Hello world',
      });
      expect(srt).toBe(
        '1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:00:01,500 --> 00:00:03,250\nworld\n',
      );
    });

    it('renders timestamps past the one minute mark', async () => {
      const { service } = createHarness();
      forcedAlignmentCreate.mockResolvedValue({
        words: [{ end: 3661.125, start: 61.5, text: 'late' }],
      });

      const srt = await service.forcedAlignment('/tmp/a.mp3', 'late');

      expect(srt).toBe('1\n00:01:01,500 --> 01:01:01,125\nlate\n');
    });

    it('returns an empty document when no words are aligned', async () => {
      const { service } = createHarness();

      await expect(
        service.forcedAlignment('/tmp/a.mp3', 'nothing'),
      ).resolves.toBe('');
    });

    it('logs and rethrows a provider failure', async () => {
      const { loggerService, service } = createHarness();
      const providerError = new Error('unsupported media');
      forcedAlignmentCreate.mockRejectedValue(providerError);

      await expect(
        service.forcedAlignment('/tmp/a.mp3', 'text'),
      ).rejects.toThrowError(providerError);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
