vi.mock('node:fs', () => ({
  existsSync: vi
    .fn()
    .mockImplementation((filePath: string) => !filePath.endsWith('index.html')),
}));

vi.mock('@remotion/bundler', () => ({
  bundle: vi.fn().mockResolvedValue('/tmp/remotion-bundle'),
}));

vi.mock('@remotion/renderer', () => ({
  makeCancelSignal: vi.fn(() => {
    let cancelled = false;
    let onCancel: (() => void) | undefined;

    return {
      cancel: vi.fn(() => {
        cancelled = true;
        onCancel?.();
      }),
      cancelSignal: (listener: () => void) => {
        onCancel = listener;
        if (cancelled) {
          listener();
        }
      },
    };
  }),
  renderMedia: vi.fn().mockResolvedValue(undefined),
  selectComposition: vi.fn().mockResolvedValue({
    durationInFrames: 300,
    fps: 30,
    height: 1920,
    id: 'EditorComposition',
    width: 1080,
  }),
}));

import { BRANDED_AVATAR_RENDER_FIXTURE } from '@files/services/remotion/fixtures/branded-avatar.fixture';
import {
  EditorRenderCancelledError,
  EditorRenderTimeoutError,
  RemotionRendererService,
} from '@files/services/remotion/remotion-renderer.service';
import { EDITOR_RENDER_TIMEOUT_MS } from '@genfeedai/interfaces';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

describe('RemotionRendererService', () => {
  const params = BRANDED_AVATAR_RENDER_FIXTURE;
  const logger = { log: vi.fn() };
  const cancellationService = {
    register: vi.fn().mockReturnValue(vi.fn()),
  };

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('selects and renders the pinned composition with bounded concurrency', async () => {
    const service = new RemotionRendererService(
      logger as never,
      cancellationService as never,
    );
    const onProgress = vi.fn();

    await service.render(params, '/tmp/output.mp4', onProgress);

    expect(selectComposition).toHaveBeenCalledWith({
      id: 'EditorComposition',
      inputProps: { snapshot: params.snapshot },
      serveUrl: '/tmp/remotion-bundle',
    });
    expect(renderMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'h264',
        composition: expect.objectContaining({
          height: 1920,
          width: 1080,
        }),
        concurrency: 1,
        inputProps: { snapshot: params.snapshot },
        outputLocation: '/tmp/output.mp4',
        serveUrl: '/tmp/remotion-bundle',
      }),
    );
  });

  it('reuses the composition bundle across render jobs', async () => {
    const service = new RemotionRendererService(
      logger as never,
      cancellationService as never,
    );

    await service.render(params, '/tmp/first.mp4', vi.fn());
    await service.render(params, '/tmp/second.mp4', vi.fn());

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(renderMedia).toHaveBeenCalledTimes(2);
  });

  it('rejects a job for a different renderer version', async () => {
    const service = new RemotionRendererService(
      logger as never,
      cancellationService as never,
    );

    await expect(
      service.render(
        { ...params, rendererVersion: 'remotion@0.0.0' } as never,
        '/tmp/output.mp4',
        vi.fn(),
      ),
    ).rejects.toThrow('Unsupported editor renderer version');
    expect(renderMedia).not.toHaveBeenCalled();
  });

  it('cooperatively cancels an active renderer process', async () => {
    let cancelActiveRender: (() => void) | undefined;
    let signalRegistered: (() => void) | undefined;
    const registered = new Promise<void>((resolve) => {
      signalRegistered = resolve;
    });
    const cancellationService = {
      register: vi.fn((_jobId: string, cancel: () => void) => {
        cancelActiveRender = cancel;
        signalRegistered?.();
        return vi.fn();
      }),
    };
    vi.mocked(renderMedia).mockImplementationOnce(
      ({ cancelSignal }) =>
        new Promise((_resolve, reject) => {
          cancelSignal?.(() => reject(new Error('renderer cancelled')));
        }),
    );
    const service = new RemotionRendererService(
      logger as never,
      cancellationService as never,
    );

    const render = service.render(
      params,
      '/tmp/output.mp4',
      vi.fn(),
      'job-123',
    );
    await registered;
    cancelActiveRender?.();

    await expect(render).rejects.toBeInstanceOf(EditorRenderCancelledError);
  });

  it('enforces an overall render deadline', async () => {
    vi.useFakeTimers();
    let signalRegistered: (() => void) | undefined;
    const registered = new Promise<void>((resolve) => {
      signalRegistered = resolve;
    });
    const timeoutCancellationService = {
      register: vi.fn(() => {
        signalRegistered?.();
        return vi.fn();
      }),
    };
    vi.mocked(renderMedia).mockImplementationOnce(
      ({ cancelSignal }) =>
        new Promise((_resolve, reject) => {
          cancelSignal?.(() => reject(new Error('renderer cancelled')));
        }),
    );
    const service = new RemotionRendererService(
      logger as never,
      timeoutCancellationService as never,
    );
    const render = service.render(params, '/tmp/output.mp4', vi.fn());

    await registered;
    await vi.advanceTimersByTimeAsync(EDITOR_RENDER_TIMEOUT_MS);

    await expect(render).rejects.toBeInstanceOf(EditorRenderTimeoutError);
  });
});
