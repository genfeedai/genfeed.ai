/**
 * Guard Prisma tenant queries against missing organization and soft-delete
 * scope.
 *
 * The Prisma schema is the model inventory: any model carrying both an
 * `organizationId` field and an `isDeleted` field is tenant-scoped. This guard
 * then inspects Prisma-shaped delegate calls in the API tree and requires
 * their `where` clauses to prove both keys are present.
 *
 * This is a static regression ratchet, not a soundness proof. It deliberately
 * reports unresolved `where` expressions instead of treating them as safe, but
 * it still cannot prove:
 * - delegates hidden behind aliases or dynamic element access;
 * - `where` objects assembled across functions or files;
 * - local object mutation performed indirectly through a function call;
 * - raw SQL calls or custom Prisma extension methods;
 * - the runtime value or boolean semantics of a syntactically present key
 *   (for example, `organizationId: undefined` or a negated condition);
 * - that a model-shaped object is definitely a Prisma client without a type
 *   checker.
 *
 * The scan surface is `apps/server/api/src`. Other backend workspaces are
 * outside this chip and must not be assumed covered by the CI guard.
 *
 * New code should use the canonical `scopedWhere` export from
 * `@api/tenancy/scoped-where`. Existing Chips B/C debt is captured by an exact,
 * deterministic baseline. New findings and stale baseline entries both fail,
 * so the baseline can only move with an explicit reviewed change.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  discoverTenantModels,
  TENANT_QUERY_OPERATION_SET,
  type TenantModel,
} from '../../packages/libs/prisma/discover-tenant-models';

export { discoverTenantModels, type TenantModel };

const DEFAULT_SCHEMA_PATH = 'packages/prisma/prisma/schema.prisma';
const DEFAULT_BASELINE_PATH = 'scripts/architecture/tenant-scope-baseline.json';
const DEFAULT_INCLUDE_GLOBS = ['apps/server/api/src/**/*.ts'];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/fixtures/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

const TENANT_SCOPE_BASELINE_VERSION = 1;
const TENANT_SCOPE_IGNORE = 'tenant-scope-ignore';
const TENANT_SCOPE_IGNORE_PATTERN =
  /^\s*\/\/\s*tenant-scope-ignore:\s*(\S(?:.*\S)?)\s*$/u;

const TENANT_SCOPE_FINDING_REASONS = new Set<TenantScopeFindingReason>([
  'missing-is-deleted',
  'missing-organization-id',
  'missing-where',
  'unresolved-where',
]);

const PRISMA_WHERE_METHODS = TENANT_QUERY_OPERATION_SET;

const SCOPED_WHERE_MODULE_PATTERNS = [
  /^@api\/index$/u,
  /(?:^|\/)tenancy\/scoped-where$/u,
];

const TENANT_SCOPE_BASELINE_ENTRY_KEYS = new Set([
  'delegate',
  'file',
  'fingerprint',
  'method',
  'model',
  'reason',
]);
const TENANT_SCOPE_BASELINE_KEYS = new Set([
  'entries',
  'schemaPath',
  'version',
]);
const TENANT_SCOPE_FINGERPRINT_PATTERN = /^[0-9a-f]{20}$/u;
const ASSIGNMENT_OPERATOR_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

export type TenantScopeFindingReason =
  | 'missing-is-deleted'
  | 'missing-organization-id'
  | 'missing-where'
  | 'unresolved-where';

export type TenantScopeFinding = {
  call: string;
  delegate: string;
  file: string;
  fingerprint: string;
  line: number;
  method: string;
  model: string;
  reason: TenantScopeFindingReason;
};

export type TenantScopeSuppressionViolation = {
  file: string;
  line: number;
  message: string;
};

export type TenantScopeBaselineEntry = Omit<
  TenantScopeFinding,
  'call' | 'line'
>;

export type TenantScopeBaseline = {
  entries: TenantScopeBaselineEntry[];
  schemaPath: string;
  version: typeof TENANT_SCOPE_BASELINE_VERSION;
};

export type TenantScopeBaselineDiff = {
  regressions: TenantScopeFinding[];
  stale: TenantScopeBaselineEntry[];
};

export type TenantScopeCheckOptions = {
  baselinePath?: string;
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
  schemaPath?: string;
};

export type TenantScopeCheckResult = {
  filesScanned: number;
  findings: TenantScopeFinding[];
  suppressionViolations: TenantScopeSuppressionViolation[];
  tenantModels: TenantModel[];
};

type CliOptions = Required<
  Pick<TenantScopeCheckOptions, 'baselinePath' | 'rootDir' | 'schemaPath'>
> & {
  updateBaseline: boolean;
};

type PropertyResolution =
  | { kind: 'found'; value: ts.Expression }
  | { kind: 'missing' }
  | { kind: 'unresolved' };

type Presence = 'absent' | 'present' | 'unresolved';

type ScopePresence = {
  isDeleted: Presence;
  organizationId: Presence;
};

type ScopedWhereBindings = {
  identifiers: Set<string>;
  namespaces: Set<string>;
};

type CallCandidate = {
  call: ts.CallExpression;
  delegate: string;
  method: string;
  model: string;
};

const printer = ts.createPrinter({ removeComments: true });

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function resolveFromRoot(rootDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (!name) {
    return null;
  }

  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return null;
}

function isAncestor(ancestor: ts.Node, node: ts.Node): boolean {
  let current: ts.Node | undefined = node;

  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function enclosingLexicalScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (
      ts.isBlock(current) ||
      ts.isModuleBlock(current) ||
      ts.isSourceFile(current)
    ) {
      return current;
    }
    current = current.parent;
  }

  return node.getSourceFile();
}

function rootIdentifier(expression: ts.Expression): ts.Identifier | null {
  let current = unwrapExpression(expression);

  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = unwrapExpression(current.expression);
  }

  return ts.isIdentifier(current) ? current : null;
}

function writesIdentifier(node: ts.Node, identifier: string): boolean {
  if (
    ts.isBinaryExpression(node) &&
    ASSIGNMENT_OPERATOR_KINDS.has(node.operatorToken.kind)
  ) {
    return rootIdentifier(node.left)?.text === identifier;
  }

  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return rootIdentifier(node.operand)?.text === identifier;
  }

  return (
    ts.isDeleteExpression(node) &&
    rootIdentifier(node.expression)?.text === identifier
  );
}

function resolveLocalInitializer(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile,
): ts.Expression | null {
  let best: ts.VariableDeclaration | null = null;

  const visit = (node: ts.Node): void => {
    if (node.getStart(sourceFile) >= identifier.getStart(sourceFile)) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text &&
      node.initializer
    ) {
      const scope = enclosingLexicalScope(node);

      if (
        isAncestor(scope, identifier) &&
        (!best || node.getStart(sourceFile) > best.getStart(sourceFile))
      ) {
        best = node;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const declaration = best;
  if (!declaration?.initializer) {
    return null;
  }

  const scope = enclosingLexicalScope(declaration);
  let mutated = false;
  const visitWrites = (node: ts.Node): void => {
    if (
      mutated ||
      node.end <= declaration.end ||
      node.getStart(sourceFile) >= identifier.getStart(sourceFile)
    ) {
      return;
    }

    if (writesIdentifier(node, identifier.text)) {
      mutated = true;
      return;
    }

    ts.forEachChild(node, visitWrites);
  };

  visitWrites(scope);
  return mutated ? null : declaration.initializer;
}

function collectScopedWhereBindings(
  sourceFile: ts.SourceFile,
): ScopedWhereBindings {
  const bindings: ScopedWhereBindings = {
    identifiers: new Set(),
    namespaces: new Set(),
  };

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !SCOPED_WHERE_MODULE_PATTERNS.some((pattern) =>
        pattern.test(statement.moduleSpecifier.text),
      )
    ) {
      continue;
    }

    const importClause = statement.importClause;
    const namedBindings = importClause?.namedBindings;

    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindings.namespaces.add(namedBindings.name.text);
      continue;
    }

    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (importedName === 'scopedWhere') {
        bindings.identifiers.add(element.name.text);
      }
    }
  }

  return bindings;
}

function isScopedWhereCall(
  expression: ts.Expression,
  bindings: ScopedWhereBindings,
): boolean {
  const unwrapped = unwrapExpression(expression);

  if (!ts.isCallExpression(unwrapped)) {
    return false;
  }

  const callee = unwrapExpression(unwrapped.expression);

  if (ts.isIdentifier(callee)) {
    return bindings.identifiers.has(callee.text);
  }

  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    bindings.namespaces.has(callee.expression.text) &&
    callee.name.text === 'scopedWhere'
  );
}

function resolveProperty(
  expression: ts.Expression,
  propertyName: string,
  sourceFile: ts.SourceFile,
  visitedIdentifiers = new Set<string>(),
): PropertyResolution {
  const unwrapped = unwrapExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    if (visitedIdentifiers.has(unwrapped.text)) {
      return { kind: 'unresolved' };
    }

    const initializer = resolveLocalInitializer(unwrapped, sourceFile);
    if (!initializer) {
      return { kind: 'unresolved' };
    }

    const nextVisited = new Set(visitedIdentifiers);
    nextVisited.add(unwrapped.text);
    return resolveProperty(initializer, propertyName, sourceFile, nextVisited);
  }

  if (!ts.isObjectLiteralExpression(unwrapped)) {
    return { kind: 'unresolved' };
  }

  let resolution: PropertyResolution = { kind: 'missing' };

  for (const property of unwrapped.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadResolution = resolveProperty(
        property.expression,
        propertyName,
        sourceFile,
        new Set(visitedIdentifiers),
      );

      if (spreadResolution.kind === 'found') {
        resolution = spreadResolution;
      } else if (spreadResolution.kind === 'unresolved') {
        resolution = { kind: 'unresolved' };
      }
      continue;
    }

    if (
      ts.isPropertyAssignment(property) &&
      propertyNameText(property.name) === propertyName
    ) {
      resolution = { kind: 'found', value: property.initializer };
      continue;
    }

    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === propertyName
    ) {
      resolution = { kind: 'found', value: property.name };
      continue;
    }

    if (
      (ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property)) &&
      propertyNameText(property.name) === propertyName
    ) {
      resolution = { kind: 'unresolved' };
    }
  }

  return resolution;
}

function mergePresence(left: Presence, right: Presence): Presence {
  if (left === 'present' || right === 'present') {
    return 'present';
  }
  if (left === 'unresolved' || right === 'unresolved') {
    return 'unresolved';
  }
  return 'absent';
}

function mergeScopePresence(
  left: ScopePresence,
  right: ScopePresence,
): ScopePresence {
  return {
    isDeleted: mergePresence(left.isDeleted, right.isDeleted),
    organizationId: mergePresence(left.organizationId, right.organizationId),
  };
}

function intersectPresence(left: Presence, right: Presence): Presence {
  if (left === 'absent' || right === 'absent') {
    return 'absent';
  }
  if (left === 'unresolved' || right === 'unresolved') {
    return 'unresolved';
  }
  return 'present';
}

function intersectScopePresence(
  left: ScopePresence,
  right: ScopePresence,
): ScopePresence {
  return {
    isDeleted: intersectPresence(left.isDeleted, right.isDeleted),
    organizationId: intersectPresence(
      left.organizationId,
      right.organizationId,
    ),
  };
}

function applySpreadPresence(
  current: ScopePresence,
  spread: ScopePresence,
): ScopePresence {
  return {
    isDeleted:
      spread.isDeleted === 'absent' ? current.isDeleted : spread.isDeleted,
    organizationId:
      spread.organizationId === 'absent'
        ? current.organizationId
        : spread.organizationId,
  };
}

function inspectDisjunction(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  bindings: ScopedWhereBindings,
  visitedIdentifiers: Set<string>,
): ScopePresence {
  const unwrapped = unwrapExpression(expression);

  if (ts.isIdentifier(unwrapped)) {
    if (visitedIdentifiers.has(unwrapped.text)) {
      return {
        isDeleted: 'unresolved',
        organizationId: 'unresolved',
      };
    }

    const initializer = resolveLocalInitializer(unwrapped, sourceFile);
    if (!initializer) {
      return {
        isDeleted: 'unresolved',
        organizationId: 'unresolved',
      };
    }

    const nextVisited = new Set(visitedIdentifiers);
    nextVisited.add(unwrapped.text);
    return inspectDisjunction(initializer, sourceFile, bindings, nextVisited);
  }

  if (!ts.isArrayLiteralExpression(unwrapped)) {
    return inspectWhereExpression(
      unwrapped,
      sourceFile,
      bindings,
      new Set(visitedIdentifiers),
    );
  }

  if (unwrapped.elements.length === 0) {
    return {
      isDeleted: 'absent',
      organizationId: 'absent',
    };
  }

  return unwrapped.elements.reduce<ScopePresence>(
    (presence, element) =>
      intersectScopePresence(
        presence,
        ts.isSpreadElement(element)
          ? inspectWhereExpression(
              element.expression,
              sourceFile,
              bindings,
              new Set(visitedIdentifiers),
            )
          : inspectWhereExpression(
              element,
              sourceFile,
              bindings,
              new Set(visitedIdentifiers),
            ),
      ),
    {
      isDeleted: 'present',
      organizationId: 'present',
    },
  );
}

function inspectWhereExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  bindings: ScopedWhereBindings,
  visitedIdentifiers = new Set<string>(),
): ScopePresence {
  const unwrapped = unwrapExpression(expression);

  if (isScopedWhereCall(unwrapped, bindings)) {
    return {
      isDeleted: 'present',
      organizationId: 'present',
    };
  }

  if (ts.isIdentifier(unwrapped)) {
    if (visitedIdentifiers.has(unwrapped.text)) {
      return {
        isDeleted: 'unresolved',
        organizationId: 'unresolved',
      };
    }

    const initializer = resolveLocalInitializer(unwrapped, sourceFile);
    if (!initializer) {
      return {
        isDeleted: 'unresolved',
        organizationId: 'unresolved',
      };
    }

    const nextVisited = new Set(visitedIdentifiers);
    nextVisited.add(unwrapped.text);
    return inspectWhereExpression(
      initializer,
      sourceFile,
      bindings,
      nextVisited,
    );
  }

  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements.reduce<ScopePresence>(
      (presence, element) =>
        mergeScopePresence(
          presence,
          ts.isSpreadElement(element)
            ? inspectWhereExpression(
                element.expression,
                sourceFile,
                bindings,
                new Set(visitedIdentifiers),
              )
            : inspectWhereExpression(
                element,
                sourceFile,
                bindings,
                new Set(visitedIdentifiers),
              ),
        ),
      {
        isDeleted: 'absent',
        organizationId: 'absent',
      },
    );
  }

  if (!ts.isObjectLiteralExpression(unwrapped)) {
    return {
      isDeleted: 'unresolved',
      organizationId: 'unresolved',
    };
  }

  let presence: ScopePresence = {
    isDeleted: 'absent',
    organizationId: 'absent',
  };

  for (const property of unwrapped.properties) {
    if (ts.isSpreadAssignment(property)) {
      presence = applySpreadPresence(
        presence,
        inspectWhereExpression(
          property.expression,
          sourceFile,
          bindings,
          new Set(visitedIdentifiers),
        ),
      );
      continue;
    }

    const name =
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property) ||
      ts.isGetAccessorDeclaration(property) ||
      ts.isSetAccessorDeclaration(property)
        ? propertyNameText(property.name)
        : null;

    if (
      name === null &&
      (ts.isPropertyAssignment(property) ||
        ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property))
    ) {
      presence = {
        isDeleted: 'unresolved',
        organizationId: 'unresolved',
      };
      continue;
    }

    if (name === 'organizationId') {
      presence.organizationId = 'present';
    }
    if (name === 'isDeleted') {
      presence.isDeleted = 'present';
    }

    if (ts.isPropertyAssignment(property) && name === 'AND') {
      presence = mergeScopePresence(
        presence,
        inspectWhereExpression(
          property.initializer,
          sourceFile,
          bindings,
          new Set(visitedIdentifiers),
        ),
      );
    }

    if (ts.isPropertyAssignment(property) && name === 'OR') {
      presence = mergeScopePresence(
        presence,
        inspectDisjunction(
          property.initializer,
          sourceFile,
          bindings,
          new Set(visitedIdentifiers),
        ),
      );
    }
  }

  return presence;
}

function collectCallCandidates(
  sourceFile: ts.SourceFile,
  tenantModelByDelegate: ReadonlyMap<string, string>,
): CallCandidate[] {
  const candidates: CallCandidate[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);

      if (
        ts.isPropertyAccessExpression(callee) &&
        PRISMA_WHERE_METHODS.has(callee.name.text)
      ) {
        const delegateExpression = unwrapExpression(callee.expression);

        if (ts.isPropertyAccessExpression(delegateExpression)) {
          const delegate = delegateExpression.name.text;
          const model = tenantModelByDelegate.get(delegate);

          if (model) {
            candidates.push({
              call: node,
              delegate,
              method: callee.name.text,
              model,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return candidates;
}

function lineForNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function validSuppressionReason(
  sourceLines: readonly string[],
  callLine: number,
): string | null {
  const precedingLine = sourceLines[callLine - 2];
  if (!precedingLine) {
    return null;
  }

  return precedingLine.match(TENANT_SCOPE_IGNORE_PATTERN)?.[1] ?? null;
}

function collectSuppressionViolations(
  sourceLines: readonly string[],
  file: string,
): TenantScopeSuppressionViolation[] {
  return sourceLines.flatMap((line, index) => {
    if (!line.includes(TENANT_SCOPE_IGNORE)) {
      return [];
    }

    if (TENANT_SCOPE_IGNORE_PATTERN.test(line)) {
      return [];
    }

    return [
      {
        file,
        line: index + 1,
        message:
          'Tenant scope suppressions must use "// tenant-scope-ignore: <non-empty reason>".',
      },
    ];
  });
}

function canonicalCallText(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): string {
  return printer
    .printNode(ts.EmitHint.Unspecified, call, sourceFile)
    .replace(/\s+/gu, ' ')
    .trim();
}

function fingerprintForFinding(
  file: string,
  candidate: CallCandidate,
  canonicalCall: string,
  occurrence: number,
  reason: TenantScopeFindingReason,
): string {
  return createHash('sha256')
    .update(
      [
        file,
        candidate.model,
        candidate.delegate,
        candidate.method,
        canonicalCall,
        String(occurrence),
        reason,
      ].join('\0'),
    )
    .digest('hex')
    .slice(0, 20);
}

function findingsForCandidate(
  candidate: CallCandidate,
  sourceFile: ts.SourceFile,
  file: string,
  bindings: ScopedWhereBindings,
  occurrence: number,
): TenantScopeFinding[] {
  const callLine = lineForNode(sourceFile, candidate.call);
  const sourceLines = sourceFile.text.split(/\r?\n/u);

  if (validSuppressionReason(sourceLines, callLine)) {
    return [];
  }

  const canonicalCall = canonicalCallText(candidate.call, sourceFile);
  const options = candidate.call.arguments[0];
  let reasons: TenantScopeFindingReason[];

  if (!options) {
    reasons = ['missing-where'];
  } else {
    const where = resolveProperty(options, 'where', sourceFile);

    if (where.kind === 'missing') {
      reasons = ['missing-where'];
    } else if (where.kind === 'unresolved') {
      reasons = ['unresolved-where'];
    } else {
      const presence = inspectWhereExpression(
        where.value,
        sourceFile,
        bindings,
      );

      if (
        presence.organizationId === 'unresolved' ||
        presence.isDeleted === 'unresolved'
      ) {
        reasons = ['unresolved-where'];
      } else {
        reasons = [];
        if (presence.organizationId === 'absent') {
          reasons.push('missing-organization-id');
        }
        if (presence.isDeleted === 'absent') {
          reasons.push('missing-is-deleted');
        }
      }
    }
  }

  return reasons.map((reason) => ({
    call: canonicalCall,
    delegate: candidate.delegate,
    file,
    fingerprint: fingerprintForFinding(
      file,
      candidate,
      canonicalCall,
      occurrence,
      reason,
    ),
    line: callLine,
    method: candidate.method,
    model: candidate.model,
    reason,
  }));
}

function compareFindings(
  left: TenantScopeFinding,
  right: TenantScopeFinding,
): number {
  return (
    compareText(left.file, right.file) ||
    left.line - right.line ||
    compareText(left.delegate, right.delegate) ||
    compareText(left.method, right.method) ||
    compareText(left.reason, right.reason) ||
    compareText(left.fingerprint, right.fingerprint)
  );
}

function scanSourceFile(
  filePath: string,
  rootDir: string,
  tenantModelByDelegate: ReadonlyMap<string, string>,
): Pick<TenantScopeCheckResult, 'findings' | 'suppressionViolations'> {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const file = normalizePath(path.relative(rootDir, filePath));
  const bindings = collectScopedWhereBindings(sourceFile);
  const candidates = collectCallCandidates(sourceFile, tenantModelByDelegate);
  const signatureOccurrences = new Map<string, number>();
  const findings: TenantScopeFinding[] = [];

  for (const candidate of candidates) {
    const signature = [
      candidate.delegate,
      candidate.method,
      canonicalCallText(candidate.call, sourceFile),
    ].join('\0');
    const occurrence = signatureOccurrences.get(signature) ?? 0;
    signatureOccurrences.set(signature, occurrence + 1);
    findings.push(
      ...findingsForCandidate(
        candidate,
        sourceFile,
        file,
        bindings,
        occurrence,
      ),
    );
  }

  return {
    findings,
    suppressionViolations: collectSuppressionViolations(
      sourceText.split(/\r?\n/u),
      file,
    ),
  };
}

export function runTenantScopeCheck(
  options: TenantScopeCheckOptions = {},
): TenantScopeCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const schemaPath = resolveFromRoot(
    rootDir,
    options.schemaPath ?? DEFAULT_SCHEMA_PATH,
  );
  const tenantModels = discoverTenantModels(readFileSync(schemaPath, 'utf8'));
  const tenantModelByDelegate = new Map(
    tenantModels.map(({ delegate, model }) => [delegate, model]),
  );
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort(compareText);
  const findings: TenantScopeFinding[] = [];
  const suppressionViolations: TenantScopeSuppressionViolation[] = [];

  for (const file of files) {
    const result = scanSourceFile(file, rootDir, tenantModelByDelegate);
    findings.push(...result.findings);
    suppressionViolations.push(...result.suppressionViolations);
  }

  return {
    filesScanned: files.length,
    findings: findings.sort(compareFindings),
    suppressionViolations: suppressionViolations.sort(
      (left, right) =>
        compareText(left.file, right.file) || left.line - right.line,
    ),
    tenantModels,
  };
}

function isTenantScopeBaselineEntry(
  value: unknown,
): value is TenantScopeBaselineEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry);
  return (
    keys.length === TENANT_SCOPE_BASELINE_ENTRY_KEYS.size &&
    keys.every((key) => TENANT_SCOPE_BASELINE_ENTRY_KEYS.has(key)) &&
    typeof entry.delegate === 'string' &&
    typeof entry.file === 'string' &&
    typeof entry.fingerprint === 'string' &&
    TENANT_SCOPE_FINGERPRINT_PATTERN.test(entry.fingerprint) &&
    typeof entry.method === 'string' &&
    typeof entry.model === 'string' &&
    typeof entry.reason === 'string' &&
    TENANT_SCOPE_FINDING_REASONS.has(entry.reason as TenantScopeFindingReason)
  );
}

export function parseTenantScopeBaseline(source: string): TenantScopeBaseline {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  const entries = parsed.entries;
  const keys = Object.keys(parsed);

  if (
    keys.length !== TENANT_SCOPE_BASELINE_KEYS.size ||
    !keys.every((key) => TENANT_SCOPE_BASELINE_KEYS.has(key)) ||
    parsed.version !== TENANT_SCOPE_BASELINE_VERSION ||
    typeof parsed.schemaPath !== 'string' ||
    parsed.schemaPath.length === 0 ||
    !Array.isArray(entries) ||
    !entries.every(isTenantScopeBaselineEntry)
  ) {
    throw new Error(
      `Invalid tenant-scope baseline. Expected version ${TENANT_SCOPE_BASELINE_VERSION}.`,
    );
  }

  const fingerprints = new Set<string>();
  for (const entry of entries) {
    if (fingerprints.has(entry.fingerprint)) {
      throw new Error(
        `Invalid tenant-scope baseline: duplicate fingerprint ${entry.fingerprint}.`,
      );
    }
    fingerprints.add(entry.fingerprint);
  }

  return {
    entries,
    schemaPath: parsed.schemaPath,
    version: TENANT_SCOPE_BASELINE_VERSION,
  };
}

function baselineEntry(finding: TenantScopeFinding): TenantScopeBaselineEntry {
  return {
    delegate: finding.delegate,
    file: finding.file,
    fingerprint: finding.fingerprint,
    method: finding.method,
    model: finding.model,
    reason: finding.reason,
  };
}

function compareBaselineEntries(
  left: TenantScopeBaselineEntry,
  right: TenantScopeBaselineEntry,
): number {
  return (
    compareText(left.file, right.file) ||
    compareText(left.delegate, right.delegate) ||
    compareText(left.method, right.method) ||
    compareText(left.reason, right.reason) ||
    compareText(left.fingerprint, right.fingerprint)
  );
}

function baselineEntryKey(entry: TenantScopeBaselineEntry): string {
  return [
    entry.file,
    entry.model,
    entry.delegate,
    entry.method,
    entry.reason,
    entry.fingerprint,
  ].join('\0');
}

export function diffTenantScopeBaseline(
  findings: readonly TenantScopeFinding[],
  baseline: readonly TenantScopeBaselineEntry[],
): TenantScopeBaselineDiff {
  const currentByKey = new Map(
    findings.map((finding) => [
      baselineEntryKey(baselineEntry(finding)),
      finding,
    ]),
  );
  const baselineByKey = new Map(
    baseline.map((entry) => [baselineEntryKey(entry), entry]),
  );

  return {
    regressions: findings
      .filter(
        (finding) =>
          !baselineByKey.has(baselineEntryKey(baselineEntry(finding))),
      )
      .sort(compareFindings),
    stale: baseline
      .filter((entry) => !currentByKey.has(baselineEntryKey(entry)))
      .sort(compareBaselineEntries),
  };
}

function serializeTenantScopeBaseline(
  findings: readonly TenantScopeFinding[],
  schemaPath: string,
): string {
  const baseline: TenantScopeBaseline = {
    entries: findings.map(baselineEntry).sort(compareBaselineEntries),
    schemaPath: normalizePath(schemaPath),
    version: TENANT_SCOPE_BASELINE_VERSION,
  };

  return `${JSON.stringify(baseline, null, 2)}\n`;
}

function readCliValue(
  arguments_: readonly string[],
  index: number,
  name: string,
): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseCliOptions(arguments_: readonly string[]): CliOptions {
  let rootDir = process.cwd();
  let schemaPath = DEFAULT_SCHEMA_PATH;
  let baselinePath = DEFAULT_BASELINE_PATH;
  let updateBaseline = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (!argument || argument === '--') {
      continue;
    }
    if (argument === '--update-baseline') {
      updateBaseline = true;
      continue;
    }
    if (argument === '--root-dir') {
      rootDir = readCliValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--schema-path') {
      schemaPath = readCliValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--baseline-path') {
      baselinePath = readCliValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    baselinePath,
    rootDir: path.resolve(rootDir),
    schemaPath,
    updateBaseline,
  };
}

function describeFinding(finding: TenantScopeFinding): string {
  const messages: Record<TenantScopeFindingReason, string> = {
    'missing-is-deleted':
      'where is missing isDeleted; use scopedWhere(organizationId, where)',
    'missing-organization-id':
      'where is missing organizationId; use scopedWhere(organizationId, where)',
    'missing-where':
      'query has no statically visible where clause; add scopedWhere(organizationId, where)',
    'unresolved-where':
      'where is assembled dynamically and cannot be proven tenant-scoped; use scopedWhere at this call or add a reasoned suppression',
  };

  return (
    `- ${finding.file}:${finding.line} ${finding.delegate}.${finding.method} ` +
    `[${finding.reason}] ${messages[finding.reason]}`
  );
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const result = runTenantScopeCheck(options);
  const baselinePath = resolveFromRoot(options.rootDir, options.baselinePath);

  if (result.suppressionViolations.length > 0) {
    console.error('check:tenant-scope — invalid suppression comment(s):');
    for (const violation of result.suppressionViolations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  if (options.updateBaseline) {
    writeFileSync(
      baselinePath,
      serializeTenantScopeBaseline(result.findings, options.schemaPath),
    );
    console.log(
      `check:tenant-scope — baseline rewritten with ${result.findings.length} finding(s) ` +
        `across ${result.filesScanned} file(s) and ${result.tenantModels.length} tenant model(s).`,
    );
    return;
  }

  const baseline = parseTenantScopeBaseline(readFileSync(baselinePath, 'utf8'));
  if (
    normalizePath(baseline.schemaPath) !== normalizePath(options.schemaPath)
  ) {
    throw new Error(
      `Tenant-scope baseline targets ${baseline.schemaPath}, but the guard is scanning ${options.schemaPath}.`,
    );
  }
  const diff = diffTenantScopeBaseline(result.findings, baseline.entries);

  if (diff.regressions.length === 0 && diff.stale.length === 0) {
    console.log(
      `check:tenant-scope — API/shared-server surface: ${result.filesScanned} files scanned against ` +
        `${result.tenantModels.length} schema-derived tenant model(s); ` +
        `${result.findings.length} baselined finding(s), no new ones.`,
    );
    return;
  }

  if (diff.regressions.length > 0) {
    console.error(
      'check:tenant-scope — new tenant-scope finding(s). Tenant Prisma queries must prove both organizationId and isDeleted in where:',
    );
    for (const finding of diff.regressions) {
      console.error(describeFinding(finding));
    }
  }

  if (diff.stale.length > 0) {
    console.error(
      '\ncheck:tenant-scope — baseline is stale. Remove resolved entries (or run --update-baseline) so existing debt can only shrink:',
    );
    for (const entry of diff.stale) {
      console.error(
        `- ${entry.file} ${entry.delegate}.${entry.method} [${entry.reason}] fingerprint=${entry.fingerprint}`,
      );
    }
  }

  process.exit(1);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:tenant-scope — ${message}`);
    process.exit(1);
  }
}
