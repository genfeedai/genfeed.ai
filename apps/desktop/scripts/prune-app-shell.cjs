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

// Next's build-time font fallback helper and its 4 MiB metrics table. Nothing
// in the production server requires them (`next/font` resolves at build time).
const UNUSED_NEXT_RUNTIME_FILES = [
  path.join('dist', 'server', 'capsize-font-metrics.json'),
  path.join('dist', 'server', 'font-utils.js'),
];

function pruneUnusedNextRuntimeFiles(nodeModulesRoot) {
  let removedBytes = 0;

  for (const relativePath of UNUSED_NEXT_RUNTIME_FILES) {
    const absolutePath = path.join(nodeModulesRoot, 'next', relativePath);

    if (fs.existsSync(absolutePath)) {
      removedBytes += fs.statSync(absolutePath).size;
      fs.rmSync(absolutePath, { force: true });
    }
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
  pruneUnusedNextRuntimeFiles,
};
