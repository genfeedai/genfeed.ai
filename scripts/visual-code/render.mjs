import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import {
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { collectBrandFontFaces, rootSource } from './brand-fonts.mjs';
import { validateEvidence } from './protocol.mjs';
import { attachRenderEvidence, sha256Prefixed } from './render-evidence.mjs';

const allowed = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'remotion',
]);

// Runs inside the credential-free runsc container. The defaults are the image
// layout; tests pass local paths to drive the same code against a host browser.
export async function renderVisualComposition(
  input,
  {
    root = '/tmp/visual-code',
    runtimeModules = '/runtime/node_modules',
    browserExecutable = '/usr/bin/chromium',
    log = (line) => process.stderr.write(line),
  } = {},
) {
  let browser;
  try {
    await mkdir(`${root}/public/assets`, { recursive: true });
    await writeFile(`${root}/VisualComposition.tsx`, input.sourceCode);
    const assetHashes = new Map();
    for (const asset of input.assets) {
      const bytes = Buffer.from(asset.bytes, 'base64');
      assetHashes.set(asset.id, sha256Prefixed(bytes));
      await writeFile(`${root}/public/assets/${asset.id}`, bytes);
    }
    await writeFile(
      `${root}/index.tsx`,
      rootSource({
        settings: input.settings,
        props: input.props,
        faces: collectBrandFontFaces(input.assets),
      }),
    );
    log('visual-stage:bundle-start\n');
    const serveUrl = await bundle({
      entryPoint: `${root}/index.tsx`,
      outDir: `${root}/bundle`,
      publicDir: `${root}/public`,
      enableCaching: false,
      webpackOverride: (config) => ({
        ...config,
        cache: false,
        resolve: { ...config.resolve, modules: [runtimeModules] },
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
    for (const [variable, directory] of Object.entries({
      HOME: `${root}/browser-home`,
      XDG_CONFIG_HOME: `${root}/browser-config`,
      XDG_CACHE_HOME: `${root}/browser-cache`,
    })) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      process.env[variable] = directory;
    }
    log('visual-stage:browser-open-start\n');
    browser = await openBrowser('chrome', {
      browserExecutable,
      logLevel: 'verbose',
      chromiumOptions: { enableMultiProcessOnLinux: true },
    });
    log('visual-stage:browser-opened\n');
    // Only exports carry evidence; preview frames are diagnostics for inspection.
    const evidence =
      input.mode === 'export'
        ? attachRenderEvidence(browser, {
            assetHashes,
            width: input.settings.width,
            height: input.settings.height,
          })
        : null;
    const common = {
      puppeteerInstance: browser,
      logLevel: 'verbose',

      serveUrl,
      id: 'VisualComposition',
      inputProps: input.props,
      browserExecutable,
      chromiumOptions: {
        disableWebSecurity: false,
        enableMultiProcessOnLinux: true,
      },
      timeoutInMilliseconds: 30_000,
    };
    log('visual-stage:browser-select-start\n');
    const composition = await selectComposition(common);
    log('visual-stage:browser-selected\n');
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
      log(`visual-stage:render-${index}-${request.format}\n`);
      const location = `${root}/output-${index}.${request.format}`;
      evidence?.begin(request, input.settings);
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
      const observed = evidence?.end() ?? null;
      media.push({
        ...request,
        width: input.settings.width,
        height: input.settings.height,
        bytes: (await readFile(location)).toString('base64'),
        ...(observed ? { evidence: validEvidence(observed) } : {}),
      });
    }
    return media;
  } finally {
    await browser?.close({ silent: true });
  }
}

// Evidence must never fail a render that otherwise succeeded: an observation the
// protocol cannot carry is dropped, which leaves the output without a manifest.
function validEvidence(observed) {
  try {
    return validateEvidence(observed);
  } catch {
    return {
      schemaVersion: 1,
      browser: null,
      frameCount: 1,
      captures: [],
      fontFaces: [],
      assets: [],
      diagnostics: ['evidence_invalid'],
    };
  }
}
