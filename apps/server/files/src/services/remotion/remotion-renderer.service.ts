import { existsSync } from 'node:fs';
import path from 'node:path';
import { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';
import {
  EDITOR_RENDER_TIMEOUT_MS,
  EDITOR_RENDERER_VERSION,
  type IEditorRenderJobParams,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from '@remotion/renderer';
import { VERSION as INSTALLED_REMOTION_VERSION } from 'remotion/version';

const COMPOSITION_ID = 'EditorComposition';

export class EditorRenderCancelledError extends Error {
  constructor() {
    super('Editor render was cancelled.');
    this.name = EditorRenderCancelledError.name;
  }
}

export class EditorRenderTimeoutError extends Error {
  constructor() {
    super('Editor render exceeded its time limit.');
    this.name = EditorRenderTimeoutError.name;
  }
}

@Injectable()
export class RemotionRendererService {
  private bundlePromise?: Promise<string>;

  constructor(
    private readonly logger: LoggerService,
    private readonly cancellationService: RemotionRenderCancellationService,
  ) {}

  async render(
    params: IEditorRenderJobParams,
    outputLocation: string,
    onProgress: (progress: number) => void,
    jobId: string = params.snapshot.projectId,
  ): Promise<void> {
    const expectedVersion = EDITOR_RENDERER_VERSION.replace('remotion@', '');
    if (INSTALLED_REMOTION_VERSION !== expectedVersion) {
      throw new Error(
        `Installed Remotion version ${INSTALLED_REMOTION_VERSION} does not match ${expectedVersion}.`,
      );
    }
    if (params.rendererVersion !== EDITOR_RENDERER_VERSION) {
      throw new Error(
        `Unsupported editor renderer version: ${params.rendererVersion}`,
      );
    }

    const renderCancellation = makeCancelSignal();
    let rejectLifecycle: ((error: Error) => void) | undefined;
    const lifecycleAbort = new Promise<never>((_resolve, reject) => {
      rejectLifecycle = reject;
    });
    const cancel = () => {
      renderCancellation.cancel();
      rejectLifecycle?.(new EditorRenderCancelledError());
    };
    const unregister = this.cancellationService.register(jobId, cancel);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const renderOperation = (async () => {
        const serveUrl = await this.getBundle();
        const inputProps = { snapshot: params.snapshot };
        const composition = await selectComposition({
          id: COMPOSITION_ID,
          inputProps,
          serveUrl,
        });
        timeoutId = setTimeout(() => {
          renderCancellation.cancel();
          rejectLifecycle?.(new EditorRenderTimeoutError());
        }, EDITOR_RENDER_TIMEOUT_MS);

        await renderMedia({
          audioCodec: 'aac',
          cancelSignal: renderCancellation.cancelSignal,
          chromiumOptions: { enableMultiProcessOnLinux: true },
          codec: 'h264',
          composition,
          concurrency: 1,
          disallowParallelEncoding: true,
          inputProps,
          logLevel: 'warn',
          offthreadVideoThreads: 1,
          onProgress: ({ progress }) => onProgress(progress),
          outputLocation,
          overwrite: true,
          serveUrl,
          timeoutInMilliseconds: EDITOR_RENDER_TIMEOUT_MS,
        });
      })();

      await Promise.race([renderOperation, lifecycleAbort]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      unregister();
    }
  }

  private getBundle(): Promise<string> {
    this.bundlePromise ??= this.createBundle().catch((error: unknown) => {
      this.bundlePromise = undefined;
      throw error;
    });
    return this.bundlePromise;
  }

  private async createBundle(): Promise<string> {
    const prebuiltBundle = this.resolvePrebuiltBundle();
    if (prebuiltBundle) {
      this.logger.log('Using prebuilt editor Remotion bundle', {
        bundleSource: 'prebuilt',
        rendererVersion: EDITOR_RENDERER_VERSION,
      });
      return prebuiltBundle;
    }

    const entryPoint = this.resolveEntryPoint();
    this.logger.log('Bundling pinned editor Remotion composition', {
      bundleSource: 'runtime',
      rendererVersion: EDITOR_RENDERER_VERSION,
    });

    return bundle({
      entryPoint,
      publicDir: null,
      rootDir: path.resolve(path.dirname(entryPoint), '../..'),
      webpackOverride: (config) => config,
    });
  }

  private resolvePrebuiltBundle(): string | undefined {
    const candidates = [
      path.resolve(process.cwd(), 'remotion-bundle'),
      path.resolve(process.cwd(), 'apps/server/files/remotion-bundle'),
    ];

    return candidates.find((candidate) =>
      existsSync(path.join(candidate, 'index.html')),
    );
  }

  private resolveEntryPoint(): string {
    const candidates = [
      path.resolve(process.cwd(), 'src/remotion/index.tsx'),
      path.resolve(process.cwd(), 'apps/server/files/src/remotion/index.tsx'),
    ];
    const entryPoint = candidates.find((candidate) => existsSync(candidate));

    if (!entryPoint) {
      throw new Error(
        `Editor Remotion entry point is missing. Checked: ${candidates.join(', ')}`,
      );
    }

    return entryPoint;
  }
}
