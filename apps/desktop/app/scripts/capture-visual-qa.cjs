const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const releaseDirectory = path.resolve(__dirname, '..', 'release');
const outputDirectory = path.resolve(__dirname, '..', 'visual-qa');

function findPackagedApp(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = findPackagedApp(entryPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

const appPath = findPackagedApp(releaseDirectory);
if (!appPath) {
  throw new Error(`No packaged .app found under ${releaseDirectory}`);
}

const executableDirectory = path.join(appPath, 'Contents', 'MacOS');
const executable = fs
  .readdirSync(executableDirectory, { withFileTypes: true })
  .find((entry) => entry.isFile());

if (!executable) {
  throw new Error(`No packaged executable found under ${executableDirectory}`);
}

fs.rmSync(outputDirectory, { force: true, recursive: true });

const child = spawn(
  path.join(executableDirectory, executable.name),
  ['--visual-qa'],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      GENFEED_DESKTOP_VISUAL_QA: '1',
      GENFEED_DESKTOP_VISUAL_QA_DIR: outputDirectory,
    },
    stdio: 'inherit',
  },
);

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }, 5_000).unref();
}, 60_000);

child.on('error', (error) => {
  clearTimeout(timeout);
  process.stderr.write(`Desktop visual QA failed to start: ${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (code !== 0) {
    process.stderr.write(
      `Desktop visual QA exited with ${String(code)}${signal ? ` (${signal})` : ''}.\n`,
    );
    process.exit(code ?? 1);
  }

  const expected = [
    'account-less-workspace.png',
    'first-run.png',
    'reconnect-consent.png',
    'returning-account-less.png',
  ];
  const missing = expected.filter(
    (filename) => !fs.existsSync(path.join(outputDirectory, filename)),
  );
  if (missing.length > 0) {
    throw new Error(`Missing visual QA screenshots: ${missing.join(', ')}`);
  }

  const hashes = new Set();
  for (const filename of expected) {
    const screenshot = fs.readFileSync(path.join(outputDirectory, filename));
    if (screenshot.byteLength < 10_000) {
      throw new Error(
        `Visual QA screenshot is unexpectedly small: ${filename}`,
      );
    }
    hashes.add(crypto.createHash('sha256').update(screenshot).digest('hex'));
  }

  if (hashes.size < 3) {
    throw new Error(
      'Visual QA screenshots do not prove three distinct desktop states.',
    );
  }
});
