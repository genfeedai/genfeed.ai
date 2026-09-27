#!/usr/bin/env node
// Splits the spec-typecheck scope into matrix legs. A handful of workspaces
// each typecheck most of the frontend graph and take ~10 minutes alone; run
// serially they turned the full ratchet into a 57-minute job. Each solo
// workspace gets its own leg and every other workspace shares one, so the
// ratchet's wall clock is bounded by its slowest workspace instead of the sum.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function splitWords(value) {
  return (value ?? '').split(/\s+/).filter(Boolean);
}

export function buildSpecTypecheckMatrix({ workspaces, soloWorkspaces }) {
  const solo = new Set(soloWorkspaces);
  const include = [];
  const shared = [];

  for (const workspace of new Set(workspaces)) {
    if (solo.has(workspace)) {
      include.push({ name: workspace, workspaces: workspace });
    } else {
      shared.push(workspace);
    }
  }

  if (shared.length > 0) {
    include.push({ name: 'shared', workspaces: shared.join(' ') });
  }

  return { include };
}

function runCli(env = process.env) {
  const matrix = buildSpecTypecheckMatrix({
    workspaces: splitWords(env.SCOPED_WORKSPACES),
    soloWorkspaces: splitWords(env.SOLO_WORKSPACES),
  });
  const shouldRun = matrix.include.length > 0;

  if (!env.GITHUB_OUTPUT) {
    throw new Error('GITHUB_OUTPUT is required');
  }
  appendFileSync(
    env.GITHUB_OUTPUT,
    `run=${shouldRun}\nmatrix=${JSON.stringify(matrix)}\n`,
  );
  process.stdout.write(
    shouldRun
      ? `Spec typecheck legs: ${matrix.include.map((leg) => `${leg.name} [${leg.workspaces}]`).join(', ')}\n`
      : 'Spec typecheck: nothing in scope\n',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
