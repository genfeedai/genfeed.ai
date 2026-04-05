import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  ensurePathInsideDataDir,
  getWorkflowOutputDir,
  EDITOR_WORKFLOW_ID,
} from '@/lib/core-storage';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
const REMOTION_COMPOSITION_ID = 'CoreEditorComposition';

async function loadRemotionServerModules() {
  const dynamicImport = new Function('specifier', 'return import(specifier);') as (
    specifier: string
  ) => Promise<unknown>;

  const bundlerModule = (await dynamicImport('@remotion/bundler')) as {
    bundle: typeof import('@remotion/bundler').bundle;
  };
  const rendererModule = (await dynamicImport('@remotion/renderer')) as {
    renderMedia: typeof import('@remotion/renderer').renderMedia;
    selectComposition: typeof import('@remotion/renderer').selectComposition;
  };

  return {
    bundle: bundlerModule.bundle,
    renderMedia: rendererModule.renderMedia,
    selectComposition: rendererModule.selectComposition,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const compositionInput = body.composition;

    if (
      !compositionInput ||
      !Array.isArray(compositionInput.items) ||
      !compositionInput.items.length
    ) {
      return NextResponse.json({ error: 'Composition items are required' }, { status: 400 });
    }

    const { bundle, renderMedia, selectComposition } = await loadRemotionServerModules();
    const entryPoint = path.join(process.cwd(), 'src/remotion/Root.tsx');
    const bundleLocation = await bundle({
      entryPoint,
      onProgress: () => undefined,
    });

    const composition = await selectComposition({
      id: REMOTION_COMPOSITION_ID,
      inputProps: { composition: compositionInput },
      serveUrl: bundleLocation,
    });

    const outputDir = getWorkflowOutputDir(EDITOR_WORKFLOW_ID);
    await mkdir(outputDir, { recursive: true });
    const fileName = `composition-${randomUUID()}.mp4`;
    const outputLocation = ensurePathInsideDataDir(path.join(outputDir, fileName));

    await renderMedia({
      codec: 'h264',
      composition,
      inputProps: { composition: compositionInput },
      outputLocation,
      overwrite: true,
      serveUrl: bundleLocation,
    });

    return NextResponse.json({
      name: fileName,
      path: `${EDITOR_WORKFLOW_ID}/output/${fileName}`,
    });
  } catch (error) {
    logger.error('Editor render error', error, { context: 'api/editor/render' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to render composition' },
      { status: 500 }
    );
  }
}
