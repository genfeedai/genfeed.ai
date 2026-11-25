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

// `next build` prerenders a `<route>.segments` directory next to every static
// route. Its `_full.segment.rsc` (~13 MiB over all routes) is only requested
// by the client-resume script that Next inlines into the prerendered HTML of
// "static fallback" shells (routes with dynamic params), and by the dev-only
// instant-navigation test bootstrap. Routes whose `.html` carries no such
// script never request it, so drop it there and keep it wherever the HTML
// asks for it. `_tree`, per-segment payloads, `.html`, `.rsc` and `.meta` stay.
const CLIENT_RESUME_MARKER = '__NEXT_CLIENT_RESUME';
const SEGMENTS_SUFFIX = '.segments';
const FULL_SEGMENT_FILE = '_full.segment.rsc';

function htmlRequestsFullSegment(htmlPath) {
  return (
    !fs.existsSync(htmlPath) ||
    fs.readFileSync(htmlPath, 'utf8').includes(CLIENT_RESUME_MARKER)
  );
}

function pruneFullSegmentPayloads(serverDirectory) {
  const appDirectory = path.join(serverDirectory, '.next', 'server', 'app');

  if (!fs.existsSync(appDirectory)) {
    return 0;
  }

  let removedBytes = 0;
  const queue = [appDirectory];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (!entry.isDirectory()) {
        continue;
      }

      if (!entry.name.endsWith(SEGMENTS_SUFFIX)) {
        queue.push(absolutePath);
        continue;
      }

      const htmlPath = path.join(
        current,
        `${entry.name.slice(0, -SEGMENTS_SUFFIX.length)}.html`,
      );
      const fullSegmentPath = path.join(absolutePath, FULL_SEGMENT_FILE);

      if (
        fs.existsSync(fullSegmentPath) &&
        !htmlRequestsFullSegment(htmlPath)
      ) {
        removedBytes += removePath(fullSegmentPath);
      }
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

// Next writes its build manifests and the per-route `.meta` files
// pretty-printed. The server reads all of them through `JSON.parse`, so
// re-serialising them without whitespace changes no value it sees. Files that
// do not parse, or would not shrink, are left untouched.
const COMPACTABLE_EXTENSIONS = new Set(['.json', '.meta']);

function compactBuildJson(nextDirectory) {
  if (!fs.existsSync(nextDirectory)) {
    return 0;
  }

  let savedBytes = 0;
  const queue = [nextDirectory];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (
        !entry.isFile() ||
        !COMPACTABLE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        continue;
      }

      const original = fs.readFileSync(absolutePath, 'utf8');
      let compact;

      try {
        compact = JSON.stringify(JSON.parse(original));
      } catch {
        continue;
      }

      if (Buffer.byteLength(compact) < Buffer.byteLength(original)) {
        fs.writeFileSync(absolutePath, compact);
        savedBytes += Buffer.byteLength(original) - Buffer.byteLength(compact);
      }
    }
  }

  return savedBytes;
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
  compactBuildJson,
  listTracedSourceFiles,
  pruneBuildTraceFiles,
  pruneFullSegmentPayloads,
  pruneTracedSourceFiles,
  pruneUnusedNextRuntimeFiles,
};
