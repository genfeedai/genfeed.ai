#!/usr/bin/env node

const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const electronRoot = path.dirname(require.resolve('electron/package.json'));
const pathFile = path.join(electronRoot, 'path.txt');
const electronRequire = createRequire(path.join(electronRoot, 'install.js'));
const { downloadArtifact } = electronRequire('@electron/get');
const checksums = electronRequire('./checksums.json');
const { version } = electronRequire('./package');
const platformPath = getPlatformPath();

function hasInstalledBinary() {
  try {
    const installedVersion = fs
      .readFileSync(path.join(electronRoot, 'dist', 'version'), 'utf8')
      .replace(/^v/, '')
      .trim();
    const installedPath = fs.readFileSync(pathFile, 'utf8');
    const electronPath =
      process.env.ELECTRON_OVERRIDE_DIST_PATH ||
      path.join(electronRoot, 'dist', platformPath);

    return (
      installedVersion === version &&
      installedPath === platformPath &&
      fs.existsSync(electronPath)
    );
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main() {
  if (hasInstalledBinary()) {
    return;
  }

  const platform =
    process.env.ELECTRON_INSTALL_PLATFORM ||
    process.env.npm_config_platform ||
    process.platform;
  const arch = getInstallArch(platform);
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    force: process.env.force_no_cache === 'true',
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums ||
      process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : checksums,
    platform,
    arch,
  });
  const distPath =
    process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(electronRoot, 'dist');

  fs.rmSync(distPath, { force: true, recursive: true });
  extractArchive(zipPath, distPath);

  const srcTypeDefPath = path.join(distPath, 'electron.d.ts');
  const targetTypeDefPath = path.join(electronRoot, 'electron.d.ts');

  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  }

  await fs.promises.writeFile(pathFile, platformPath);

  if (!hasInstalledBinary()) {
    fail(`Electron binary install did not produce ${pathFile}`);
  }
}

function extractArchive(zipPath, distPath) {
  if (process.platform === 'win32') {
    try {
      childProcess.execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Expand-Archive',
          '-LiteralPath',
          zipPath,
          '-DestinationPath',
          distPath,
          '-Force',
        ],
        { stdio: 'inherit' },
      );
      return;
    } catch (error) {
      fail(
        error instanceof Error
          ? `Failed to extract Electron archive with PowerShell: ${error.message}`
          : 'Failed to extract Electron archive with PowerShell.',
      );
    }
  }

  try {
    childProcess.execFileSync('unzip', ['-q', '-o', zipPath, '-d', distPath], {
      stdio: 'inherit',
    });
  } catch (error) {
    fail(
      error instanceof Error
        ? `Failed to extract Electron archive: ${error.message}`
        : 'Failed to extract Electron archive.',
    );
  }
}

function getInstallArch(platform) {
  const arch =
    process.env.ELECTRON_INSTALL_ARCH ||
    process.env.npm_config_arch ||
    process.arch;

  if (
    platform === 'darwin' &&
    process.platform === 'darwin' &&
    arch === 'x64' &&
    process.env.npm_config_arch === undefined
  ) {
    try {
      const output = childProcess.execSync('sysctl -in sysctl.proc_translated');

      if (output.toString().trim() === '1') {
        return 'arm64';
      }
    } catch {
      return arch;
    }
  }

  return arch;
}

function getPlatformPath() {
  const platform =
    process.env.ELECTRON_INSTALL_PLATFORM ||
    process.env.npm_config_platform ||
    os.platform();

  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(
        `Electron builds are not available on platform: ${platform}`,
      );
  }
}

const keepAlive = setInterval(() => {}, 1000);

main()
  .then(() => {
    clearInterval(keepAlive);
  })
  .catch((error) => {
    clearInterval(keepAlive);
    fail(error instanceof Error ? error.stack || error.message : String(error));
  });
