import { ArgilWebhookService } from '@api/endpoints/webhooks/argil/webhooks.argil.service';

describe('ArgilWebhookService', () => {
  const clipProjectsService = { reconcileTerminalState: vi.fn() };
  const clipResultsService = {
    findOne: vi.fn(),
    transitionProviderTerminal: vi.fn(),
  };
  const loggerService = { log: vi.fn(), warn: vi.fn() };
  let service: ArgilWebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    clipResultsService.findOne.mockResolvedValue({
      id: 'clip-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      providerJobId: 'video-1',
      providerName: 'argil',
      status: 'processing',
    });
    clipResultsService.transitionProviderTerminal.mockResolvedValue(true);
    service = new ArgilWebhookService(
      clipProjectsService as never,
      clipResultsService as never,
      loggerService as never,
    );
  });

  it('completes the matching clip and reconciles its project', async () => {
    await service.handleCallback({
      data: {
        extras: { callbackId: 'clip-1' },
        videoId: 'video-1',
        videoUrl: 'https://cdn.argil.ai/video-1.mp4',
      },
      event: 'VIDEO_GENERATION_SUCCESS',
    });

    expect(clipResultsService.transitionProviderTerminal).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      providerJobId: 'video-1',
      providerName: 'argil',
      status: 'completed',
      videoUrl: 'https://cdn.argil.ai/video-1.mp4',
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });

  it('is idempotent for an already-terminal clip', async () => {
    clipResultsService.findOne.mockResolvedValue({
      organizationId: 'org-1',
      projectId: 'project-1',
      providerJobId: 'video-1',
      providerName: 'argil',
      status: 'completed',
    });
    clipResultsService.transitionProviderTerminal.mockResolvedValue(false);

    await service.handleCallback({
      data: {
        extras: JSON.stringify({ callbackId: 'clip-1' }),
        videoId: 'video-1',
        videoUrl: 'https://cdn.argil.ai/video-1.mp4',
      },
      event: 'VIDEO_GENERATION_SUCCESS',
    });

    expect(clipProjectsService.reconcileTerminalState).not.toHaveBeenCalled();
  });

  it('rejects a callback for a different provider job', async () => {
    await expect(
      service.handleCallback({
        data: {
          extras: { callbackId: 'clip-1' },
          videoId: 'video-other',
          videoUrl: 'https://cdn.argil.ai/video-other.mp4',
        },
        event: 'VIDEO_GENERATION_SUCCESS',
      }),
    ).rejects.toThrow('does not match the stored provider job');
    expect(
      clipResultsService.transitionProviderTerminal,
    ).not.toHaveBeenCalled();
  });

  it('marks only the matching clip failed', async () => {
    await service.handleCallback({
      data: {
        error: 'Render failed',
        extras: { callbackId: 'clip-1' },
        videoId: 'video-1',
      },
      event: 'VIDEO_GENERATION_FAILED',
    });

    expect(clipResultsService.transitionProviderTerminal).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      error: 'Render failed',
      providerJobId: 'video-1',
      providerName: 'argil',
      status: 'failed',
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });

  it('allows only one concurrent terminal callback to reconcile the project', async () => {
    let claimed = false;
    clipResultsService.transitionProviderTerminal.mockImplementation(
      async () => {
        if (claimed) {
          return false;
        }
        claimed = true;
        await Promise.resolve();
        return true;
      },
    );

    await Promise.all([
      service.handleCallback({
        data: {
          extras: { callbackId: 'clip-1' },
          videoId: 'video-1',
          videoUrl: 'https://cdn.argil.ai/video-1.mp4',
        },
        event: 'VIDEO_GENERATION_SUCCESS',
      }),
      service.handleCallback({
        data: {
          error: 'Late failure',
          extras: { callbackId: 'clip-1' },
          videoId: 'video-1',
        },
        event: 'VIDEO_GENERATION_FAILED',
      }),
    ]);

    expect(clipResultsService.transitionProviderTerminal).toHaveBeenCalledTimes(
      2,
    );
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledTimes(1);
  });
});
