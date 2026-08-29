#!/usr/bin/env node
// A dead Turbo remote cache is silent. Turbo prints one warning, exits 0, and
// rebuilds every task cold, so a rejected token degrades to "CI just got
// slower" and nobody investigates. This turns that warning into a run
// annotation. It never blocks a merge: a cold cache is a throughput
// regression, not a correctness one.
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEAD_CACHE_PATTERNS = [
  /failed to contact remote cache/i,
  /remote caching disabled/i,
  /unable to (?:authenticate|connect) to the remote cache/i,
  /error: could not (?:get|put) cache artifact/i,
];

const LIVE_CACHE_PATTERN = /remote caching enabled/i;

export function analyzeTurboLog(log) {
  const dead = DEAD_CACHE_PATTERNS.find((pattern) => pattern.test(log));
  if (dead) {
    const line = log
      .split('\n')
      .find((candidate) => dead.test(candidate))
      ?.trim();
    return { status: 'dead', detail: line ?? dead.source };
  }
  if (LIVE_CACHE_PATTERN.test(log)) {
    return { status: 'live', detail: 'Turbo reported remote caching enabled.' };
  }
  return {
    status: 'unverified',
    detail:
      'Turbo never reported remote caching enabled and never reported an error.',
  };
}

export function checkTurboRemoteCache({
  logPath,
  token,
  readLog = (target) => readFileSync(target, 'utf8'),
  write = console.log,
} = {}) {
  if (!token) {
    write('TURBO_TOKEN is not set; skipping the remote cache liveness check.');
    return { status: 'skipped', isDead: false };
  }
  if (!logPath) {
    write('::warning::No Turbo log path given; remote cache liveness unknown.');
    return { status: 'unverified', isDead: false };
  }

  let log;
  try {
    log = readLog(logPath);
  } catch {
    write(
      `::warning::Turbo log ${logPath} is unreadable; remote cache liveness unknown.`,
    );
    return { status: 'unverified', isDead: false };
  }

  const { status, detail } = analyzeTurboLog(log);
  if (status === 'dead') {
    write(
      `::error::Turbo remote cache is not usable: ${detail}. Every task rebuilt cold. Rotate TURBO_TOKEN or fix TURBO_TEAM.`,
    );
    return { status, isDead: true };
  }
  if (status === 'unverified') {
    write(`::warning::${detail} Treat the remote cache as suspect.`);
    return { status, isDead: false };
  }

  write(detail);
  return { status, isDead: false };
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isDirectInvocation) {
  const { isDead } = checkTurboRemoteCache({
    logPath: process.argv[2],
    token: process.env.TURBO_TOKEN,
  });
  if (isDead) {
    process.exitCode = 1;
  }
}
