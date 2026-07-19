import { EditorRenderJobsController } from '@files/controllers/editor-render-jobs.controller';
import { JOB_TYPES } from '@files/queues/queue.constants';
import { HttpException } from '@nestjs/common';

describe('EditorRenderJobsController', () => {
  const makeJob = (state: string) => ({
    data: { params: {} },
    getState: vi.fn().mockResolvedValue(state),
    id: 'job-123',
    name: JOB_TYPES.RENDER_EDITOR_COMPOSITION,
    remove: vi.fn().mockResolvedValue(undefined),
  });
  const videoQueueService = { getJob: vi.fn() };
  const renderJobService = { requestCancellation: vi.fn() };
  const cancellationService = { request: vi.fn() };
  const logger = { warn: vi.fn() };
  const controller = new EditorRenderJobsController(
    videoQueueService as never,
    renderJobService as never,
    cancellationService as never,
    logger as never,
  );

  afterEach(() => vi.clearAllMocks());

  it('durably marks and broadcasts cancellation for an active render', async () => {
    const job = makeJob('active');
    videoQueueService.getJob.mockResolvedValue(job);
    renderJobService.requestCancellation.mockResolvedValue({
      jobId: 'job-123',
    });

    const result = await controller.cancel('job-123');

    expect(renderJobService.requestCancellation).toHaveBeenCalledWith(
      job,
      expect.any(String),
    );
    expect(cancellationService.request).toHaveBeenCalledWith(
      'job-123',
      expect.any(String),
    );
    expect(job.remove).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      jobId: 'job-123',
      status: 'cancellation-requested',
    });
  });

  it('removes a queued render after persisting cancellation', async () => {
    const job = makeJob('waiting');
    videoQueueService.getJob.mockResolvedValue(job);

    await controller.cancel('job-123');

    expect(job.remove).toHaveBeenCalled();
  });

  it('rejects cancellation after the render is terminal', async () => {
    videoQueueService.getJob.mockResolvedValue(makeJob('completed'));

    await expect(controller.cancel('job-123')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(cancellationService.request).not.toHaveBeenCalled();
  });
});
