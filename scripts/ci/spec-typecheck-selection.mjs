#!/usr/bin/env node
// Hands the Plan job's spec typecheck scope to the one job that checks it.
//
// `bun check` covers every enrolled workspace in well under a minute, so the
// scope is not split across runners: each extra runner spent more than a
// minute on checkout and install to do a few seconds of checking (#10276).
// Workspace names come from directory names in the checkout, so they are
// validated here before they reach a job output.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WHITESPACE_RUN_PATTERN = /\s+/;
const WORKSPACE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

function splitWords(value) {
  return (value ?? '').split(WHITESPACE_RUN_PATTERN).filter(Boolean);
}

/**
 * @param {readonly string[]} workspaces
 * @returns {string[]} the distinct workspaces, in a stable order
 */
export function selectSpecTypecheckWorkspaces(workspaces) {
  const selected = [...new Set(workspaces)];
  if (selected.some((name) => !WORKSPACE_NAME_PATTERN.test(name))) {
    throw new Error('Invalid spec workspace name');
  }
  return selected.sort((a, b) => a.localeCompare(b, 'en'));
}

function runCli(env = process.env) {
  const workspaces = selectSpecTypecheckWorkspaces(
    splitWords(env.SCOPED_WORKSPACES),
  );
  const shouldRun = workspaces.length > 0;

  if (!env.GITHUB_OUTPUT) {
    throw new Error('GITHUB_OUTPUT is required');
  }
  appendFileSync(
    env.GITHUB_OUTPUT,
    `run=${shouldRun}\nworkspaces=${workspaces.join(' ')}\n`,
  );
  process.stdout.write(
    shouldRun
      ? `Spec typecheck workspaces: ${workspaces.join(' ')}\n`
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
