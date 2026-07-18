vi.mock('node:fs', () => ({
  existsSync: vi
    .fn()
    .mockImplementation((filePath: string) => !filePath.endsWith('index.html')),
}));

vi.mock('@remotion/bundler', () => ({
  bundle: vi.fn().mockResolvedValue('/tmp/remotion-bundle'),
}));

vi.mock('@remotion/renderer', () => ({
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
import { RemotionRendererService } from '@files/services/remotion/remotion-renderer.service';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

describe('RemotionRendererService', () => {
  const params = BRANDED_AVATAR_RENDER_FIXTURE;
  const logger = { log: vi.fn() };

  afterEach(() => vi.clearAllMocks());

  it('selects and renders the pinned composition with bounded concurrency', async () => {
    const service = new RemotionRendererService(logger as never);
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
    const service = new RemotionRendererService(logger as never);

    await service.render(params, '/tmp/first.mp4', vi.fn());
    await service.render(params, '/tmp/second.mp4', vi.fn());

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(renderMedia).toHaveBeenCalledTimes(2);
  });

  it('rejects a job for a different renderer version', async () => {
    const service = new RemotionRendererService(logger as never);

    await expect(
      service.render(
        { ...params, rendererVersion: 'remotion@0.0.0' } as never,
        '/tmp/output.mp4',
        vi.fn(),
      ),
    ).rejects.toThrow('Unsupported editor renderer version');
    expect(renderMedia).not.toHaveBeenCalled();
  });
});
