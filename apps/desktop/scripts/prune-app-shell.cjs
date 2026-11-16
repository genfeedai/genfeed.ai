const fs = require('node:fs');
const path = require('node:path');

// Source and test files Turbopack's standalone trace copies next to the build
// output. Next serves the compiled `.next` output only and never reads them.
const SOURCE_EXTENSIONS = new Set(['.cts', '.mts', '.ts', '.tsx']);
const SOURCE_ROOTS = ['app', 'i18n', 'src', 'tests'];

function isTracedSourceFile(name) {
  return SOURCE_EXTENSIONS.has(path.extname(name)) && !name.endsWith('.d.ts');
}

function removeFilesWhere(directory, shouldRemove) {
  let removedBytes = 0;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      removedBytes += removeFilesWhere(absolutePath, shouldRemove);
    } else if (entry.isFile() && shouldRemove(entry.name)) {
      removedBytes += fs.statSync(absolutePath).size;
      fs.rmSync(absolutePath, { force: true });
    }
  }

  return removedBytes;
}

// `next build` writes one `*.nft.json` file-trace list per route into
// `.next/server`. Only the build-time standalone tracer reads them (Next's
// runtime never loads them).
function pruneBuildTraceFiles(directory) {
  return removeFilesWhere(directory, (name) => name.endsWith('.nft.json'));
}

// Every route's trace pulls in the app's whole TypeScript source tree
// (thousands of files, ~20 MiB) although the packaged server runs the
// compiled output. Declaration files are kept; messages, CSS, fonts and every
// other non-code asset stay untouched.
function pruneTracedSourceFiles(serverDirectory) {
  let removedBytes = 0;

  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(serverDirectory, sourceRoot);

    if (fs.existsSync(absoluteRoot)) {
      removedBytes += removeFilesWhere(absoluteRoot, isTracedSourceFile);
    }
  }

  return removedBytes;
}

// Files inside `node_modules` that the packaged production server never loads.
// Paths are relative to `node_modules`.
const UNUSED_RUNTIME_FILES = [
  // Next's build-time font fallback helper and its 4 MiB metrics table.
  // Nothing in the production server requires them (`next/font` resolves at
  // build time).
  path.join('next', 'dist', 'server', 'capsize-font-metrics.json'),
  path.join('next', 'dist', 'server', 'font-utils.js'),
  // Next's edge sandbox. Only the edge function runner loads it, and the build
  // has no edge functions (empty middleware manifest `functions`).
  path.join('next', 'dist', 'compiled', 'edge-runtime'),
  // `cacheComponents` runs on the experimental React build, so Next's
  // non-experimental app page runtime is never required.
  path.join(
    'next',
    'dist',
    'compiled',
    'next-server',
    'app-page-turbo.runtime.prod.js',
  ),
  // The server renders with Node. React's browser and edge server builds are
  // only picked by the `browser`, `worker` and `workerd` export conditions.
  path.join('react-dom', 'cjs', 'react-dom-server.browser.production.js'),
  path.join('react-dom', 'cjs', 'react-dom-server.edge.production.js'),
  path.join(
    'react-dom',
    'cjs',
    'react-dom-server-legacy.browser.production.js',
  ),
];

// Source map bodies of the service worker; browsers fetch only the worker.
const UNUSED_BUILD_FILES = [
  path.join('.next', 'server', 'app', 'serwist', 'sw.js.map.body'),
];

function removePath(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return 0;
  }

  const removedBytes = fs.statSync(absolutePath).isDirectory()
    ? removeFilesWhere(absolutePath, () => true)
    : fs.statSync(absolutePath).size;
  fs.rmSync(absolutePath, { force: true, recursive: true });

  return removedBytes;
}

function pruneUnusedNextRuntimeFiles(nodeModulesRoot) {
  let removedBytes = 0;

  for (const relativePath of UNUSED_RUNTIME_FILES) {
    removedBytes += removePath(path.join(nodeModulesRoot, relativePath));
  }

  return removedBytes;
}

function pruneUnusedBuildFiles(serverRoot) {
  let removedBytes = 0;

  for (const relativePath of UNUSED_BUILD_FILES) {
    removedBytes += removePath(path.join(serverRoot, relativePath));
  }

  return removedBytes;
}

function listTracedSourceFiles(serverDirectory) {
  const found = [];
  const queue = SOURCE_ROOTS.map((root) => path.join(serverDirectory, root));

  while (queue.length > 0) {
    const current = queue.shift();

    if (!fs.existsSync(current)) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (isTracedSourceFile(entry.name)) {
        found.push(absolutePath);
      }
    }
  }

  return found;
}

module.exports = {
  listTracedSourceFiles,
  pruneBuildTraceFiles,
  pruneTracedSourceFiles,
  pruneUnusedBuildFiles,
  pruneUnusedNextRuntimeFiles,
};
