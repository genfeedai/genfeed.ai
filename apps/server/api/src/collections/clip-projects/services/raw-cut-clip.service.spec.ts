import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import {
  RawCutClipService,
  type RawCutDispatchInput,
} from './raw-cut-clip.service';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockFileQueueService(): Mocked<
  Pick<FileQueueService, 'processVideo'>
> {
  return {
    processVideo: vi.fn().mockResolvedValue({
      ingredientId: 'clip-result-1',
      jobId: 'trim-job-1',
      status: 'queued',
      type: 'clip-trim',
    }),
  };
}

function makeInput(
  overrides?: Partial<RawCutDispatchInput>,
): RawCutDispatchInput {
  return {
    captionSrt: '1\n00:00:00,000 --> 00:00:05,000\nHello',
    clipResultId: 'clip-result-1',
    endTime: 45,
    organizationId: '507f1f77bcf86cd799439011',
    sourceVideoS3Key: 'videos/source.mp4',
    startTime: 15,
    userId: '507f1f77bcf86cd799439013',
    ...overrides,
  };
}

describe('RawCutClipService', () => {
  let service: RawCutClipService;
  let fileQueueService: ReturnType<typeof createMockFileQueueService>;
  let logger: LoggerService;

  beforeEach(() => {
    fileQueueService = createMockFileQueueService();
    logger = createMockLogger();
    service = new RawCutClipService(
      fileQueueService as unknown as FileQueueService,
      logger,
    );
  });

  it('dispatches a clip-trim job for the highlight window', async () => {
    await service.dispatchClip(makeInput());

    expect(fileQueueService.processVideo).toHaveBeenCalledTimes(1);
    expect(fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'raw-cut-trim-clip-result-1',
        ingredientId: 'clip-result-1',
        organizationId: '507f1f77bcf86cd799439011',
        type: 'clip-trim',
        userId: '507f1f77bcf86cd799439013',
      }),
    );
  });

  it('passes the cut window and duration in the job params', async () => {
    await service.dispatchClip(makeInput({ endTime: 45, startTime: 15 }));

    const call = fileQueueService.processVideo.mock.calls[0][0];
    expect(call.params).toEqual(
      expect.objectContaining({
        duration: 30,
        endTime: 45,
        s3Key: 'videos/source.mp4',
        startTime: 15,
      }),
    );
  });

  it('carries the caption SRT alongside the trim job for downstream burn-in', async () => {
    const captionSrt = '1\n00:00:00,000 --> 00:00:02,000\nBurned caption';
    await service.dispatchClip(makeInput({ captionSrt }));

    const call = fileQueueService.processVideo.mock.calls[0][0];
    expect(call.params?.captionContent).toBe(captionSrt);
  });

  it('prefers an S3 key but falls back to a source URL', async () => {
    await service.dispatchClip(
      makeInput({
        sourceVideoS3Key: undefined,
        sourceVideoUrl: 'https://cdn/source.mp4',
      }),
    );

    const call = fileQueueService.processVideo.mock.calls[0][0];
    expect(call.params?.s3Key).toBeUndefined();
    expect(call.params?.inputPath).toBe('https://cdn/source.mp4');
  });

  it('returns the files job id tagged with the raw-cut provider', async () => {
    const result = await service.dispatchClip(makeInput());

    expect(result).toEqual({
      jobId: 'trim-job-1',
      providerName: 'raw-cut',
      status: 'queued',
    });
  });

  it('throws when no source video reference is provided', async () => {
    await expect(
      service.dispatchClip(
        makeInput({ sourceVideoS3Key: undefined, sourceVideoUrl: undefined }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('rejects a zero-length cut window before dispatching a trim job', async () => {
    await expect(
      service.dispatchClip(makeInput({ endTime: 15, startTime: 15 })),
    ).rejects.toThrow(BadRequestException);

    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('rejects a negative cut window before dispatching a trim job', async () => {
    await expect(
      service.dispatchClip(makeInput({ endTime: 14.5, startTime: 15 })),
    ).rejects.toThrow(BadRequestException);

    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('rejects a negative startTime before dispatching a trim job', async () => {
    await expect(
      service.dispatchClip(makeInput({ endTime: 10, startTime: -5 })),
    ).rejects.toThrow(BadRequestException);

    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });
});
