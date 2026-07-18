/**
 * Guardrail: the agent orchestrator + tool executor may only shrink (#519, #520).
 *
 * `agent-tool-executor.service.ts` and `agent-orchestrator.service.ts` are the
 * two largest hand-written source files in the repo and are being decomposed,
 * slice by slice, into per-domain handler/sub-services. This ratchet locks in
 * the progress: each tracked file has a recorded ceiling and the build fails if
 * the file grows past it. When a decomposition slice shrinks a file, lower its
 * ceiling to the new line count IN THE SAME PR — the numbers may only ever go
 * down. New source files under the agent-orchestrator tree are held to a
 * general ceiling so extracted handlers stay small instead of recreating a new
 * monolith.
 *
 * Line counts match `wc -l` (number of newline characters).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const AGENT_ORCHESTRATOR_TREE =
  'apps/server/api/src/services/agent-orchestrator';

/**
 * Per-file ceilings for the known-oversized files. These are a downward-only
 * ratchet: never raise a number; lower it whenever a slice removes lines.
 */
const RATCHET_CEILINGS: Record<string, number> = {
  'apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts': 5356,
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts': 9292,
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-registry.ts': 1136,
};

/**
 * Any other non-spec source file under the tree must stay under this ceiling so
 * decomposition produces small, cohesive services rather than a new monolith.
 */
const GENERAL_CEILING = 1000;

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

export type AgentDecompositionSizeViolation = {
  ceiling: number;
  file: string;
  lines: number;
  message: string;
};

export type AgentDecompositionSizeResult = {
  scannedFileCount: number;
  violations: AgentDecompositionSizeViolation[];
};

export type AgentDecompositionSizeOptions = {
  ceilings?: Record<string, number>;
  generalCeiling?: number;
  ignoreGlobs?: string[];
  rootDir?: string;
  treeGlob?: string;
};

function countLines(contents: string): number {
  const match = contents.match(/\n/g);
  return match ? match.length : 0;
}

export function runCheckAgentDecompositionSize(
  options: AgentDecompositionSizeOptions = {},
): AgentDecompositionSizeResult {
  const rootDir = options.rootDir ?? process.cwd();
  const ceilings = options.ceilings ?? RATCHET_CEILINGS;
  const generalCeiling = options.generalCeiling ?? GENERAL_CEILING;
  const treeGlob = options.treeGlob ?? `${AGENT_ORCHESTRATOR_TREE}/**/*.ts`;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;

  const files = globSync(treeGlob, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  });

  const violations: AgentDecompositionSizeViolation[] = [];

  for (const absoluteFile of files) {
    const relativeFile = path
      .relative(rootDir, absoluteFile)
      .replaceAll('\\', '/');
    const lines = countLines(readFileSync(absoluteFile, 'utf8'));
    const trackedCeiling = ceilings[relativeFile];

    if (trackedCeiling !== undefined) {
      if (lines > trackedCeiling) {
        violations.push({
          ceiling: trackedCeiling,
          file: relativeFile,
          lines,
          message: `grew to ${lines} lines (ceiling ${trackedCeiling}). This file is being decomposed (#519/#520) and may only shrink — extract a slice, don't add to it.`,
        });
      }
      continue;
    }

    if (lines > generalCeiling) {
      violations.push({
        ceiling: generalCeiling,
        file: relativeFile,
        lines,
        message: `is ${lines} lines (ceiling ${generalCeiling}). Extracted agent services must stay small and single-purpose; split this file further.`,
      });
    }
  }

  return {
    scannedFileCount: files.length,
    violations,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckAgentDecompositionSize();

  if (result.violations.length > 0) {
    console.error('Agent decomposition size ratchet violations found:');
    for (const violation of result.violations) {
      console.error(`- ${violation.file} ${violation.message}`);
    }
    console.error(
      '\nIf a slice legitimately shrank a file, lower its ceiling in scripts/architecture/check-agent-decomposition-size.ts to the new count.',
    );
    process.exit(1);
  }

  console.log(
    `Agent decomposition size ratchet passed across ${result.scannedFileCount} source file(s).`,
  );
}
