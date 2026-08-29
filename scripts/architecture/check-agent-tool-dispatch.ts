import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseCatalogSource } from '../../packages/actions/scripts/report-curated-action-catalog';

/**
 * Guard: keep the in-app agent's executable surface equal to the curated
 * action catalog.
 *
 * MCP already crashes on boot when its surface and its dispatch disagree
 * (`ToolRegistryService.validateDispatchCoverage`). The agent had no
 * equivalent, and that is exactly where drift happened: `generate_ad_pack`,
 * `prepare_ad_launch_review`, `get_workflow_inputs`,
 * `draft_brand_voice_profile`, and `save_brand_voice_profile` shipped as live,
 * credit-costed tools defined inline in `CLOUD_AGENT_TOOL_EXTENSIONS`, never
 * reviewed in the catalog.
 *
 * Two failure modes, both silent in production:
 *   - **Advertised, unroutable.** The catalog surfaces an action to the agent,
 *     the model calls it, and `dispatch` falls through to
 *     `Unknown tool: <name>` — a failed turn the user pays a round for.
 *   - **Routable, unreviewed.** A `case` exists for a name the catalog does
 *     not surface. Either it is dead code, or (the drift above) it is reachable
 *     through a registry extension that bypasses review.
 *
 * `agent-tool-registry.ts` throws at module load on the second shape, so a
 * bypass cannot boot. This guard is the spec-time half: it also catches the
 * first shape, which no runtime check can see until a user hits it.
 *
 * Scope: `case AgentToolName.X:` clauses in the agent-orchestrator tool
 * handlers. Handler services that own their own `execute` switch (the
 * Instagram inspiration handler, for one) count the same as the central
 * executor — coverage is what matters, not which file provides it. Switches on
 * string literals (dashboard widget kinds, content types) are ignored because
 * only `AgentToolName` members name tools.
 */

const DEFAULT_CATALOG_PATH =
  'packages/actions/src/registry/curated-action-catalog.ts';
const DEFAULT_ENUM_PATH = 'packages/interfaces/src/ai/agent-tool.interface.ts';
const DEFAULT_DISPATCH_GLOBS = [
  'apps/server/api/src/services/agent-orchestrator/tools/**/*.ts',
  'apps/server/server/src/services/agent-orchestrator/tools/**/*.ts',
];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/node_modules/**',
  '**/dist/**',
];
const TOOL_NAME_ENUM = 'AgentToolName';

export type AgentToolDispatchViolation =
  | {
      action: string;
      kind: 'missing-dispatch';
      message: string;
    }
  | {
      action: string;
      files: string[];
      kind: 'unreviewed-dispatch';
      message: string;
    };

export type AgentToolDispatchResult = {
  coveredActions: string[];
  surfacedActions: string[];
  violations: AgentToolDispatchViolation[];
};

export type AgentToolDispatchOptions = {
  catalogPath?: string;
  dispatchGlobs?: string[];
  enumPath?: string;
  ignoreGlobs?: string[];
  rootDir?: string;
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function createSourceFile(filePath: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * `AgentToolName` member -> wire name. Dispatch switches spell the member;
 * the catalog spells the wire name.
 */
export function parseToolNameEnum(
  sourceText: string,
  fileName = DEFAULT_ENUM_PATH,
): Map<string, string> {
  const sourceFile = createSourceFile(fileName, sourceText);
  const values = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isEnumDeclaration(node) && node.name.text === TOOL_NAME_ENUM) {
      for (const member of node.members) {
        const initializer = member.initializer;
        if (!initializer || !ts.isStringLiteral(initializer)) {
          continue;
        }
        values.set(member.name.getText(sourceFile), initializer.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (values.size === 0) {
    throw new Error(`${fileName} does not declare a string ${TOOL_NAME_ENUM}`);
  }

  return values;
}

/**
 * Wire names reachable through a `case AgentToolName.X:` clause in one file.
 */
export function collectDispatchedToolNames(
  sourceText: string,
  enumValues: ReadonlyMap<string, string>,
  fileName = 'dispatch.ts',
): string[] {
  const sourceFile = createSourceFile(fileName, sourceText);
  const dispatched = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isCaseClause(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === TOOL_NAME_ENUM
    ) {
      const wireName = enumValues.get(node.expression.name.text);
      if (wireName) {
        dispatched.add(wireName);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return [...dispatched].sort((a, b) => a.localeCompare(b));
}

export function runCheckAgentToolDispatch(
  options: AgentToolDispatchOptions = {},
): AgentToolDispatchResult {
  const rootDir = options.rootDir ?? process.cwd();
  const catalogPath = options.catalogPath ?? DEFAULT_CATALOG_PATH;
  const enumPath = options.enumPath ?? DEFAULT_ENUM_PATH;
  const dispatchGlobs = options.dispatchGlobs ?? DEFAULT_DISPATCH_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;

  const surfacedActions = parseCatalogSource(
    readFileSync(path.join(rootDir, catalogPath), 'utf8'),
    catalogPath,
  )
    .filter((action) => action.surfaces.includes('agent'))
    .map((action) => action.name);
  const enumValues = parseToolNameEnum(
    readFileSync(path.join(rootDir, enumPath), 'utf8'),
    enumPath,
  );

  const files = globSync(dispatchGlobs, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort();

  const filesByAction = new Map<string, string[]>();
  for (const filePath of files) {
    const file = normalizePath(path.relative(rootDir, filePath));
    const dispatched = collectDispatchedToolNames(
      readFileSync(filePath, 'utf8'),
      enumValues,
      file,
    );

    for (const action of dispatched) {
      filesByAction.set(action, [...(filesByAction.get(action) ?? []), file]);
    }
  }

  const surfacedSet = new Set(surfacedActions);
  const violations: AgentToolDispatchViolation[] = [];

  for (const action of surfacedActions) {
    if (!filesByAction.has(action)) {
      violations.push({
        action,
        kind: 'missing-dispatch',
        message: `'${action}' is surfaced to the agent by the curated action catalog but no tool handler dispatches it. The model would receive 'Unknown tool: ${action}'.`,
      });
    }
  }

  for (const [action, actionFiles] of [...filesByAction.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (!surfacedSet.has(action)) {
      violations.push({
        action,
        files: actionFiles,
        kind: 'unreviewed-dispatch',
        message: `'${action}' is dispatched by a tool handler but the curated action catalog does not surface it to the agent. Add it to CURATED_ACTION_CATALOG with a source tool definition, or delete the dispatch.`,
      });
    }
  }

  return {
    coveredActions: [...filesByAction.keys()].sort((a, b) =>
      a.localeCompare(b),
    ),
    surfacedActions,
    violations,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckAgentToolDispatch();

  if (result.violations.length > 0) {
    console.error('Agent tool dispatch coverage violations found.');

    for (const violation of result.violations) {
      console.error(`- ${violation.message}`);
    }

    console.error(
      '\nThe curated action catalog is the only source of truth for agent tool surfaces: packages/actions/src/registry/curated-action-catalog.ts',
    );
    process.exit(1);
  }

  console.log(
    `Agent tool dispatch coverage passed. ${result.surfacedActions.length} curated agent action(s) routed.`,
  );
}
