#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const defaultReleaseRoot = path.join(desktopRoot, 'release');

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function getArtifactSha512(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function updateArtifactMetadata(metadata, artifactName, sha512, sizeBytes) {
  const escapedName = escapeRegularExpression(artifactName);
  const entryPattern = new RegExp(
    `(  - url: ["']?${escapedName}["']?\\r?\\n` +
      `    sha512: )[^\\r\\n]+(\\r?\\n    size: )\\d+`,
    'u',
  );

  if (!entryPattern.test(metadata)) {
    throw new Error(
      `Updater metadata contains no file entry for notarized artifact ${artifactName}.`,
    );
  }

  return metadata.replace(entryPattern, `$1${sha512}$2${sizeBytes}`);
}

function finalizeMacosRelease(releaseRoot = defaultReleaseRoot) {
  const metadataPath = path.join(releaseRoot, 'latest-mac.yml');

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`macOS updater metadata not found at ${metadataPath}`);
  }

  const dmgNames = fs
    .readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
    .map((entry) => entry.name)
    .sort();

  if (dmgNames.length === 0) {
    throw new Error(`No macOS disk images found in ${releaseRoot}`);
  }

  let metadata = fs.readFileSync(metadataPath, 'utf8');

  for (const dmgName of dmgNames) {
    const dmgPath = path.join(releaseRoot, dmgName);
    const sizeBytes = fs.statSync(dmgPath).size;
    const sha512 = getArtifactSha512(dmgPath);

    metadata = updateArtifactMetadata(metadata, dmgName, sha512, sizeBytes);

    // The blockmap describes the pre-staple DMG bytes. Keeping it would make
    // differential downloads fail integrity checks, while macOS updates still
    // use the ZIP and its unchanged blockmap as the canonical update payload.
    fs.rmSync(`${dmgPath}.blockmap`, { force: true });
  }

  fs.writeFileSync(metadataPath, metadata);
  process.stdout.write(
    `Finalized notarized macOS metadata for ${dmgNames.length} disk image(s).\n`,
  );
}

module.exports = {
  finalizeMacosRelease,
  updateArtifactMetadata,
};

if (require.main === module) {
  finalizeMacosRelease();
}
