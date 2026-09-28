/**
 * Guard: a client that sends its own `Authorization` header must also send the
 * routed-organization header (#5393).
 *
 * `CombinedAuthGuard` rejects organization drift only when the request carries
 * `x-genfeed-organization-id`. The axios interceptor adds it for every
 * `HTTPBaseService`; a raw `fetch`, raw axios call or socket handshake that
 * builds its own bearer header skips that interceptor and silently loses the
 * check. Every such site must take the header from the single rule in
 * `packages/services/core/interceptor.service.ts`:
 *
 * - an object literal with an `Authorization` key spreads
 *   `getRequestOrganizationHeaders(...)` or `this.requestOrganizationHeaders()`
 *   in the same literal (or in the literal it is conditionally spread into);
 * - an imperative write (`headers.Authorization = …`,
 *   `headers.set('authorization', …)`, a `[['Authorization', …]]` header
 *   tuple) sits in a function that calls one of those helpers.
 *
 * A key computed from a non-literal expression cannot be resolved statically
 * and is not checked.
 *
 * Exemptions are listed below with their reason; there is no baseline.
 *
 *   bun run check:raw-fetch-org-header
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseSourceFile, scriptKindFor } from './parse-source-file';

const FREE_HELPER = 'getRequestOrganizationHeaders';
const METHOD_HELPER = 'requestOrganizationHeaders';
const AUTHORIZATION = /^authorization$/i;

const DEFAULT_INCLUDE_GLOBS = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  '**/*.stories.{ts,tsx}',
  '**/*.d.ts',
  '**/__mocks__/**',
  '**/__fixtures__/**',
  '**/fixtures/**',
  '**/__tests__/**',
  '**/tests/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

export type RawFetchOrgHeaderExemption = {
  glob: string;
  reason: string;
};

export const RAW_FETCH_ORG_HEADER_EXEMPTIONS: readonly RawFetchOrgHeaderExemption[] =
  [
    {
      glob: 'apps/server/**',
      reason:
        'Server code: the header is read here, and server-to-server calls carry no routed browser organization.',
    },
    {
      glob: 'packages/libs/**',
      reason: 'Server-only infrastructure; never runs in the routed shell.',
    },
    {
      glob: 'packages/cli/**',
      reason:
        'CLI authenticates with an API key whose organization is fixed at issue time.',
    },
    {
      glob: 'packages/integrations/**',
      reason:
        'Bot integrations call the internal API with a service key, not a routed user session.',
    },
    {
      glob: 'apps/app/proxy.ts',
      reason:
        'Server-side Next proxy: it resolves the workspace before any organization is routed.',
    },
    {
      glob: 'apps/app/app/(public)/**',
      reason:
        'Public OAuth consent, CLI and agent-claim pages run outside the organization shell; the grant is user-level.',
    },
    {
      glob: 'packages/services/core/socket.service.ts',
      reason:
        'The global socket outlives organization switches, so a handshake header would go stale; room joins carry the organization instead.',
    },
    {
      glob: 'packages/helpers/src/integrations/connect-genfeed.helper.ts',
      reason:
        'Renders an MCP client configuration snippet for the user to paste; it sends no request.',
    },
    {
      glob: 'apps/desktop/**',
      reason:
        'Electron main-process clients (cloud sync, BYOK providers) have no routed organization; the renderer runs the app shell.',
    },
    {
      glob: 'apps/mobile/**',
      reason:
        "No client-routed organization: requests act on the session's active organization.",
    },
    {
      glob: 'apps/extensions/**',
      reason:
        "Browser and IDE extensions have no organization routing; requests act on the session's active organization.",
    },
    {
      glob: 'apps/website/**',
      reason:
        'Marketing site; its only bearer header is a GitHub releases token.',
    },
  ];

export type RawFetchOrgHeaderViolation = {
  file: string;
  line: number;
  message: string;
};

export type RawFetchOrgHeaderCheckOptions = {
  exemptions?: readonly RawFetchOrgHeaderExemption[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type RawFetchOrgHeaderCheckResult = {
  authorizationSiteCount: number;
  scannedFileCount: number;
  violations: RawFetchOrgHeaderViolation[];
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  // `{ ['Authorization']: … }`
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(name.expression)
  ) {
    return name.expression.text;
  }
  return undefined;
}

/**
 * `Authorization` as an identifier key is always the header. A lowercase
 * identifier key is a domain field (`authorization: 'user'` in the action
 * registry), so only a quoted key matches case-insensitively.
 */
function isAuthorizationKey(name: ts.PropertyName): boolean {
  if (ts.isIdentifier(name)) {
    return name.text === 'Authorization';
  }
  const text = propertyNameText(name);
  return text !== undefined && AUTHORIZATION.test(text);
}

function isHelperCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === FREE_HELPER;
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
    callee.name.text === METHOD_HELPER
  );
}

function spreadsHelper(literal: ts.ObjectLiteralExpression): boolean {
  return literal.properties.some(
    (property) =>
      ts.isSpreadAssignment(property) && isHelperCall(property.expression),
  );
}

/**
 * `{ ...helper(), ...(token ? { Authorization } : {}) }` is covered by the
 * outer literal, so walk out through the expressions that only choose between
 * literals — parentheses, ternaries, `&&`/`||`/`??` — and the spread that
 * places the chosen literal into an enclosing one.
 */
function isCoveredLiteral(literal: ts.ObjectLiteralExpression): boolean {
  let current: ts.ObjectLiteralExpression | undefined = literal;
  while (current) {
    if (spreadsHelper(current)) return true;

    let node: ts.Node = current;
    let parent: ts.Node = node.parent;
    while (
      ts.isParenthesizedExpression(parent) ||
      (ts.isConditionalExpression(parent) && parent.condition !== node) ||
      (ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(parent.operatorToken.kind))
    ) {
      node = parent;
      parent = node.parent;
    }

    current =
      ts.isSpreadAssignment(parent) &&
      ts.isObjectLiteralExpression(parent.parent)
        ? parent.parent
        : undefined;
  }
  return false;
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) && 'body' in current) {
      return current as ts.FunctionLikeDeclaration;
    }
    current = current.parent;
  }
  return null;
}

function containsHelperCall(root: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (isHelperCall(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function isImperativeAuthorizationWrite(node: ts.Node): boolean {
  // headers.Authorization = …  /  headers['authorization'] = …
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    const target = node.left;
    if (ts.isPropertyAccessExpression(target)) {
      // Same case rule as object keys: `action.authorization` is a domain field.
      return target.name.text === 'Authorization';
    }
    if (
      ts.isElementAccessExpression(target) &&
      ts.isStringLiteralLike(target.argumentExpression)
    ) {
      return AUTHORIZATION.test(target.argumentExpression.text);
    }
    return false;
  }

  // headers.set('Authorization', …) / headers.append(…)
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ['append', 'set'].includes(node.expression.name.text)
  ) {
    const [name] = node.arguments;
    return (
      name !== undefined &&
      ts.isStringLiteralLike(name) &&
      AUTHORIZATION.test(name.text)
    );
  }

  // new Headers([['Authorization', …]]) / headers: [['authorization', …]]
  if (
    ts.isArrayLiteralExpression(node) &&
    ts.isArrayLiteralExpression(node.parent)
  ) {
    const [name] = node.elements;
    return (
      name !== undefined &&
      ts.isStringLiteralLike(name) &&
      AUTHORIZATION.test(name.text)
    );
  }

  return false;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function inspectFile(
  filePath: string,
  rootDir: string,
): { siteCount: number; violations: RawFetchOrgHeaderViolation[] } {
  const sourceText = readFileSync(filePath, 'utf8');
  if (!/authorization/i.test(sourceText)) {
    return { siteCount: 0, violations: [] };
  }

  const sourceFile = parseSourceFile(
    filePath,
    sourceText,
    true,
    scriptKindFor(filePath),
  );
  const file = normalizePath(path.relative(rootDir, filePath));
  const violations: RawFetchOrgHeaderViolation[] = [];
  let siteCount = 0;

  const visit = (node: ts.Node): void => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      isAuthorizationKey(node.name) &&
      ts.isObjectLiteralExpression(node.parent)
    ) {
      siteCount += 1;
      if (!isCoveredLiteral(node.parent)) {
        violations.push({
          file,
          line: lineOf(sourceFile, node),
          message: `Authorization header without the routed-organization header. Spread ...${FREE_HELPER}() (or ...this.${METHOD_HELPER}() in an HTTPBaseService) into the same headers object.`,
        });
      }
    } else if (isImperativeAuthorizationWrite(node)) {
      siteCount += 1;
      const owner = enclosingFunction(node);
      if (!owner || !containsHelperCall(owner)) {
        violations.push({
          file,
          line: lineOf(sourceFile, node),
          message: `Authorization header written without the routed-organization header. Merge ${FREE_HELPER}() (or this.${METHOD_HELPER}()) into the same headers in this function.`,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { siteCount, violations };
}

export function runRawFetchOrgHeaderCheck(
  options: RawFetchOrgHeaderCheckOptions = {},
): RawFetchOrgHeaderCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const exemptions = options.exemptions ?? RAW_FETCH_ORG_HEADER_EXEMPTIONS;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: [
      ...(options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS),
      ...exemptions.map(({ glob }) => glob),
    ],
    nodir: true,
  }).sort(compareText);

  let authorizationSiteCount = 0;
  const violations: RawFetchOrgHeaderViolation[] = [];
  for (const file of files) {
    const result = inspectFile(file, rootDir);
    authorizationSiteCount += result.siteCount;
    violations.push(...result.violations);
  }

  return {
    authorizationSiteCount,
    scannedFileCount: files.length,
    violations,
  };
}

function main(): void {
  const result = runRawFetchOrgHeaderCheck();

  if (result.violations.length > 0) {
    console.error(
      'check:raw-fetch-org-header — client Authorization headers must carry the routed organization (#5393):',
    );
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `check:raw-fetch-org-header — ${result.scannedFileCount} files scanned; ` +
      `${result.authorizationSiteCount} Authorization header site(s) all carry the routed organization.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:raw-fetch-org-header — ${message}`);
    process.exit(1);
  }
}
