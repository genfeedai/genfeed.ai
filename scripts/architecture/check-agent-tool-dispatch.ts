import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseCatalogSource } from '../../packages/actions/scripts/report-curated-action-catalog';

/**
 * Guard: keep every in-app agent advertisement surface dispatchable, and keep
 * the executable surface equal to the curated action catalog.
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
 * bypass cannot boot. This guard is the spec-time half: it also checks the
 * curated catalog, per-agent `defaultTools`, and `BRANDLESS_AGENT_TOOLS` for
 * the first shape, which no runtime check can see until a user hits it.
 *
 * Scope: literal cases in switches over toolName in the agent-orchestrator tool
 * handlers. Handler services that own their own `execute` switch (the
 * Instagram inspiration handler, for one) count the same as the central
 * executor — coverage is what matters, not which file provides it. Switches on
 * other variables (dashboard widget kinds, content types) are ignored.
 */

const DEFAULT_CATALOG_PATH =
  'packages/actions/src/registry/curated-action-catalog.ts';
const DEFAULT_AGENT_TYPE_CONFIG_PATH =
  'apps/server/api/src/services/agent-orchestrator/constants/agent-type-config.constant.ts';
const DEFAULT_BRANDLESS_TOOLS_PATH =
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts';
const DEFAULT_DISPATCH_GLOBS = [
  'apps/server/api/src/services/agent-orchestrator/tools/**/*.ts',
  'apps/server/api/src/services/agent-orchestrator/tools/**/*.ts',
];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/node_modules/**',
  '**/dist/**',
];
const DEFAULT_TOOLS_PROPERTY = 'defaultTools';
const BRANDLESS_TOOLS_VARIABLE = 'BRANDLESS_AGENT_TOOLS';

export type AgentToolAdvertisementSurface =
  | 'curated-catalog'
  | 'defaultTools'
  | 'BRANDLESS_AGENT_TOOLS';

export type AgentToolDispatchViolation =
  | {
      action: string;
      kind: 'missing-dispatch';
      message: string;
      surfaces: AgentToolAdvertisementSurface[];
    }
  | {
      action: string;
      files: string[];
      kind: 'unreviewed-dispatch';
      message: string;
    };

export type AgentToolDispatchResult = {
  advertisedActions: string[];
  coveredActions: string[];
  surfacedActions: string[];
  violations: AgentToolDispatchViolation[];
};

export type AgentToolDispatchOptions = {
  agentTypeConfigPath?: string;
  brandlessToolsPath?: string;
  catalogPath?: string;
  dispatchGlobs?: string[];
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

export function collectDispatchedToolNames(
  sourceText: string,
  fileName = 'dispatch.ts',
): string[] {
  const sourceFile = createSourceFile(fileName, sourceText);
  const dispatched = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      const clause = node.parent;
      const statement = clause.parent;
      if (
        ts.isSwitchStatement(statement) &&
        ts.isIdentifier(statement.expression) &&
        statement.expression.text === 'toolName'
      ) {
        dispatched.add(node.expression.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return [...dispatched].sort((a, b) => a.localeCompare(b));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function collectVariableInitializers(
  sourceFile: ts.SourceFile,
): Map<string, ts.Expression> {
  const initializers = new Map<string, ts.Expression>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      initializers.set(node.name.text, node.initializer);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
}

function collectToolNamesFromExpression(
  expression: ts.Expression,
  canonicalNames: readonly string[],
  variableInitializers: ReadonlyMap<string, ts.Expression>,
  toolNames: Set<string>,
  resolvingVariables: Set<string>,
): void {
  const candidate = unwrapExpression(expression);

  if (ts.isStringLiteral(candidate)) {
    toolNames.add(candidate.text);
    return;
  }

  // The general agent advertises the canonical agent surface directly.
  if (
    ts.isCallExpression(candidate) &&
    ts.isPropertyAccessExpression(candidate.expression) &&
    candidate.expression.name.text === 'map'
  ) {
    const receiver = candidate.expression.expression;
    if (
      ts.isCallExpression(receiver) &&
      ts.isIdentifier(receiver.expression) &&
      receiver.expression.text === 'getToolsForSurface' &&
      receiver.arguments.length === 1 &&
      ts.isStringLiteral(receiver.arguments[0]) &&
      receiver.arguments[0].text === 'agent'
    ) {
      for (const name of canonicalNames) toolNames.add(name);
      return;
    }
  }

  if (ts.isArrayLiteralExpression(candidate)) {
    for (const element of candidate.elements) {
      collectToolNamesFromExpression(
        ts.isSpreadElement(element) ? element.expression : element,
        canonicalNames,
        variableInitializers,
        toolNames,
        resolvingVariables,
      );
    }
    return;
  }

  if (!ts.isIdentifier(candidate)) {
    return;
  }

  const variableName = candidate.text;
  const initializer = variableInitializers.get(variableName);
  if (!initializer || resolvingVariables.has(variableName)) {
    return;
  }

  resolvingVariables.add(variableName);
  collectToolNamesFromExpression(
    initializer,
    canonicalNames,
    variableInitializers,
    toolNames,
    resolvingVariables,
  );
  resolvingVariables.delete(variableName);
}

/** Wire names made available by an AgentTypeConfig.defaultTools array. */
export function collectDefaultToolNames(
  sourceText: string,
  canonicalNames: readonly string[],
  fileName = DEFAULT_AGENT_TYPE_CONFIG_PATH,
): string[] {
  const sourceFile = createSourceFile(fileName, sourceText);
  const variableInitializers = collectVariableInitializers(sourceFile);
  const toolNames = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) &&
        node.name.text === DEFAULT_TOOLS_PROPERTY) ||
        (ts.isStringLiteral(node.name) &&
          node.name.text === DEFAULT_TOOLS_PROPERTY))
    ) {
      collectToolNamesFromExpression(
        node.initializer,
        canonicalNames,
        variableInitializers,
        toolNames,
        new Set(),
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...toolNames].sort((a, b) => a.localeCompare(b));
}

/** Wire names allowed to execute without a selected brand. */
export function collectBrandlessToolNames(
  sourceText: string,
  canonicalNames: readonly string[],
  fileName = DEFAULT_BRANDLESS_TOOLS_PATH,
): string[] {
  const sourceFile = createSourceFile(fileName, sourceText);
  const variableInitializers = collectVariableInitializers(sourceFile);
  const initializer = variableInitializers.get(BRANDLESS_TOOLS_VARIABLE);
  const toolNames = new Set<string>();
  const candidate = initializer ? unwrapExpression(initializer) : undefined;

  if (
    !candidate ||
    !ts.isNewExpression(candidate) ||
    !ts.isIdentifier(candidate.expression) ||
    candidate.expression.text !== 'Set'
  ) {
    return [];
  }

  const [toolsExpression] = candidate.arguments ?? [];
  if (toolsExpression) {
    collectToolNamesFromExpression(
      toolsExpression,
      canonicalNames,
      variableInitializers,
      toolNames,
      new Set(),
    );
  }

  return [...toolNames].sort((a, b) => a.localeCompare(b));
}

export function runCheckAgentToolDispatch(
  options: AgentToolDispatchOptions = {},
): AgentToolDispatchResult {
  const rootDir = options.rootDir ?? process.cwd();
  const catalogPath = options.catalogPath ?? DEFAULT_CATALOG_PATH;
  const agentTypeConfigPath =
    options.agentTypeConfigPath ?? DEFAULT_AGENT_TYPE_CONFIG_PATH;
  const brandlessToolsPath =
    options.brandlessToolsPath ?? DEFAULT_BRANDLESS_TOOLS_PATH;
  const dispatchGlobs = options.dispatchGlobs ?? DEFAULT_DISPATCH_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;

  const surfacedActions = parseCatalogSource(
    readFileSync(path.join(rootDir, catalogPath), 'utf8'),
    catalogPath,
  )
    .filter((action) => action.surfaces.includes('agent'))
    .map((action) => action.name);
  const canonicalNames = surfacedActions;
  const defaultToolNames = collectDefaultToolNames(
    readFileSync(path.join(rootDir, agentTypeConfigPath), 'utf8'),
    canonicalNames,
    agentTypeConfigPath,
  );
  const brandlessToolNames = collectBrandlessToolNames(
    readFileSync(path.join(rootDir, brandlessToolsPath), 'utf8'),
    canonicalNames,
    brandlessToolsPath,
  );

  const advertisementSurfaces = new Map<
    string,
    Set<AgentToolAdvertisementSurface>
  >();
  const addAdvertisements = (
    actions: readonly string[],
    surface: AgentToolAdvertisementSurface,
  ): void => {
    for (const action of actions) {
      const surfaces =
        advertisementSurfaces.get(action) ??
        new Set<AgentToolAdvertisementSurface>();
      surfaces.add(surface);
      advertisementSurfaces.set(action, surfaces);
    }
  };

  addAdvertisements(surfacedActions, 'curated-catalog');
  addAdvertisements(defaultToolNames, 'defaultTools');
  addAdvertisements(brandlessToolNames, 'BRANDLESS_AGENT_TOOLS');

  const advertisedActions = [...advertisementSurfaces.keys()].sort((a, b) =>
    a.localeCompare(b),
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
      file,
    );

    for (const action of dispatched) {
      filesByAction.set(action, [...(filesByAction.get(action) ?? []), file]);
    }
  }

  const surfacedSet = new Set(surfacedActions);
  const violations: AgentToolDispatchViolation[] = [];

  for (const action of advertisedActions) {
    if (!filesByAction.has(action)) {
      const surfaces = [...(advertisementSurfaces.get(action) ?? [])];
      violations.push({
        action,
        kind: 'missing-dispatch',
        message: `'${action}' is advertised by ${surfaces.join(', ')} but no agent tool handler dispatches it. The model would receive 'Unknown tool: ${action}'.`,
        surfaces,
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
    advertisedActions,
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
    `Agent tool dispatch coverage passed. ${result.advertisedActions.length} advertised agent action(s) routed and ${result.surfacedActions.length} curated action(s) reviewed.`,
  );
}
