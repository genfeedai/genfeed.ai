interface RenderRecord {
  codec: string;
  concurrency: number | string | null | undefined;
  height: number;
  inputProps: Record<string, unknown>;
  outcome: 'cancelled' | 'finished' | 'running';
  outputLocation: string | null | undefined;
  serveUrl: string;
  width: number;
}

// Remotion as the render worker sees it: a bundler, a composition picker and a
// renderer that either finishes or keeps rendering until it is cancelled.
const remotion = vi.hoisted(() => ({
  bundleFailures: 0,
  bundles: [] as string[],
  hasPrebuiltBundle: false,
  isRenderHanging: false,
  progress: [] as number[],
  renders: [] as RenderRecord[],
  selectionGate: undefined as Promise<void> | undefined,
  selections: [] as string[],
}));

vi.mock('node:fs', () => ({
  existsSync: (filePath: string) =>
    filePath.endsWith('src/remotion/index.tsx') ||
    (remotion.hasPrebuiltBundle &&
      filePath.endsWith('remotion-bundle/index.html')),
}));

vi.mock('@remotion/bundler', () => ({
  bundle: async ({ entryPoint }: { entryPoint: string }) => {
    remotion.bundles.push(entryPoint);
    if (remotion.bundleFailures > 0) {
      remotion.bundleFailures -= 1;
      throw new Error('Webpack failed');
    }
    return '/tmp/remotion-bundle';
  },
}));

vi.mock('@remotion/renderer', () => ({
  makeCancelSignal: () => {
    const listeners: (() => void)[] = [];
    return {
      cancel: () => {
        for (const listener of listeners) listener();
      },
      cancelSignal: (listener: () => void) => {
        listeners.push(listener);
      },
    };
  },
  renderMedia: (options: {
    cancelSignal: (listener: () => void) => void;
    codec: string;
    composition: { height: number; width: number };
    concurrency: number | string | null;
    inputProps: Record<string, unknown>;
    onProgress: (update: { progress: number }) => void;
    outputLocation: string | null;
    serveUrl: string;
  }) => {
    const record: RenderRecord = {
      codec: options.codec,
      concurrency: options.concurrency,
      height: options.composition.height,
      inputProps: options.inputProps,
      outcome: 'running',
      outputLocation: options.outputLocation,
      serveUrl: options.serveUrl,
      width: options.composition.width,
    };
    remotion.renders.push(record);
    return new Promise<void>((resolve, reject) => {
      options.cancelSignal(() => {
        record.outcome = 'cancelled';
        reject(new Error('renderer cancelled'));
      });
      if (!remotion.isRenderHanging) {
        options.onProgress({ progress: 0.5 });
        options.onProgress({ progress: 1 });
        record.outcome = 'finished';
        resolve();
      }
    });
  },
  selectComposition: async ({ id }: { id: string }) => {
    remotion.selections.push(id);
    await remotion.selectionGate;
    return { durationInFrames: 300, fps: 30, height: 1920, id, width: 1080 };
  },
}));

import { BRANDED_AVATAR_RENDER_FIXTURE } from '@files/services/remotion/fixtures/branded-avatar.fixture';
import type { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';
import {
  EditorRenderCancelledError,
  EditorRenderTimeoutError,
  RemotionRendererService,
} from '@files/services/remotion/remotion-renderer.service';
import {
  EDITOR_RENDER_TIMEOUT_MS,
  EDITOR_RENDERER_VERSION,
  type IEditorRenderJobParams,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { VERSION as INSTALLED_REMOTION_VERSION } from 'remotion/version';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const params = BRANDED_AVATAR_RENDER_FIXTURE;

describe('RemotionRendererService', () => {
  let activeRenders: Map<string, () => void>;
  let bundleSources: unknown[];
  let service: RemotionRendererService;

  const record = (progress: number) => {
    remotion.progress.push(progress);
  };
  const cancelJob = (jobId: string) => activeRenders.get(jobId)?.();

  beforeEach(() => {
    remotion.bundleFailures = 0;
    remotion.bundles = [];
    remotion.hasPrebuiltBundle = false;
    remotion.isRenderHanging = false;
    remotion.progress = [];
    remotion.renders = [];
    remotion.selectionGate = undefined;
    remotion.selections = [];
    activeRenders = new Map();
    bundleSources = [];

    // Cancellation requests reach whichever render registered the job id.
    const cancellations = {
      register: (jobId: string, cancel: () => void) => {
        activeRenders.set(jobId, cancel);
        return () => {
          activeRenders.delete(jobId);
        };
      },
    };
    service = new RemotionRendererService(
      {
        log: (_message: string, context: { bundleSource: string }) => {
          bundleSources.push(context.bundleSource);
        },
      } as unknown as LoggerService,
      cancellations as unknown as RemotionRenderCancellationService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the installed remotion version aligned with EDITOR_RENDERER_VERSION', () => {
    expect(`remotion@${INSTALLED_REMOTION_VERSION}`).toBe(
      EDITOR_RENDERER_VERSION,
    );
  });

  it('renders the pinned composition at its size with bounded concurrency', async () => {
    await service.render(params, '/tmp/output.mp4', record);

    expect(remotion.selections).toEqual(['EditorComposition']);
    expect(remotion.renders).toEqual([
      {
        codec: 'h264',
        concurrency: 1,
        height: 1920,
        inputProps: { snapshot: params.snapshot },
        outcome: 'finished',
        outputLocation: '/tmp/output.mp4',
        serveUrl: '/tmp/remotion-bundle',
        width: 1080,
      },
    ]);
    expect(remotion.progress).toEqual([0.5, 1]);
    expect(activeRenders.size).toBe(0);
  });

  it('bundles the composition once and reuses it across render jobs', async () => {
    await service.render(params, '/tmp/first.mp4', record);
    await service.render(params, '/tmp/second.mp4', record);

    expect(remotion.bundles).toHaveLength(1);
    expect(
      remotion.renders.map(({ outputLocation }) => outputLocation),
    ).toEqual(['/tmp/first.mp4', '/tmp/second.mp4']);
  });

  it('bundles again on the next job after a failed bundle', async () => {
    remotion.bundleFailures = 1;

    await expect(
      service.render(params, '/tmp/first.mp4', record),
    ).rejects.toThrow('Webpack failed');
    await service.render(params, '/tmp/second.mp4', record);

    expect(remotion.bundles).toHaveLength(2);
    expect(
      remotion.renders.map(({ outputLocation }) => outputLocation),
    ).toEqual(['/tmp/second.mp4']);
  });

  it('serves a prebuilt bundle without bundling at runtime', async () => {
    remotion.hasPrebuiltBundle = true;

    await service.render(params, '/tmp/output.mp4', record);

    expect(remotion.bundles).toEqual([]);
    expect(bundleSources).toEqual(['prebuilt']);
    expect(remotion.renders[0]?.serveUrl).toMatch(/remotion-bundle$/);
  });

  it('rejects a job for a different renderer version', async () => {
    const staleJob = {
      ...params,
      rendererVersion: 'remotion@0.0.0',
    } as unknown as IEditorRenderJobParams;

    await expect(
      service.render(staleJob, '/tmp/output.mp4', record),
    ).rejects.toThrow('Unsupported editor renderer version');
    expect(remotion.renders).toEqual([]);
  });

  it('cooperatively cancels an active renderer process', async () => {
    remotion.isRenderHanging = true;

    const render = service.render(params, '/tmp/output.mp4', record, 'job-123');
    await vi.waitFor(() => expect(remotion.renders).toHaveLength(1));
    cancelJob('job-123');

    await expect(render).rejects.toBeInstanceOf(EditorRenderCancelledError);
    expect(remotion.renders[0]?.outcome).toBe('cancelled');
    expect(activeRenders.size).toBe(0);
  });

  it('never starts rendering when cancelled while choosing the composition', async () => {
    let releaseSelection: () => void = () => undefined;
    remotion.selectionGate = new Promise((resolve) => {
      releaseSelection = resolve;
    });

    const render = service.render(params, '/tmp/output.mp4', record, 'job-123');
    const cancelled = expect(render).rejects.toBeInstanceOf(
      EditorRenderCancelledError,
    );
    await vi.waitFor(() => expect(remotion.selections).toHaveLength(1));
    cancelJob('job-123');
    await cancelled;
    releaseSelection();
    await remotion.selectionGate;
    await Promise.resolve();

    expect(remotion.renders).toEqual([]);
  });

  it('stops a render that runs past the overall deadline', async () => {
    vi.useFakeTimers();
    remotion.isRenderHanging = true;

    const render = service.render(params, '/tmp/output.mp4', record);
    const timedOut = expect(render).rejects.toBeInstanceOf(
      EditorRenderTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(EDITOR_RENDER_TIMEOUT_MS);

    await timedOut;
    expect(remotion.renders[0]?.outcome).toBe('cancelled');
  });
});
