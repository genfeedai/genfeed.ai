/**
 * Guardrail: authenticated user IDs are opaque strings (#3626, #5410).
 *
 * `users.id` is the canonical user reference, but production holds legacy
 * Better Auth base62 IDs beside the UUIDs the current auth factory issues.
 * `isEntityId` / `@IsEntityId()` only accept Genfeed-generated entity IDs, so
 * applying them to a user ID rejects valid legacy accounts before membership
 * or ownership is ever checked. Treat user IDs as non-empty strings and
 * authorize them through membership and ownership queries.
 *
 * The guard fails when an entity-id check runs on a user ID:
 * - `isEntityId(...)`, `*.validateEntityId(...)` and
 *   `EntityIdUtil.validate` / `validateMany` / `isValid` / `toValidId` calls
 *   whose value, or whose field-name argument, names a user ID;
 * - `@IsEntityId()` on a property that names a user ID.
 * A user ID is named `user`, `userId(s)`, `<prefix>UserId(s)` or `<user>.id`,
 * on either side of `??` / `||`. Values named otherwise (for example
 * `memberIds` holding user IDs) are outside what a name check can see.
 *
 *   bun run check:opaque-user-ids
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseSourceFile, scriptKindFor } from './parse-source-file';

const ENTITY_ID_CHECK = 'isEntityId';
const ENTITY_ID_DECORATOR = 'IsEntityId';
/** Helpers that apply the entity-id format check, by receiver and method. */
const ENTITY_ID_UTIL = 'EntityIdUtil';
const ENTITY_ID_UTIL_METHODS = new Set([
  'isValid',
  'toValidId',
  'validate',
  'validateMany',
]);
const ENTITY_ID_METHODS = new Set([ENTITY_ID_CHECK, 'validateEntityId']);
const USER_ID_NAME = /^(?:user|userIds?|[a-z][A-Za-z0-9]*UserIds?)$/u;
const USER_OBJECT_NAME = /^(?:user|[a-z][A-Za-z0-9]*User)$/u;

const DEFAULT_INCLUDE_GLOBS = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  '**/*.d.ts',
  '**/__mocks__/**',
  '**/__tests__/**',
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

export type OpaqueUserIdViolation = {
  file: string;
  kind: 'entity-id-call' | 'entity-id-decorator';
  line: number;
  name: string;
};

export type OpaqueUserIdOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function nameOf(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

/**
 * `userId`, `dto.ownerUserId`, `user`, `session.user.id`, `targetUser.id`,
 * and either side of `user.userId ?? user.id`.
 */
function userIdName(expression: ts.Expression): string | undefined {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isAsExpression(expression)
  ) {
    return userIdName(expression.expression);
  }
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return userIdName(expression.left) ?? userIdName(expression.right);
  }
  const name = nameOf(expression);
  if (name === undefined) {
    return undefined;
  }
  if (USER_ID_NAME.test(name)) {
    return name;
  }
  if (name === 'id' && ts.isPropertyAccessExpression(expression)) {
    const owner = nameOf(expression.expression);
    if (owner !== undefined && USER_OBJECT_NAME.test(owner)) {
      return `${owner}.id`;
    }
  }
  return undefined;
}

function isEntityIdCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === ENTITY_ID_CHECK;
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  const method = callee.name.text;
  return (
    ENTITY_ID_METHODS.has(method) ||
    (nameOf(callee.expression) === ENTITY_ID_UTIL &&
      ENTITY_ID_UTIL_METHODS.has(method))
  );
}

/** The value checked, or the field name a helper reports it under. */
function calledOnUserId(node: ts.CallExpression): string | undefined {
  const [value, fieldName] = node.arguments;
  const valueName = value ? userIdName(value) : undefined;
  if (valueName !== undefined) {
    return valueName;
  }
  if (
    fieldName &&
    ts.isStringLiteralLike(fieldName) &&
    USER_ID_NAME.test(fieldName.text)
  ) {
    return fieldName.text;
  }
  return undefined;
}

function hasEntityIdDecorator(node: ts.PropertyDeclaration): boolean {
  return (ts.getDecorators(node) ?? []).some(
    (decorator) =>
      ts.isCallExpression(decorator.expression) &&
      nameOf(decorator.expression.expression) === ENTITY_ID_DECORATOR,
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

export function collectOpaqueUserIdViolations(
  file: string,
  sourceText: string,
): OpaqueUserIdViolation[] {
  if (
    !sourceText.includes(ENTITY_ID_CHECK) &&
    !sourceText.includes(ENTITY_ID_DECORATOR) &&
    !sourceText.includes(ENTITY_ID_UTIL) &&
    !sourceText.includes('validateEntityId')
  ) {
    return [];
  }

  const sourceFile = parseSourceFile(
    file,
    sourceText,
    true,
    scriptKindFor(file),
  );
  const violations: OpaqueUserIdViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isEntityIdCall(node)) {
      const name = calledOnUserId(node);
      if (name !== undefined) {
        violations.push({
          file,
          kind: 'entity-id-call',
          line: lineOf(sourceFile, node),
          name,
        });
      }
    }

    if (
      ts.isPropertyDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      USER_ID_NAME.test(node.name.text) &&
      hasEntityIdDecorator(node)
    ) {
      violations.push({
        file,
        kind: 'entity-id-decorator',
        line: lineOf(sourceFile, node.name),
        name: node.name.text,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function checkOpaqueUserIds(
  options: OpaqueUserIdOptions = {},
): OpaqueUserIdViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => file.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right));

  return files.flatMap((file) =>
    collectOpaqueUserIdViolations(
      file,
      readFileSync(path.join(rootDir, file), 'utf8'),
    ),
  );
}

if (import.meta.main) {
  const violations = checkOpaqueUserIds();

  if (violations.length > 0) {
    console.error('User IDs validated as Genfeed entity IDs:');
    for (const violation of violations) {
      const site =
        violation.kind === 'entity-id-call'
          ? `entity-id check on ${violation.name}`
          : `@IsEntityId() ${violation.name}`;
      console.error(
        `- ${violation.file}:${violation.line}: ${site}. User IDs are opaque; check a non-empty string and authorize by membership.`,
      );
    }
    process.exit(1);
  }

  console.log('Opaque user ID guard passed.');
}
