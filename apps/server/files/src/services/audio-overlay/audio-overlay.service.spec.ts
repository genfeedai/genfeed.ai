import * as fs from 'node:fs';
import { AudioOverlayService } from '@files/services/audio-overlay/audio-overlay.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(true),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs', () => fsMock);

describe('AudioOverlayService', () => {
  const timestamp = 1_712_345_678_901;
  const randomSuffix = 'xjylrx';
  const tmpDir = '/tmp/audio-overlay';
  const videoPath = `${tmpDir}/video_${timestamp}_${randomSuffix}.mp4`;
  const audioPath = `${tmpDir}/audio_${timestamp}_${randomSuffix}.mp3`;
  const outputPath = `${tmpDir}/output_${timestamp}_${randomSuffix}.mp4`;
  const defaultKey = `audio-overlay/${timestamp}_${randomSuffix}.mp4`;
  const baseBody = {
    audioUrl: 'https://cdn.example.com/music.mp3',
    videoUrl: 'https://cdn.example.com/video.mp4',
  };
  const ffmpegService = {
    getTempPath: vi.fn().mockReturnValue(tmpDir),
    overlayAudio: vi.fn().mockResolvedValue(undefined),
  };
  const httpService = {
    get: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const uploadService = {
    uploadToS3: vi.fn().mockResolvedValue({
      publicUrl: 'https://cdn.example.com/audio-overlay.mp4',
    }),
  };
  let service: AudioOverlayService;

  const queueSuccessfulDownloads = (audioContentType?: string) => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: Buffer.from('video-data'),
          headers: { 'content-type': 'video/mp4' },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: Buffer.from('audio-data'),
          headers: audioContentType ? { 'content-type': audioContentType } : {},
        }),
      );
  };

  const expectHttpError = async (
    operation: Promise<unknown>,
    status: number,
    message: string,
  ) => {
    let caughtError: unknown;
    try {
      await operation;
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(HttpException);
    expect((caughtError as HttpException).getStatus()).toBe(status);
    expect((caughtError as HttpException).getResponse()).toBe(message);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(timestamp);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    fsMock.existsSync.mockReturnValue(true);
    fsMock.unlinkSync.mockImplementation(() => undefined);
    fsMock.writeFileSync.mockImplementation(() => undefined);
    ffmpegService.getTempPath.mockReturnValue(tmpDir);
    ffmpegService.overlayAudio.mockResolvedValue(undefined);
    uploadService.uploadToS3.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/audio-overlay.mp4',
    });
    service = new AudioOverlayService(
      ffmpegService as unknown as FFmpegService,
      httpService as unknown as HttpService,
      logger as unknown as LoggerService,
      uploadService as unknown as UploadService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves default downloads, FFmpeg options, upload, response, and cleanup', async () => {
    queueSuccessfulDownloads('audio/mpeg');

    const result = await service.processAudioOverlay(baseBody);

    expect(httpService.get).toHaveBeenNthCalledWith(1, baseBody.videoUrl, {
      maxContentLength: 500 * 1024 * 1024,
      responseType: 'arraybuffer',
      timeout: 120_000,
    });
    expect(httpService.get).toHaveBeenNthCalledWith(2, baseBody.audioUrl, {
      maxContentLength: 100 * 1024 * 1024,
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      1,
      videoPath,
      Buffer.from('video-data'),
    );
    expect(fs.writeFileSync).toHaveBeenNthCalledWith(
      2,
      audioPath,
      Buffer.from('audio-data'),
    );
    expect(ffmpegService.overlayAudio).toHaveBeenCalledWith(
      videoPath,
      audioPath,
      outputPath,
      {
        audioVolume: 100,
        fadeIn: 0,
        fadeOut: 0,
        mixMode: 'replace',
        videoVolume: 100,
      },
    );
    expect(uploadService.uploadToS3).toHaveBeenCalledWith(
      defaultKey,
      'videos',
      { path: outputPath, type: 'file' },
    );
    expect(result).toEqual({
      audioUrl: baseBody.audioUrl,
      mixMode: 'replace',
      outputUrl: 'https://cdn.example.com/audio-overlay.mp4',
      s3Key: defaultKey,
      success: true,
      videoUrl: baseBody.videoUrl,
    });
    expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
    expect(fs.unlinkSync).toHaveBeenCalledWith(videoPath);
    expect(fs.unlinkSync).toHaveBeenCalledWith(audioPath);
    expect(fs.unlinkSync).toHaveBeenCalledWith(outputPath);
  });

  it.each(['mix', 'background'] as const)(
    'preserves custom output key, %s mode, volumes, and fades',
    async (mixMode) => {
      queueSuccessfulDownloads('audio/wav');
      const body = {
        ...baseBody,
        audioVolume: 65,
        fadeIn: 1.5,
        fadeOut: 2.5,
        mixMode,
        outputKey: 'custom/mixed-video.mp4',
        videoVolume: 35,
      };

      const result = await service.processAudioOverlay(body);

      expect(ffmpegService.overlayAudio).toHaveBeenCalledWith(
        videoPath,
        `${tmpDir}/audio_${timestamp}_${randomSuffix}.wav`,
        outputPath,
        {
          audioVolume: 65,
          fadeIn: 1.5,
          fadeOut: 2.5,
          mixMode,
          videoVolume: 35,
        },
      );
      expect(uploadService.uploadToS3).toHaveBeenCalledWith(
        body.outputKey,
        'videos',
        { path: outputPath, type: 'file' },
      );
      expect(result.mixMode).toBe(mixMode);
      expect(result.s3Key).toBe(body.outputKey);
    },
  );

  it.each([
    ['audio/wav', '.wav'],
    ['audio/ogg', '.ogg'],
    ['audio/x-m4a', '.m4a'],
    ['audio/aac', '.aac'],
    ['audio/flac', '.mp3'],
    [undefined, '.mp3'],
  ] as const)(
    'uses %s content type for the %s temp extension',
    async (contentType, extension) => {
      queueSuccessfulDownloads(contentType);

      await service.processAudioOverlay(baseBody);

      expect(fs.writeFileSync).toHaveBeenNthCalledWith(
        2,
        `${tmpDir}/audio_${timestamp}_${randomSuffix}${extension}`,
        Buffer.from('audio-data'),
      );
    },
  );

  it('preserves the required-field 400 response', async () => {
    await expectHttpError(
      service.processAudioOverlay({
        audioUrl: '',
        videoUrl: baseBody.videoUrl,
      }),
      400,
      'videoUrl and audioUrl are required',
    );

    expect(httpService.get).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to process audio overlay:',
      expect.any(HttpException),
    );
  });

  it('maps processing failures to 500 and cleans every created temp path', async () => {
    queueSuccessfulDownloads('audio/mpeg');
    ffmpegService.overlayAudio.mockRejectedValueOnce(
      new Error('FFmpeg failed'),
    );

    await expectHttpError(
      service.processAudioOverlay(baseBody),
      500,
      'FFmpeg failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to process audio overlay:',
      expect.objectContaining({ message: 'FFmpeg failed' }),
    );
    expect(fs.unlinkSync).toHaveBeenCalledWith(videoPath);
    expect(fs.unlinkSync).toHaveBeenCalledWith(audioPath);
    expect(fs.unlinkSync).toHaveBeenCalledWith(outputPath);
  });

  it('cleans the assigned video path when writing the download fails', async () => {
    queueSuccessfulDownloads('audio/mpeg');
    fsMock.writeFileSync.mockImplementationOnce(() => {
      throw new Error('Disk full');
    });

    await expectHttpError(
      service.processAudioOverlay(baseBody),
      500,
      'Disk full',
    );

    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(videoPath);
  });

  it('preserves downstream HttpException categories', async () => {
    queueSuccessfulDownloads('audio/mpeg');
    ffmpegService.overlayAudio.mockRejectedValueOnce(
      new HttpException('FFmpeg request rejected', 400),
    );

    await expectHttpError(
      service.processAudioOverlay(baseBody),
      400,
      'FFmpeg request rejected',
    );
  });

  it('logs cleanup warnings without replacing a successful response', async () => {
    queueSuccessfulDownloads('audio/mpeg');
    fsMock.unlinkSync.mockImplementationOnce(() => {
      throw new Error('Cleanup denied');
    });

    await expect(service.processAudioOverlay(baseBody)).resolves.toMatchObject({
      success: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to cleanup temp file: ${videoPath}`,
      'Cleanup denied',
    );
    expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
  });
});
