#!/usr/bin/env node
// Bound runner demand while preserving every selected compiler program.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function splitWords(value) {
  return (value ?? '').split(/\s+/).filter(Boolean);
}

// Cold execution seconds observed on 2026-09-27; estimates schedule work only,
// never decide coverage or represent a latency guarantee (see issue #5862).
export const SPEC_WORKSPACE_WEIGHTS = {
  app: 679,
  agent: 627,
  pages: 614,
  props: 605,
  ui: 587,
  hooks: 561,
};

export function buildSpecTypecheckMatrix({ workspaces, soloWorkspaces = [] }) {
  const selected = [...new Set(workspaces)];
  if (selected.some((name) => !/^[a-z0-9][a-z0-9-]*$/u.test(name))) {
    throw new Error('Invalid spec workspace name');
  }
  if (selected.length === 0) return { include: [] };
  const heavy = new Set([
    ...Object.keys(SPEC_WORKSPACE_WEIGHTS),
    ...soloWorkspaces,
  ]);
  const count = Math.min(
    3,
    Math.max(1, selected.filter((name) => heavy.has(name)).length),
  );
  const pools = Array.from({ length: count }, () => ({
    workspaces: [],
    weight: 0,
  }));
  const weight = (name) =>
    SPEC_WORKSPACE_WEIGHTS[name] ?? (heavy.has(name) ? 600 : 10);
  selected.sort((a, b) => weight(b) - weight(a) || a.localeCompare(b, 'en'));
  for (const workspace of selected) {
    const pool = pools.reduce((best, candidate) =>
      candidate.weight < best.weight ? candidate : best,
    );
    pool.workspaces.push(workspace);
    pool.weight += weight(workspace);
  }
  return {
    include: pools.map((pool, index) => ({
      name: `pool-${index + 1}`,
      workspaces: pool.workspaces.join(' '),
    })),
  };
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
