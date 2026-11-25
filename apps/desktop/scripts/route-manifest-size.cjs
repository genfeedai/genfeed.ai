const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_FILE = 'page_client-reference-manifest.js';

// Next writes one client-reference manifest per page, listing every client
// component the page can load. A page that imports a big shared barrel lists
// the whole barrel, so the manifest is a cheap measure of that import.
function listRouteManifests(appServerDirectory) {
  const manifests = [];
  const queue = [appServerDirectory];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!fs.existsSync(current)) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile() && entry.name === MANIFEST_FILE) {
        manifests.push({
          bytes: fs.statSync(absolutePath).size,
          route: `/${path.relative(appServerDirectory, path.dirname(absolutePath)).split(path.sep).join('/')}`,
        });
      }
    }
  }

  return manifests.sort((left, right) => right.bytes - left.bytes);
}

// Routes over `limitBytes`, largest first.
function findOversizedManifests(manifests, limitBytes) {
  return manifests.filter((manifest) => manifest.bytes > limitBytes);
}

module.exports = { findOversizedManifests, listRouteManifests };
