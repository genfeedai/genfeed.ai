import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import {
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import {
  DEADLINE_MS,
  encodeFrame,
  MAX_DIAGNOSTICS,
  RENDERER_VERSION,
  readFrame,
  validateInput,
} from './protocol.mjs';

// This entrypoint runs exclusively inside the credential-free runsc container.
const output = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => process.stderr.write(...args);
const timeout = setTimeout(() => process.exit(124), DEADLINE_MS);
const allowed = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'remotion',
]);
try {
  const input = validateInput(await readFrame(process.stdin));
  const root = '/tmp/visual-code';
  await mkdir(`${root}/public/assets`, { recursive: true });
  await writeFile(`${root}/VisualComposition.tsx`, input.sourceCode);
  for (const asset of input.assets)
    await writeFile(
      `${root}/public/assets/${asset.id}`,
      Buffer.from(asset.bytes, 'base64'),
    );
  await writeFile(
    `${root}/index.tsx`,
    `import React from 'react';\nimport {Composition,registerRoot} from 'remotion';\nimport {VisualComposition} from './VisualComposition';\nregisterRoot(() => <Composition id="VisualComposition" component={VisualComposition} width={${input.settings.width}} height={${input.settings.height}} fps={${input.settings.fps}} durationInFrames={${input.settings.durationFrames}} defaultProps={${JSON.stringify(input.props)}}/>);`,
  );
  process.stderr.write('visual-stage:bundle-start\n');
  const serveUrl = await bundle({
    entryPoint: `${root}/index.tsx`,
    outDir: `${root}/bundle`,
    publicDir: `${root}/public`,
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, modules: ['/runtime/node_modules'] },
      plugins: [
        ...(config.plugins ?? []),
        {
          apply(compiler) {
            compiler.hooks.normalModuleFactory.tap(
              'VisualCodeImports',
              (factory) => {
                factory.hooks.beforeResolve.tap(
                  'VisualCodeImports',
                  (request) => {
                    if (
                      request?.contextInfo?.issuer ===
                        `${root}/VisualComposition.tsx` &&
                      !allowed.has(request.request)
                    )
                      throw new Error(
                        'Only preinstalled React and Remotion imports are allowed.',
                      );
                  },
                );
              },
            );
          },
        },
      ],
    }),
  });
  const common = {
    serveUrl,
    id: 'VisualComposition',
    inputProps: input.props,
    browserExecutable: '/usr/bin/chromium',
    chromiumOptions: {
      disableWebSecurity: false,
      enableMultiProcessOnLinux: true,
    },
    timeoutInMilliseconds: 30_000,
  };
  process.stderr.write('visual-stage:browser-select-start\n');
  const composition = await selectComposition(common);
  process.stderr.write('visual-stage:browser-selected\n');
  const requests =
    input.mode === 'preview'
      ? [
          0,
          Math.floor((input.settings.durationFrames - 1) / 2),
          input.settings.durationFrames - 1,
        ].map((frame) => ({ format: 'png', frame }))
      : input.outputs;
  const media = [];
  for (const [index, request] of requests.entries()) {
    process.stderr.write(`visual-stage:render-${index}-${request.format}\n`);
    const location = `${root}/output-${index}.${request.format}`;
    if (request.format === 'mp4')
      await renderMedia({
        ...common,
        composition,
        outputLocation: location,
        codec: 'h264',
        audioCodec: 'aac',
        concurrency: 1,
      });
    else
      await renderStill({
        ...common,
        composition,
        output: location,
        frame: request.frame,
        imageFormat: request.format,
      });
    media.push({
      ...request,
      width: input.settings.width,
      height: input.settings.height,
      bytes: (await readFile(location)).toString('base64'),
    });
  }
  output(
    encodeFrame({ rendererVersion: RENDERER_VERSION, media, diagnostics: [] }),
  );
} catch (error) {
  const diagnostic = error instanceof Error ? error.message : 'Render failed';
  const bounded = Buffer.from(diagnostic)
    .subarray(0, MAX_DIAGNOSTICS / 2)
    .toString('utf8');
  output(
    encodeFrame({
      rendererVersion: RENDERER_VERSION,
      media: [],
      diagnostics: [bounded],
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
