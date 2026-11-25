const fs = require('node:fs');
const path = require('node:path');

// Route folders the Desktop app shell never serves. Platform superadmins use
// `/admin` in the browser (`NEXT_PUBLIC_APPS_ADMIN_ENDPOINT`); it is about
// 18 MiB of the packaged shell. Nothing outside the folder imports from it,
// and the shared `src/features/admin` code is tree-shaken once no route
// reaches it.
const DESKTOP_EXCLUDED_ROUTE_DIRECTORIES = [
  path.join('app', '(protected)', 'admin'),
];

// Same filesystem as the app (a rename must not cross devices) and outside
// every tsconfig `include`, which skips `node_modules`.
const STASH_DIRECTORY = path.join('node_modules', '.cache', 'desktop-excluded');

function stashPathFor(appRoot, relativeDirectory) {
  return path.join(
    appRoot,
    STASH_DIRECTORY,
    relativeDirectory.split(path.sep).join('__'),
  );
}

function setAside(appRoot, relativeDirectory) {
  const source = path.join(appRoot, relativeDirectory);
  const stash = stashPathFor(appRoot, relativeDirectory);

  if (fs.existsSync(stash)) {
    throw new Error(
      `A previous Desktop build left ${stash}; restore it before building.`,
    );
  }

  if (!fs.existsSync(source)) {
    throw new Error(`Desktop-excluded route folder is missing: ${source}`);
  }

  fs.mkdirSync(path.dirname(stash), { recursive: true });
  fs.renameSync(source, stash);
}

function putBack(appRoot, relativeDirectory) {
  const source = path.join(appRoot, relativeDirectory);
  const stash = stashPathFor(appRoot, relativeDirectory);

  if (!fs.existsSync(stash)) {
    return false;
  }

  if (fs.existsSync(source)) {
    throw new Error(
      `Cannot restore ${source}: it exists next to its stash ${stash}.`,
    );
  }

  fs.renameSync(stash, source);
  return true;
}

// Moves the excluded route folders out of the Next app for one build and
// returns a function that puts them back. A build killed half way leaves the
// folders in the stash; `restoreExcludedRoutes` brings them back before the
// next run.
function excludeRoutesFromBuild(
  appRoot,
  directories = DESKTOP_EXCLUDED_ROUTE_DIRECTORIES,
) {
  restoreExcludedRoutes(appRoot, directories);

  const moved = [];

  try {
    for (const directory of directories) {
      setAside(appRoot, directory);
      moved.push(directory);
    }
  } catch (error) {
    for (const directory of moved.reverse()) {
      putBack(appRoot, directory);
    }
    throw error;
  }

  let restored = false;

  return function restore() {
    if (restored) {
      return;
    }

    restored = true;
    restoreExcludedRoutes(appRoot, directories);
  };
}

function restoreExcludedRoutes(
  appRoot,
  directories = DESKTOP_EXCLUDED_ROUTE_DIRECTORIES,
) {
  return directories.filter((directory) => putBack(appRoot, directory));
}

module.exports = {
  DESKTOP_EXCLUDED_ROUTE_DIRECTORIES,
  excludeRoutesFromBuild,
  restoreExcludedRoutes,
};
