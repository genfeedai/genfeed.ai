import { watch, type FSWatcher } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import tailwindcss from '@tailwindcss/postcss';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const EXTENSION_ROOT = path.join(
  REPO_ROOT,
  'apps/extensions/browser/app',
);
const INPUT_PATH = path.join(EXTENSION_ROOT, 'src/tailwind.css');
const DEFAULT_OUTPUT_PATH = path.join(
  EXTENSION_ROOT,
  'src/style.generated.css',
);
const GENERATED_FILENAME = path.basename(DEFAULT_OUTPUT_PATH);

const extensionRequire = createRequire(
  path.join(EXTENSION_ROOT, 'package.json'),
);
const postcss = extensionRequire('postcss') as typeof import('postcss');

export async function buildExtensionThemeCss(
  outputPath = DEFAULT_OUTPUT_PATH,
): Promise<string> {
  const source = await readFile(INPUT_PATH, 'utf8');
  const result = await postcss.default([
    tailwindcss({
      base: EXTENSION_ROOT,
      optimize: { minify: true },
    }),
  ]).process(source, {
    from: INPUT_PATH,
    to: outputPath,
  });

  await writeFile(outputPath, result.css, 'utf8');
  return result.css;
}

export async function watchExtensionThemeCss(): Promise<() => void> {
  await buildExtensionThemeCss();

  const watchTargets = [
    path.join(EXTENSION_ROOT, 'src'),
    path.join(REPO_ROOT, 'packages/ui/src/primitives'),
    path.join(REPO_ROOT, 'packages/ui/web-tokens.css'),
    path.join(
      REPO_ROOT,
      'packages/ui/node_modules/@shipshitdev/ui/dist',
    ),
  ];
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let buildQueue = Promise.resolve();

  const queueBuild = (filename: string | null): void => {
    if (filename?.endsWith(GENERATED_FILENAME)) {
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      buildQueue = buildQueue
        .then(async () => {
          await buildExtensionThemeCss();
          console.info('[extension-theme] rebuilt Tailwind CSS');
        })
        .catch((error: unknown) => {
          console.error('[extension-theme] Tailwind build failed', error);
        });
    }, 100);
  };

  for (const target of watchTargets) {
    const watcher = watch(
      target,
      { recursive: true },
      (_eventType, filename) => queueBuild(filename),
    );
    watchers.push(watcher);
  }

  return () => {
    clearTimeout(debounceTimer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

function readOutputArgument(): string | undefined {
  const outputIndex = process.argv.indexOf('--output');
  return outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
}

if (import.meta.main) {
  if (process.argv.includes('--watch')) {
    await watchExtensionThemeCss();
  } else {
    await buildExtensionThemeCss(readOutputArgument());
  }
}
