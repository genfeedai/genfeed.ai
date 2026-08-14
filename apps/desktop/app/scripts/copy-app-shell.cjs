#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
// Electron embeds the canonical product app; no desktop-local Next app remains.
const appRoot = path.resolve(desktopRoot, '../../app');
const standaloneRoot = path.join(appRoot, '.next', 'standalone');
const staticRoot = path.join(appRoot, '.next', 'static');
const publicRoot = path.join(appRoot, 'public');
const outputRoot = path.join(desktopRoot, 'dist', 'app-shell');

function copyDirectory(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function copyNodeModuleEntries(sourceRoot, destinationRoot) {
  if (!fs.existsSync(sourceRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === '.bun') {
      continue;
    }

    const source = path.join(sourceRoot, entry.name);

    if (entry.name.startsWith('@')) {
      for (const scopedEntry of fs.readdirSync(source, {
        withFileTypes: true,
      })) {
        const destination = path.join(
          destinationRoot,
          entry.name,
          scopedEntry.name,
        );

        if (!fs.existsSync(destination)) {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.cpSync(path.join(source, scopedEntry.name), destination, {
            dereference: true,
            force: true,
            recursive: true,
          });
        }
      }
      continue;
    }

    const destination = path.join(destinationRoot, entry.name);

    if (!fs.existsSync(destination)) {
      fs.cpSync(source, destination, {
        dereference: true,
        force: true,
        recursive: true,
      });
    }
  }
}

function compactStandaloneDependencies(root) {
  const nodeModulesRoot = path.join(root, 'node_modules');
  const bunHoistedRoot = path.join(nodeModulesRoot, '.bun', 'node_modules');

  if (!fs.existsSync(bunHoistedRoot)) {
    return;
  }

  const compactRoot = path.join(root, 'node_modules.compact');
  fs.rmSync(compactRoot, { force: true, recursive: true });
  fs.mkdirSync(compactRoot, { recursive: true });

  // Preserve the direct standalone dependencies first, then fill their
  // transitive runtime graph from Bun's hoisted store. Copying with
  // dereference=true converts Bun's workspace symlinks into a portable tree.
  copyNodeModuleEntries(nodeModulesRoot, compactRoot);
  copyNodeModuleEntries(bunHoistedRoot, compactRoot);

  fs.rmSync(nodeModulesRoot, { force: true, recursive: true });
  fs.renameSync(compactRoot, nodeModulesRoot);

  // Next is already available from the compact root. The nested copy is a
  // second dereferenced instance of the same package and is never required by
  // Node's ancestor lookup from apps/app/server.js.
  fs.rmSync(path.join(root, 'apps', 'app', 'node_modules'), {
    force: true,
    recursive: true,
  });
}

function copyNextRuntimeDependency(root, packageName) {
  const nextPackageRoot = path.dirname(
    require.resolve('next/package.json', { paths: [appRoot] }),
  );
  const sourceRoot = path.dirname(
    require.resolve(`${packageName}/package.json`, {
      paths: [nextPackageRoot],
    }),
  );
  const destinationRoot = path.join(
    root,
    'node_modules',
    ...packageName.split('/'),
  );

  fs.rmSync(destinationRoot, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(destinationRoot), { recursive: true });
  fs.cpSync(sourceRoot, destinationRoot, {
    dereference: true,
    force: true,
    recursive: true,
  });
}

function pruneDisabledImageOptimizer(root) {
  const nodeModulesRoot = path.join(root, 'node_modules');
  const sharpPackagesRoot = path.join(nodeModulesRoot, '@img');

  // Next declares sharp as an optional dependency even when its image
  // optimizer is disabled. Bun's standalone tree therefore still carries the
  // wrapper and every platform-specific libvips package unless we remove them
  // from this desktop-only bundle.
  fs.rmSync(path.join(nodeModulesRoot, 'sharp'), {
    force: true,
    recursive: true,
  });
  fs.rmSync(sharpPackagesRoot, { force: true, recursive: true });
}

function findServerDirectory(root) {
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name === 'server.js') {
        return path.dirname(absolutePath);
      }
    }
  }

  return null;
}

if (!fs.existsSync(standaloneRoot)) {
  throw new Error(`Standalone app shell not found at ${standaloneRoot}`);
}

fs.rmSync(outputRoot, { force: true, recursive: true });
copyDirectory(standaloneRoot, outputRoot);
compactStandaloneDependencies(outputRoot);
// Next 16.3.1 ships a newer nested SWC helper than Bun's hoisted workspace
// copy. Standalone tracing can retain the package link but lose its target
// while the tree is compacted, so materialize Next's exact runtime dependency.
copyNextRuntimeDependency(outputRoot, '@swc/helpers');
pruneDisabledImageOptimizer(outputRoot);

const serverDirectory = findServerDirectory(standaloneRoot);

if (!serverDirectory) {
  throw new Error(`Could not locate server.js inside ${standaloneRoot}`);
}

const relativeServerDirectory = path.relative(standaloneRoot, serverDirectory);

if (fs.existsSync(staticRoot)) {
  copyDirectory(
    staticRoot,
    path.join(outputRoot, relativeServerDirectory, '.next', 'static'),
  );
}

if (fs.existsSync(publicRoot)) {
  copyDirectory(
    publicRoot,
    path.join(outputRoot, relativeServerDirectory, 'public'),
  );
}
