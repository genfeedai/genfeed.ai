#!/usr/bin/env node

const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(desktopRoot, 'release');
const packageJsonPath = path.join(desktopRoot, 'package.json');
const manifestPath = path.join(releaseRoot, 'genfeed-desktop-release.json');

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function readGitValue(args, fallback) {
  try {
    return execSync(`git ${args}`, {
      cwd: desktopRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

function getReleaseChannel() {
  const refName = process.env.GITHUB_REF_NAME || '';

  if (refName.startsWith('desktop-v')) {
    return 'desktop-tag';
  }

  if (process.env.GITHUB_ACTIONS) {
    return 'workflow-dispatch';
  }

  return 'local';
}

function getArtifactSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listReleaseArtifacts() {
  if (!fs.existsSync(releaseRoot)) {
    return [];
  }

  return fs
    .readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name !== path.basename(manifestPath))
    .filter((entry) => /\.(dmg|zip|blockmap)$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const filePath = path.join(releaseRoot, entry.name);
      const stat = fs.statSync(filePath);

      return {
        name: entry.name,
        sha256: getArtifactSha256(filePath),
        sizeBytes: stat.size,
      };
    });
}

function writeManifest() {
  const packageJson = readPackageJson();
  const build = packageJson.build || {};
  const mac = build.mac || {};
  const gitCommit =
    process.env.GITHUB_SHA || readGitValue('rev-parse HEAD', 'unknown');
  const gitTag =
    process.env.GITHUB_REF_NAME ||
    readGitValue('describe --tags --exact-match', '');

  const manifest = {
    appId: build.appId,
    artifactName: build.artifactName,
    artifacts: listReleaseArtifacts(),
    channel: getReleaseChannel(),
    commit: gitCommit,
    generatedAt: new Date().toISOString(),
    mac: {
      category: mac.category,
      hardenedRuntime: mac.hardenedRuntime === true,
      notarization: {
        afterSign: build.afterSign,
        requiredEnvironment: [
          'APPLE_ID',
          'APPLE_APP_SPECIFIC_PASSWORD',
          'APPLE_TEAM_ID',
        ],
      },
      signing: {
        certificateEnvironment: [
          'APPLE_SIGNING_CERTIFICATE_BASE64',
          'APPLE_SIGNING_CERTIFICATE_PASSWORD',
        ],
        entitlements: mac.entitlements,
      },
      targets: mac.target || [],
    },
    productName: packageJson.productName,
    release: process.env.GENFEED_DESKTOP_RELEASE || gitCommit,
    tag: gitTag || null,
    version: packageJson.version,
  };

  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote desktop release manifest to ${manifestPath}\n`);
}

writeManifest();
