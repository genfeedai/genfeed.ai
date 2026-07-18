import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  EDITOR_RENDERER_VERSION,
  type IEditorRenderJobParams,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const COMPOSITION_ID = 'EditorComposition';

@Injectable()
export class RemotionRendererService {
  private bundlePromise?: Promise<string>;

  constructor(private readonly logger: LoggerService) {}

  async render(
    params: IEditorRenderJobParams,
    outputLocation: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    if (params.rendererVersion !== EDITOR_RENDERER_VERSION) {
      throw new Error(
        `Unsupported editor renderer version: ${params.rendererVersion}`,
      );
    }

    const serveUrl = await this.getBundle();
    const inputProps = { snapshot: params.snapshot };
    const composition = await selectComposition({
      id: COMPOSITION_ID,
      inputProps,
      serveUrl,
    });

    await renderMedia({
      audioCodec: 'aac',
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
      timeoutInMilliseconds: 120000,
    });
  }

  private getBundle(): Promise<string> {
    this.bundlePromise ??= this.createBundle().catch((error: unknown) => {
      this.bundlePromise = undefined;
      throw error;
    });
    return this.bundlePromise;
  }

  private async createBundle(): Promise<string> {
    const entryPoint = this.resolveEntryPoint();
    this.logger.log('Bundling pinned editor Remotion composition', {
      entryPoint,
      rendererVersion: EDITOR_RENDERER_VERSION,
    });

    return bundle({
      entryPoint,
      publicDir: null,
      rootDir: path.resolve(path.dirname(entryPoint), '../..'),
      webpackOverride: (config) => config,
    });
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
