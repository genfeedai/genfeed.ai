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
 * The guard fails on `isEntityId(<user id>)` calls and on `@IsEntityId()`
 * properties that hold user IDs, where a user ID is named `user`, `userId(s)`,
 * `<prefix>UserId(s)`, or `<user>.id`. Fields named otherwise (for example
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

/** `userId`, `dto.ownerUserId`, `user`, `session.user.id`, `targetUser.id`. */
function userIdName(expression: ts.Expression): string | undefined {
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
  return nameOf(node.expression) === ENTITY_ID_CHECK;
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
    !sourceText.includes(ENTITY_ID_DECORATOR)
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
      const [argument] = node.arguments;
      const name = argument ? userIdName(argument) : undefined;
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
          ? `isEntityId(${violation.name})`
          : `@IsEntityId() ${violation.name}`;
      console.error(
        `- ${violation.file}:${violation.line}: ${site}. User IDs are opaque; check a non-empty string and authorize by membership.`,
      );
    }
    process.exit(1);
  }

  console.log('Opaque user ID guard passed.');
}
