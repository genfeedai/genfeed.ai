import { FilesController } from '@files/controllers/files.controller';

describe('files job identity across queues', () => {
  it('rejects a failed video job sharing an ID with a completed download', async () => {
    const videoJob = {
      failedReason: 'spawn yt-dlp ENOENT',
      getState: vi.fn().mockResolvedValue('failed'),
      id: '1',
    };
    const downloadJob = {
      getState: vi.fn().mockResolvedValue('completed'),
      id: '1',
      returnvalue: { outputPath: '/tmp/upload.mp4', success: true },
    };
    const controller: FilesController = Object.assign(
      Object.create(FilesController.prototype),
      {
        fileQueueService: { getJob: vi.fn().mockResolvedValue(downloadJob) },
        imageQueueService: { getJob: vi.fn().mockResolvedValue(undefined) },
        logger: { error: vi.fn() },
        videoQueueService: { getJob: vi.fn().mockResolvedValue(videoJob) },
        youtubeQueueService: { getJob: vi.fn().mockResolvedValue(undefined) },
      },
    );

    await expect(controller.getJobStatus('1')).rejects.toMatchObject({
      message: 'Job ID is ambiguous across processing queues',
      status: 409,
    });
    expect(videoJob.getState).not.toHaveBeenCalled();
  });
});
