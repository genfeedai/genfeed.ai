#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Four slots fit the 4-vCPU runner; the commands are CPU bound. */
export const DEFAULT_CONCURRENCY = 4;

/**
 * `test:executable-contracts` is one `&&` chain of independent suites. Local
 * runs keep it serial; CI runs the same commands side by side so the Static
 * Checks job costs the slowest suites instead of their sum. The package.json
 * script stays the single list of what runs.
 */
export function readContractCommands(packageJsonPath) {
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const chain = manifest.scripts?.['test:executable-contracts'];
  if (typeof chain !== 'string' || chain.trim() === '') {
    throw new Error('package.json has no test:executable-contracts script');
  }
  return chain
    .split(' && ')
    .map((command) => command.trim())
    .filter(Boolean);
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const chunks = [];
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.once('error', (error) => {
      chunks.push(Buffer.from(`failed to start: ${error.message}\n`));
      resolve({
        command,
        exitCode: 1,
        output: Buffer.concat(chunks).toString('utf8'),
        seconds: (Date.now() - startedAt) / 1000,
        signal: null,
      });
    });
    child.once('close', (exitCode, signal) =>
      resolve({
        command,
        exitCode,
        output: Buffer.concat(chunks).toString('utf8'),
        seconds: (Date.now() - startedAt) / 1000,
        signal,
      }),
    );
  });
}

/**
 * Runs every command to completion with at most `concurrency` in flight, so
 * one red suite never hides another. Results keep the input order.
 */
export async function runCommandsConcurrently(
  commands,
  { concurrency = DEFAULT_CONCURRENCY, cwd = ROOT, onResult = () => {} } = {},
) {
  const results = new Array(commands.length);
  let next = 0;
  async function worker() {
    while (next < commands.length) {
      const index = next++;
      results[index] = await runCommand(commands[index], cwd);
      onResult(results[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, commands.length) }, worker),
  );
  return results;
}

export function isPassed(result) {
  return result.exitCode === 0 && result.signal === null;
}

function summarize(command) {
  return command.length > 100 ? `${command.slice(0, 97)}...` : command;
}

function report(result) {
  const status = isPassed(result) ? 'passed' : 'FAILED';
  process.stdout.write(
    `::group::${status} in ${result.seconds.toFixed(1)}s: ${summarize(result.command)}\n${result.output}\n::endgroup::\n`,
  );
  if (!isPassed(result)) {
    process.stdout.write(
      `::error::Executable contract failed (${result.signal ?? result.exitCode}): ${summarize(result.command)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const commands = readContractCommands(path.join(ROOT, 'package.json'));
  const startedAt = Date.now();
  const results = await runCommandsConcurrently(commands, {
    onResult: report,
  });
  const failed = results.filter((result) => !isPassed(result));
  process.stdout.write(
    `${results.length - failed.length}/${results.length} executable contract commands passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}
