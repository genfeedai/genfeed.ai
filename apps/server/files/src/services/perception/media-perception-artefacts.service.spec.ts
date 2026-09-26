import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { MediaPerceptionArtefactsService } from '@files/services/perception/media-perception-artefacts.service';
import {
  OcrEngineUnavailableError,
  type TesseractOcrService,
} from '@files/services/perception/tesseract-ocr.service';
import type { S3Service } from '@files/services/s3/s3.service';
import type { UploadService } from '@files/services/upload/upload.service';
import type { LoggerService } from '@libs/logger/logger.service';
import sharp from 'sharp';

async function stubJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: 40, g: 20, r: 10 },
      channels: 3,
      height: 8,
      width: 8,
    },
  })
    .jpeg()
    .toBuffer();
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function makeHarness(options: { hasAudio?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'perception-spec-'));
  const sourceBytes = await stubJpeg();
  const frameBytes = await stubJpeg();

  const ffmpegService = {
    convertVideoToAudio: vi.fn(async (_input: string, output: string) => {
      fs.writeFileSync(output, 'mp3');
    }),
    extractFrame: vi.fn(async (_input: string, output: string) => {
      fs.writeFileSync(output, frameBytes);
      return output;
    }),
    getTempPath: vi.fn((type: string, id: string) =>
      path.join(root, `${type}-${id}`),
    ),
    hasAudioStream: vi.fn().mockResolvedValue(options.hasAudio ?? true),
    probe: vi
      .fn()
      .mockResolvedValue({ format: { duration: '12' }, streams: [] }),
  };
  const s3Service = {
    downloadFromUrl: vi.fn(async (_url: string, localPath: string) => {
      fs.writeFileSync(localPath, sourceBytes);
    }),
  };
  const uploadService = {
    uploadToS3: vi.fn(async (key: string, type: string) => ({
      publicUrl: `https://cdn.example.com/ingredients/${type}/${key}`,
      s3Key: `ingredients/${type}/${key}`,
    })),
  };
  const ocrService = {
    recognize: vi.fn().mockResolvedValue('LAUNCH DAY'),
  };
  const logger = { log: vi.fn(), warn: vi.fn() };

  const service = new MediaPerceptionArtefactsService(
    ffmpegService as unknown as FFmpegService,
    s3Service as unknown as S3Service,
    uploadService as unknown as UploadService,
    ocrService as unknown as TesseractOcrService,
    logger as unknown as LoggerService,
  );

  return {
    assetHash: sha256(sourceBytes),
    ffmpegService,
    ocrService,
    root,
    s3Service,
    service,
    uploadService,
  };
}

describe('MediaPerceptionArtefactsService', () => {
  it('fingerprints the downloaded bytes and cleans up', async () => {
    const h = await makeHarness();

    await expect(
      h.service.fingerprint('https://cdn.example.com/a.mp4'),
    ).resolves.toEqual({
      assetHash: h.assetHash,
      sizeBytes: expect.any(Number),
    });
    expect(fs.readdirSync(h.root)).toEqual([]);
  });

  it('samples evenly spaced frames, OCRs each and extracts the audio track', async () => {
    const h = await makeHarness();

    const artefacts = await h.service.extract({
      assetHash: h.assetHash,
      frameCount: 3,
      kind: 'video',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.mp4',
    });

    expect(
      h.ffmpegService.extractFrame.mock.calls.map((call) => call[2]),
    ).toEqual([2, 6, 10]);
    expect(artefacts).toEqual(
      expect.objectContaining({
        assetHash: h.assetHash,
        audioUrl: `https://cdn.example.com/ingredients/audios/perception/org-1/${h.assetHash}/audio.mp3`,
        diagnostics: [],
        durationSeconds: 12,
        framesStatus: 'ready',
        kind: 'video',
        ocrStatus: 'ready',
      }),
    );
    expect(artefacts.frames.map((frame) => frame.timestampSeconds)).toEqual([
      2, 6, 10,
    ]);
    expect(artefacts.ocr).toEqual([
      { frameIndex: 0, text: 'LAUNCH DAY' },
      { frameIndex: 1, text: 'LAUNCH DAY' },
      { frameIndex: 2, text: 'LAUNCH DAY' },
    ]);
    expect(h.uploadService.uploadToS3).toHaveBeenCalledWith(
      `perception/org-1/${h.assetHash}/frame-0.jpg`,
      'images',
      expect.objectContaining({ type: 'file' }),
    );
    expect(fs.readdirSync(h.root)).toEqual([]);
  });

  it('treats a still image as its own single frame with no audio', async () => {
    const h = await makeHarness();

    const artefacts = await h.service.extract({
      assetHash: h.assetHash,
      frameCount: 6,
      kind: 'image',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.png',
    });

    expect(h.ffmpegService.extractFrame).not.toHaveBeenCalled();
    expect(artefacts.frames).toHaveLength(1);
    expect(artefacts.frames[0].timestampSeconds).toBeNull();
    expect(artefacts.audioUrl).toBeNull();
    expect(artefacts.durationSeconds).toBeNull();
  });

  it('skips frames and OCR for audio assets', async () => {
    const h = await makeHarness();

    const artefacts = await h.service.extract({
      assetHash: h.assetHash,
      frameCount: 6,
      kind: 'audio',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.mp3',
    });

    expect(artefacts.framesStatus).toBe('unavailable');
    expect(artefacts.ocrStatus).toBe('unavailable');
    expect(artefacts.audioUrl).not.toBeNull();
  });

  it('reports OCR as unavailable when no engine is installed', async () => {
    const h = await makeHarness();
    h.ocrService.recognize.mockRejectedValue(new OcrEngineUnavailableError());

    const artefacts = await h.service.extract({
      assetHash: h.assetHash,
      frameCount: 2,
      kind: 'video',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.mp4',
    });

    expect(artefacts.framesStatus).toBe('ready');
    expect(artefacts.ocrStatus).toBe('unavailable');
    expect(artefacts.diagnostics).toEqual([
      expect.objectContaining({ code: 'ocr_engine_unavailable' }),
    ]);
  });

  it('returns no audio URL for a silent video', async () => {
    const h = await makeHarness({ hasAudio: false });

    const artefacts = await h.service.extract({
      assetHash: h.assetHash,
      frameCount: 1,
      kind: 'video',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.mp4',
    });

    expect(artefacts.audioUrl).toBeNull();
    expect(h.ffmpegService.convertVideoToAudio).not.toHaveBeenCalled();
  });

  it('refuses to file artefacts under a hash the bytes no longer match', async () => {
    const h = await makeHarness();

    await expect(
      h.service.extract({
        assetHash: 'b'.repeat(64),
        frameCount: 1,
        kind: 'video',
        organizationId: 'org-1',
        url: 'https://cdn.example.com/a.mp4',
      }),
    ).rejects.toThrow('Asset bytes changed since they were fingerprinted');
    expect(h.uploadService.uploadToS3).not.toHaveBeenCalled();
  });

  it('rejects an unsafe organization segment before touching storage', async () => {
    const h = await makeHarness();

    await expect(
      h.service.extract({
        assetHash: h.assetHash,
        frameCount: 1,
        kind: 'video',
        organizationId: '../org',
        url: 'https://cdn.example.com/a.mp4',
      }),
    ).rejects.toThrow();
    expect(h.s3Service.downloadFromUrl).not.toHaveBeenCalled();
  });

  it('places sample timestamps at segment midpoints', () => {
    expect(MediaPerceptionArtefactsService.sampleTimestamps(10, 4)).toEqual([
      1.25, 3.75, 6.25, 8.75,
    ]);
    expect(MediaPerceptionArtefactsService.sampleTimestamps(null, 4)).toEqual([
      0,
    ]);
  });
});
