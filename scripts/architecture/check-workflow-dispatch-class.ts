/**
 * Guardrail (#5271): every `WorkflowExecutionQueueService.queueSystemWorkflow`
 * producer must declare a `dispatchClass` (`INTERACTIVE` or `BACKGROUND`) so
 * a new producer cannot land on the shared interactive queue by omission.
 * TypeScript already fails a call site that leaves `dispatchClass` out of an
 * object-literal options argument (it is a required field on
 * `QueueSystemWorkflowOptions`) — this check is the second, structural line
 * of defense the decision on #5271 also asked for: it catches the two shapes
 * the compiler cannot.
 *
 * 1. A `queueSystemWorkflow(...)` call that only passes two arguments (no
 *    options object at all) — a stale caller from before this option
 *    existed, or a spread that could hide a missing field from a quick read.
 * 2. A NEW `@InjectQueue(WORKFLOW_EXECUTION_QUEUE | PLATFORM_SYSTEM_WORKFLOW_QUEUE
 *    | WORKFLOW_BACKGROUND_QUEUE | SCHEDULED_PUBLISH_QUEUE)` outside the one service that owns routing
 *    (`WorkflowExecutionQueueService`) and the one documented boot-drain
 *    exception (`PlatformScheduleRegistryService`, #5162/#5252). Injecting
 *    one of these queues directly lets a producer call `Queue.add()` on it
 *    and skip `dispatchClass` entirely — the required-option type only
 *    guards `queueSystemWorkflow` itself, not the raw BullMQ `Queue`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseSourceFile } from './parse-source-file';

const ROOT_DIR = process.cwd();
const SOURCE_GLOBS = [
  'apps/server/api/src/**/*.ts',
  'apps/server/workers/src/**/*.ts',
];
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

const ROUTED_QUEUE_TOKEN_NAMES = new Set([
  'WORKFLOW_EXECUTION_QUEUE',
  'PLATFORM_SYSTEM_WORKFLOW_QUEUE',
  'WORKFLOW_BACKGROUND_QUEUE',
  'SCHEDULED_PUBLISH_QUEUE',
]);

/**
 * The routing service may inject all routed queues. The registry exception
 * is checked separately and permits only the execution queue for its boot drain.
 */
const ALLOWED_INJECT_QUEUE_FILES = new Set([
  'apps/server/api/src/collections/workflows/services/workflow-execution-queue.service.ts',
]);

/**
 * `scheduleForEach`'s `queueSystemWorkflow` parameter is a caller-supplied
 * callback, not the real `WorkflowExecutionQueueService.queueSystemWorkflow`
 * — its declared type deliberately excludes `dispatchClass` because the
 * actual required-field enforcement happens one level up, in the lambda
 * `SystemWorkflowRunnerService.executeForEach` passes in (which merges
 * `dispatchClass` from `resolveInheritedDispatch` before forwarding to the
 * real service method). A pure name-based AST match can't tell that call
 * apart from a real one, so this file is excluded from the call-shape check
 * below; it is NOT excluded from the `@InjectQueue` boundary check.
 */
const CALL_CHECK_IGNORE_FILES = new Set([
  'apps/server/api/src/collections/workflows/system-workflow-for-each.util.ts',
]);

const QUEUE_SYSTEM_WORKFLOW_METHOD_NAME = 'queueSystemWorkflow';
const DISPATCH_CLASS_PROPERTY_NAME = 'dispatchClass';

export type WorkflowDispatchClassViolation = {
  file: string;
  line: number;
  message: string;
};

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function collectRoutedQueueTokenImports(
  sourceFile: ts.SourceFile,
): Map<string, string> {
  // local name -> canonical token name
  const imported = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith('@genfeedai/contracts')
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      for (const token of ROUTED_QUEUE_TOKEN_NAMES) {
        imported.set(`${namedBindings.name.text}.${token}`, token);
      }
    }
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (ROUTED_QUEUE_TOKEN_NAMES.has(importedName)) {
        imported.set(element.name.text, importedName);
      }
    }
  }

  return imported;
}

function findInjectQueueViolations(
  sourceFile: ts.SourceFile,
  relativeFile: string,
  routedTokens: ReadonlyMap<string, string>,
): WorkflowDispatchClassViolation[] {
  if (ALLOWED_INJECT_QUEUE_FILES.has(relativeFile) || routedTokens.size === 0) {
    return [];
  }

  const violations: WorkflowDispatchClassViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const isInjectQueue =
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'InjectQueue';
      const [firstArgument] = call.arguments;
      const tokenExpression =
        firstArgument &&
        (ts.isIdentifier(firstArgument) ||
          ts.isPropertyAccessExpression(firstArgument))
          ? firstArgument.getText(sourceFile)
          : undefined;
      const token = tokenExpression
        ? routedTokens.get(tokenExpression)
        : undefined;
      const isBootDrain =
        relativeFile ===
          'apps/server/workers/src/scheduling/platform-schedule-registry.service.ts' &&
        token === 'WORKFLOW_EXECUTION_QUEUE';
      if (isInjectQueue && token && !isBootDrain) {
        violations.push({
          file: relativeFile,
          line: getLine(sourceFile, node),
          message: `@InjectQueue(${tokenExpression}) is only allowed in WorkflowExecutionQueueService (or the documented #5162 boot drain) — a producer must route through queueSystemWorkflow's required dispatchClass instead of injecting this queue directly.`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function hasDispatchClassProperty(
  optionsExpression: ts.Expression,
): boolean | undefined {
  if (ts.isObjectLiteralExpression(optionsExpression)) {
    const hasDispatchClass = optionsExpression.properties.some((property) => {
      if (
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)
      ) {
        const name = property.name;
        return (
          (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
          name.text === DISPATCH_CLASS_PROPERTY_NAME
        );
      }
      return false;
    });
    if (hasDispatchClass) {
      return true;
    }
    // A spread element may carry `dispatchClass` from a typed variable the
    // compiler already checked — don't flag those; only flag an object
    // literal with no spread and no explicit property.
    const hasSpread = optionsExpression.properties.some((property) =>
      ts.isSpreadAssignment(property),
    );
    return hasSpread ? undefined : false;
  }
  // Not an object literal (identifier, spread call, etc.) — the compiler's
  // structural typing already covers this shape; don't attempt to resolve it.
  return undefined;
}

function findQueueSystemWorkflowCallViolations(
  sourceFile: ts.SourceFile,
  relativeFile: string,
): WorkflowDispatchClassViolation[] {
  if (CALL_CHECK_IGNORE_FILES.has(relativeFile)) {
    return [];
  }

  const violations: WorkflowDispatchClassViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === QUEUE_SYSTEM_WORKFLOW_METHOD_NAME
    ) {
      const [, , optionsArgument] = node.arguments;
      if (!optionsArgument) {
        violations.push({
          file: relativeFile,
          line: getLine(sourceFile, node),
          message:
            'queueSystemWorkflow call is missing its options argument — dispatchClass (INTERACTIVE or BACKGROUND) is required (#5271).',
        });
      } else if (hasDispatchClassProperty(optionsArgument) === false) {
        violations.push({
          file: relativeFile,
          line: getLine(sourceFile, node),
          message:
            'queueSystemWorkflow call passes an options object literal without dispatchClass — every producer must declare INTERACTIVE or BACKGROUND (#5271).',
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

/**
 * Analyzes one file's source text in isolation — the unit under test for
 * `check-workflow-dispatch-class.test.ts`. `runCheckWorkflowDispatchClass`
 * (the real guard) is the same logic fanned out over the repo's actual files.
 */
export function analyzeWorkflowDispatchClassSource(
  sourceText: string,
  relativeFile: string,
): WorkflowDispatchClassViolation[] {
  const sourceFile = parseSourceFile(relativeFile, sourceText, true);
  const routedTokens = collectRoutedQueueTokenImports(sourceFile);

  return [
    ...findInjectQueueViolations(sourceFile, relativeFile, routedTokens),
    ...findQueueSystemWorkflowCallViolations(sourceFile, relativeFile),
  ];
}

export function runCheckWorkflowDispatchClass(): WorkflowDispatchClassViolation[] {
  const files = SOURCE_GLOBS.flatMap((sourceGlob) =>
    globSync(sourceGlob, {
      absolute: true,
      cwd: ROOT_DIR,
      ignore: IGNORE_GLOBS,
      nodir: true,
    }),
  );

  return files.flatMap((filePath) => {
    const sourceText = readFileSync(filePath, 'utf8');
    const relativeFile = path
      .relative(ROOT_DIR, filePath)
      .replaceAll('\\', '/');
    const sourceFile = parseSourceFile(filePath, sourceText, true);
    const routedTokens = collectRoutedQueueTokenImports(sourceFile);

    return [
      ...findInjectQueueViolations(sourceFile, relativeFile, routedTokens),
      ...findQueueSystemWorkflowCallViolations(sourceFile, relativeFile),
    ];
  });
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const violations = runCheckWorkflowDispatchClass();

  if (violations.length > 0) {
    console.error('Workflow dispatch-class violations found:');
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} ${violation.message}`);
    }
    process.exit(1);
  }

  console.log('Workflow dispatch-class boundary passed.');
}
