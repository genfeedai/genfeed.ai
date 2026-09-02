import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import * as ts from 'typescript';
import { RELATION_ALIAS_READ_BASELINE } from './relation-alias-reads.baseline';

/**
 * Guard: forbid reading Mongo-era relation aliases off Prisma rows in the
 * server apps.
 *
 * `schema.prisma` splits scalar foreign keys (`organizationId`, `brandId`, …)
 * from relation fields (`organization`, `brand`, …). The scalar is always on
 * the row; the relation is present only when the query explicitly `include`d
 * it, and `BaseService.findOne` defaults to no populate. The legacy
 * `*Document` types still declare the relation props as optional, so reading
 * one type-checks while its runtime value is call-path dependent — a populated
 * object, a back-filled id string, or `undefined`.
 *
 * Every failure mode is silent:
 *   - `String(post.organization)` writes "[object Object]" or the literal
 *     "undefined" into a foreign key column (Postgres P2003).
 *   - `post.brand.toString()` throws a TypeError that a surrounding catch eats.
 *   - `{ organization: post.organization }` as a filter has its `undefined`
 *     value dropped by `normalizeWhere`, silently unscoping a tenant query.
 *
 * Fix: read the scalar FK, via `resolveRelationId` / `requireRelationId`
 * (apps/server/api/src/shared/utils/relation-id/relation-id.util.ts). Those two
 * are the sanctioned readers and are exempt here.
 *
 * Inventory — the ratchet flags every identity-shaped alias use it can prove
 * from syntax, then holds the count at or below the baseline:
 *   - coercing a relation alias to a string id
 *   - passing a relation alias string through a helper key array for a row
 *   - feeding a relation alias into an id-shaped filter value
 *   - comparing a relation alias to an id (`post.organization !== orgId`)
 *   - using `_id` / `organization` / `user` as an object key for a scalar id
 *
 * Sub-property walks (`post.organization.slug`) stay allowed: those only work
 * when the relation is populated. Auth identity values
 * (`user.organizationId`) are not row reads and are not flagged as
 * filter values.
 *
 * @see .agents/memory/rules/prisma_legacy_alias_fields.md
 */

const INCLUDE_GLOBS = [
  'apps/server/**/*.ts',
  'packages/hooks/**/*.ts',
  'packages/interfaces/src/**/*.ts',
  'packages/models/**/*.ts',
  'packages/pages/**/*.ts',
  'packages/serializers/src/**/*.ts',
  'packages/services/**/*.ts',
];

const IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/fixtures/**',
  '**/generated/**',
];

const SCHEMA_PATH = 'packages/prisma/prisma/schema.prisma';

const BASELINE_PATH = 'scripts/architecture/relation-alias-reads.baseline.ts';

const BASELINE_HEADER = `/**
 * Ratchet baseline for check-relation-alias-reads.ts.
 *
 * Per-file counts of pre-existing relation-alias reads, captured 2026-07-24.
 * Counts may ONLY go down — the guard fails on a file that gains one, and also
 * on a file that drops below its entry, so whoever fixes a site prunes the
 * number in the same PR. Regenerate with:
 *
 *   bun run check:relation-alias-reads --update-baseline
 *
 * When this map is empty, delete it and flip the guard to a plain ban.
 *
 * Every entry is a real instance of the defect fixed in #2033, not a false
 * positive — the backlog is large because the hazard is systemic, not because
 * the guard is noisy.
 */
`;

/**
 * A row binding is only recognised when the code says so syntactically: an
 * explicit `*Document` / `*Entity` annotation, or a binding initialised from a
 * `BaseService` read. Anything the guard cannot classify is left alone — this
 * check is deliberately conservative, because the alias names double as plain
 * declared string fields on job DTOs and auth metadata.
 */
const ROW_TYPE_PATTERN = /(?:Document|Entity)$/;

const ROW_READ_METHODS = new Set([
  'find',
  'findAll',
  'findById',
  'findFirst',
  'findMany',
  'findOne',
  'findOneById',
]);
const FILTER_METHODS = new Set([
  'count',
  'delete',
  'deleteMany',
  'find',
  'findAll',
  'findById',
  'findFirst',
  'findMany',
  'findOne',
  'findOneById',
  'patchAll',
  'removeAll',
  'updateMany',
]);
const ROW_ARRAY_CALLBACK_METHODS = new Set([
  'every',
  'filter',
  'find',
  'flatMap',
  'map',
  'some',
]);

const SUPPRESSION_COMMENT = 'relation-alias-ok';

const IDENTITY_ALIAS_KEYS = new Set(['_id', 'organization', 'user']);

const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

export type RelationAliasRule =
  | 'filter-value'
  | 'helper-key-array'
  | 'id-coercion'
  | 'identity-comparison'
  | 'identity-key';

export type RelationAliasViolation = {
  alias: string;
  file: string;
  line: number;
  receiver: string;
  rule: RelationAliasRule;
  scalar: string;
};

export type RelationAliasCheckOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  schemaPath?: string;
};

export type RelationAliasCheckResult = {
  aliasCount: number;
  filesScanned: number;
  violations: RelationAliasViolation[];
};

/**
 * Ground truth comes from the schema, not a hand-maintained list: every
 * relation field declared with `@relation(fields: [<scalar>])` whose scalar is
 * named `<field>Id`. That pairing is exactly the hazard — an alias that has a
 * scalar twin the code should have read instead.
 */
export function collectRelationAliases(
  schemaSource: string,
): Map<string, string> {
  const aliases = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const line of schemaSource.split('\n')) {
    const field = /^[ \t]+(\w+)[ \t]+\S+/.exec(line);
    if (!field) {
      continue;
    }

    const name = field[1];
    const fkList = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(line);
    const isAliasDeclaration =
      fkList?.[1]
        .split(',')
        .map((entry) => entry.trim())
        .includes(`${name}Id`) ?? false;

    if (isAliasDeclaration) {
      aliases.set(name, `${name}Id`);
    } else {
      ambiguous.add(name);
    }
  }

  // A name that is *also* declared as something else somewhere in the schema
  // can't be classified from the property access alone. `metadata` is a
  // `Metadata?` relation on one model and a plain `Json?` column on a dozen
  // others; `source`, `content` and `plan` are the same story. With no
  // type checker the guard cannot tell which model a receiver came from, so
  // those names are dropped entirely. What survives — `organization`, `brand`,
  // `user`, `credential` and friends — means "relation" everywhere in the
  // schema, which is what makes a read of it unambiguously wrong.
  for (const name of ambiguous) {
    aliases.delete(name);
  }

  // `_id` was the Mongo document identifier. Prisma rows expose only `id`;
  // treating it as a canonical pair lets the same coercion/filter rules catch
  // stale row reads without conflating intentional external `_id` payloads.
  aliases.set('_id', 'id');

  return aliases;
}

function annotationTypeName(node: ts.TypeNode | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isTypeReferenceNode(node)) {
    let name: ts.EntityName = node.typeName;
    while (ts.isQualifiedName(name)) {
      name = name.right;
    }
    return name.text;
  }
  // `post: PostDocument | null` — a nullable row is still a row.
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      const inner = annotationTypeName(member);
      if (inner && ROW_TYPE_PATTERN.test(inner)) {
        return inner;
      }
    }
  }
  return null;
}

function isRowAnnotation(node: ts.TypeNode | undefined): boolean {
  const name = annotationTypeName(node);
  return name !== null && ROW_TYPE_PATTERN.test(name);
}

function unwrapAwait(expression: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expression) ? expression.expression : expression;
}

/** `await this.postsService.findOne(...)` and friends yield a Prisma row. */
function isRowReadCall(expression: ts.Expression | undefined): boolean {
  if (!expression) {
    return false;
  }
  const call = unwrapAwait(expression);
  if (!ts.isCallExpression(call)) {
    return false;
  }
  const callee = call.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ROW_READ_METHODS.has(callee.name.text)
  ) {
    return false;
  }

  if (callee.name.text !== 'find') {
    return true;
  }

  const receiver = callee.expression;
  return (
    receiver.kind === ts.SyntaxKind.ThisKeyword ||
    (ts.isIdentifier(receiver) && /service$/i.test(receiver.text)) ||
    (ts.isPropertyAccessExpression(receiver) &&
      /service$/i.test(receiver.name.text))
  );
}

/**
 * Collects identifiers that hold a Prisma row, per file. Scope is ignored on
 * purpose: a name bound to a row anywhere in a file is treated as a row
 * everywhere in it. Shadowing the same identifier with a non-row value in the
 * same file is not a pattern this codebase uses, and erring toward reporting
 * keeps the guard from going quiet on a real defect.
 */
function collectRowBindings(sourceFile: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  const ambiguousCallbackBindings = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isParameter(node) &&
      ts.isIdentifier(node.name) &&
      isRowAnnotation(node.type)
    ) {
      bindings.add(node.name.text);
    }

    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      if (isRowAnnotation(node.type)) {
        bindings.add(node.name.text);
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (isRowAnnotation(node.type) || isRowReadCall(node.initializer)) {
        bindings.add(node.name.text);
      }
    }

    // `for (const post of posts.docs)` / `for (const post of rows)` where the
    // iterated value already traces back to a row read.
    if (ts.isForOfStatement(node)) {
      const declaration = ts.isVariableDeclarationList(node.initializer)
        ? node.initializer.declarations[0]
        : undefined;
      if (declaration && ts.isIdentifier(declaration.name)) {
        const source = node.expression;
        const root = ts.isPropertyAccessExpression(source)
          ? source.expression
          : source;
        if (
          (ts.isIdentifier(root) && bindings.has(root.text)) ||
          isRowReadCall(source)
        ) {
          bindings.add(declaration.name.text);
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ROW_ARRAY_CALLBACK_METHODS.has(node.expression.name.text) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const callback = node.arguments[0];
      if (
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        const parameter = callback.parameters[0];
        if (parameter && ts.isIdentifier(parameter.name)) {
          const name = parameter.name.text;
          if (bindings.has(node.expression.expression.text)) {
            if (!ambiguousCallbackBindings.has(name)) {
              bindings.add(name);
            }
          } else if (bindings.has(name)) {
            ambiguousCallbackBindings.add(name);
            bindings.delete(name);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  // Two passes: a `for...of` may iterate a binding declared earlier in source
  // order but visited later through nesting.
  visit(sourceFile);
  visit(sourceFile);

  return bindings;
}

/**
 * A cast, a non-null assertion, or a pair of parentheses changes nothing about
 * what the read evaluates to at runtime — but each one inserts a node between
 * the read and the parent that decides how the value is consumed. Walk out
 * through them so `{ credential: post.credential as string }` is matched on the
 * same terms as `{ credential: post.credential }`.
 *
 * `as string` on an alias is in fact the more dangerous spelling: it is exactly
 * the annotation that silences the type error the plain read would have raised.
 */
function unwrapValueExpression(access: ts.Expression): ts.Expression {
  let current: ts.Expression = access;

  while (current.parent) {
    const parent = current.parent;
    const isTransparent =
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent);

    if (!isTransparent || parent.expression !== current) {
      break;
    }

    current = parent;
  }

  return current;
}

/**
 * `String(post.brand)`, `post.brand.toString()`, `` `${post.brand}` `` — every
 * one of these produces "[object Object]" when the relation is populated and
 * the literal "undefined" when it is not. Neither is ever a valid foreign key.
 */
function isIdCoercion(access: ts.PropertyAccessExpression): boolean {
  const value = unwrapValueExpression(access);
  const parent = value.parent;
  if (!parent) {
    return false;
  }

  if (
    ts.isCallExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    parent.expression.text === 'String'
  ) {
    return parent.arguments.includes(value);
  }

  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === value &&
    parent.name.text === 'toString' &&
    parent.parent &&
    ts.isCallExpression(parent.parent)
  ) {
    return true;
  }

  return ts.isTemplateSpan(parent);
}

function looksLikeIdOperand(expression: ts.Expression): boolean {
  const value = unwrapInputExpression(expression);
  if (ts.isIdentifier(value)) {
    return /Id$/i.test(value.text) || value.text === 'id';
  }
  if (ts.isPropertyAccessExpression(value)) {
    return /Id$/i.test(value.name.text) || value.name.text === 'id';
  }
  return ts.isStringLiteral(value);
}

/**
 * `if (post.organization !== orgId)` — `undefined === undefined` passes, so a
 * tenant gate written against the alias never runs.
 */
function isIdentityComparison(access: ts.PropertyAccessExpression): boolean {
  const value = unwrapValueExpression(access);
  const parent = value.parent;
  if (!parent || !ts.isBinaryExpression(parent)) {
    return false;
  }
  if (!COMPARISON_OPERATORS.has(parent.operatorToken.kind)) {
    return false;
  }
  const other = parent.left === value ? parent.right : parent.left;
  return looksLikeIdOperand(other);
}

function isScalarIdInitializer(expression: ts.Expression): boolean {
  const value = unwrapInputExpression(expression);
  return (
    ts.isIdentifier(value) && (/Id$/i.test(value.text) || value.text === 'id')
  );
}

/**
 * `{ organization: organizationId }` / `{ user: userId }` / `{ _id: id }` —
 * the server reads the scalar FK, so an alias key is dropped or never matches.
 */
function identityKeyFromAssignment(
  node: ts.PropertyAssignment,
  aliases: ReadonlyMap<string, string>,
): { alias: string; scalar: string } | null {
  if (!ts.isIdentifier(node.name) && !ts.isStringLiteral(node.name)) {
    return null;
  }
  const alias = ts.isIdentifier(node.name) ? node.name.text : node.name.text;
  if (!IDENTITY_ALIAS_KEYS.has(alias)) {
    return null;
  }
  const scalar = aliases.get(alias);
  if (!scalar || !isScalarIdInitializer(node.initializer)) {
    return null;
  }
  return { alias, scalar };
}

/**
 * `{ _id: post.credential, organization: post.organization }` — an id-shaped
 * key fed from a relation alias. `normalizeWhere` drops `undefined` values, so
 * the tenant filter silently disappears instead of failing.
 */
function isIdShapedFilterValue(access: ts.Expression, alias: string): boolean {
  const value = unwrapValueExpression(access);
  const parent = value.parent;
  if (!parent) {
    return false;
  }

  let key: string | null = null;
  if (ts.isPropertyAssignment(parent) && parent.initializer === value) {
    key = ts.isIdentifier(parent.name)
      ? parent.name.text
      : ts.isStringLiteral(parent.name)
        ? parent.name.text
        : null;
  } else if (
    ts.isShorthandPropertyAssignment(parent) &&
    parent.name === value
  ) {
    key = parent.name.text;
  }

  const isIdShaped =
    key === '_id' || key === 'id' || key === alias || key === `${alias}Id`;
  return isIdShaped && isFilterArgumentUsage(value);
}

function isFilterArgumentUsage(expression: ts.Expression): boolean {
  let current: ts.Node = expression;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent)) {
      if (
        ts.isPropertyAccessExpression(parent.expression) &&
        FILTER_METHODS.has(parent.expression.name.text) &&
        parent.arguments[0] &&
        expression.getStart() >= parent.arguments[0].getStart() &&
        expression.getEnd() <= parent.arguments[0].getEnd()
      ) {
        return true;
      }
      return (
        ts.isIdentifier(parent.expression) &&
        parent.expression.text === 'scopedWhere' &&
        parent.arguments[1] !== undefined &&
        expression.getStart() >= parent.arguments[1].getStart() &&
        expression.getEnd() <= parent.arguments[1].getEnd()
      );
    }

    if (
      ts.isFunctionLike(parent) ||
      ts.isSourceFile(parent) ||
      ts.isReturnStatement(parent)
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

type AliasValueBinding = {
  alias: string;
  receiver: string;
  scalar: string;
};

function unwrapInputExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Track one-hop locals such as `const organizationId = post.organization`. */
function collectAliasValueBindings(
  sourceFile: ts.SourceFile,
  rowBindings: ReadonlySet<string>,
  aliases: ReadonlyMap<string, string>,
): Map<string, AliasValueBinding> {
  const bindings = new Map<string, AliasValueBinding | null>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const value = unwrapInputExpression(node.initializer);
      if (
        ts.isPropertyAccessExpression(value) &&
        ts.isIdentifier(value.expression) &&
        rowBindings.has(value.expression.text)
      ) {
        const scalar = aliases.get(value.name.text);
        if (scalar) {
          const name = node.name.text;
          bindings.set(
            name,
            bindings.has(name)
              ? null
              : {
                  alias: value.name.text,
                  receiver: value.expression.text,
                  scalar,
                },
          );
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      bindings.set(node.left.text, null);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return new Map(
    [...bindings].filter(
      (entry): entry is [string, AliasValueBinding] => entry[1] !== null,
    ),
  );
}

type HelperKeyArrayRead = {
  alias: string;
  position: number;
  receiver: string;
  scalar: string;
};

/**
 * `readPostString(post, ['organizationId', 'organization'])` hides the alias
 * behind a string lookup, so there is no `post.organization` property access
 * for the existing rules to inspect. A helper call is identity-shaped when a
 * syntactically proven row argument is followed by an array containing a
 * schema-derived relation alias. Array order is deliberately irrelevant.
 */
function collectHelperKeyArrayReads(
  node: ts.CallExpression,
  rowBindings: ReadonlySet<string>,
  aliases: ReadonlyMap<string, string>,
): HelperKeyArrayRead[] {
  const rowArgumentIndex = node.arguments.findIndex((argument) => {
    const value = unwrapInputExpression(argument);
    return ts.isIdentifier(value) && rowBindings.has(value.text);
  });
  if (rowArgumentIndex === -1) {
    return [];
  }

  const rowArgument = unwrapInputExpression(node.arguments[rowArgumentIndex]);
  if (!ts.isIdentifier(rowArgument)) {
    return [];
  }

  const reads: HelperKeyArrayRead[] = [];
  for (const argument of node.arguments.slice(rowArgumentIndex + 1)) {
    const value = unwrapInputExpression(argument);
    if (!ts.isArrayLiteralExpression(value)) {
      continue;
    }

    for (const element of value.elements) {
      if (
        !ts.isStringLiteral(element) &&
        !ts.isNoSubstitutionTemplateLiteral(element)
      ) {
        continue;
      }
      const scalar = aliases.get(element.text);
      if (scalar) {
        reads.push({
          alias: element.text,
          position: element.getStart(),
          receiver: rowArgument.text,
          scalar,
        });
      }
    }
  }

  return reads;
}

function isSuppressed(sourceFile: ts.SourceFile, position: number): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  const lines = sourceFile.getFullText().split('\n');
  const current = lines[line] ?? '';
  const previous = line > 0 ? (lines[line - 1] ?? '') : '';
  return (
    current.includes(SUPPRESSION_COMMENT) ||
    previous.includes(SUPPRESSION_COMMENT)
  );
}

function checkFile(
  file: string,
  aliases: Map<string, string>,
): RelationAliasViolation[] {
  const content = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const rowBindings = collectRowBindings(sourceFile);
  const violations: RelationAliasViolation[] = [];
  const aliasValueBindings =
    rowBindings.size === 0
      ? new Map<string, AliasValueBinding>()
      : collectAliasValueBindings(sourceFile, rowBindings, aliases);

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && file.startsWith('packages/')) {
      const identityKey = identityKeyFromAssignment(node, aliases);
      if (identityKey && !isSuppressed(sourceFile, node.getStart())) {
        violations.push({
          alias: identityKey.alias,
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          receiver: 'record',
          rule: 'identity-key',
          scalar: identityKey.scalar,
        });
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      rowBindings.has(node.expression.text)
    ) {
      const alias = node.name.text;
      const scalar = aliases.get(alias);
      const rule: RelationAliasRule | null = !scalar
        ? null
        : isIdCoercion(node)
          ? 'id-coercion'
          : isIdShapedFilterValue(node, alias)
            ? 'filter-value'
            : isIdentityComparison(node)
              ? 'identity-comparison'
              : null;

      if (scalar && rule && !isSuppressed(sourceFile, node.getStart())) {
        violations.push({
          alias,
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          receiver: node.expression.text,
          rule,
          scalar,
        });
      }
    }

    if (ts.isCallExpression(node)) {
      const callSuppressed = isSuppressed(sourceFile, node.getStart());
      for (const read of collectHelperKeyArrayReads(
        node,
        rowBindings,
        aliases,
      )) {
        if (callSuppressed || isSuppressed(sourceFile, read.position)) {
          continue;
        }
        violations.push({
          alias: read.alias,
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(read.position).line + 1,
          receiver: read.receiver,
          rule: 'helper-key-array',
          scalar: read.scalar,
        });
      }
    }

    if (ts.isIdentifier(node)) {
      const binding = aliasValueBindings.get(node.text);
      if (
        binding &&
        isIdShapedFilterValue(node, binding.alias) &&
        !isSuppressed(sourceFile, node.getStart())
      ) {
        violations.push({
          alias: binding.alias,
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          receiver: binding.receiver,
          rule: 'filter-value',
          scalar: binding.scalar,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function runCheckRelationAliasReads(
  options: RelationAliasCheckOptions = {},
): RelationAliasCheckResult {
  const aliases = collectRelationAliases(
    readFileSync(options.schemaPath ?? SCHEMA_PATH, 'utf8'),
  );

  const files = globSync(options.includeGlobs ?? INCLUDE_GLOBS, {
    ignore: options.ignoreGlobs ?? IGNORE_GLOBS,
    nodir: true,
  });

  return {
    aliasCount: aliases.size,
    filesScanned: files.length,
    violations: files.flatMap((file) => checkFile(file, aliases)),
  };
}

export function countByFile(
  violations: readonly RelationAliasViolation[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const violation of violations) {
    counts[violation.file] = (counts[violation.file] ?? 0) + 1;
  }
  return counts;
}

export type RatchetDrift = {
  actual: number;
  baseline: number;
  file: string;
};

/**
 * Exact-match ratchet: a
 * file over its baseline is a regression, and a file under it is a stale entry
 * that must be pruned in the PR that fixed it. Anything else lets the baseline
 * rot into a number nobody trusts.
 */
export function diffAgainstBaseline(
  counts: Record<string, number>,
  baseline: Readonly<Record<string, number>>,
): { regressions: RatchetDrift[]; stale: RatchetDrift[] } {
  const regressions: RatchetDrift[] = [];
  const stale: RatchetDrift[] = [];

  for (const file of new Set([
    ...Object.keys(counts),
    ...Object.keys(baseline),
  ])) {
    const actual = counts[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (actual > allowed) {
      regressions.push({ actual, baseline: allowed, file });
    } else if (actual < allowed) {
      stale.push({ actual, baseline: allowed, file });
    }
  }

  return {
    regressions: regressions.sort((a, b) => a.file.localeCompare(b.file)),
    stale: stale.sort((a, b) => a.file.localeCompare(b.file)),
  };
}

function describe(violation: RelationAliasViolation): string {
  const consequence =
    violation.rule === 'id-coercion'
      ? 'coerces a relation alias to a string id — that is "[object Object]" when populated and "undefined" when not'
      : violation.rule === 'helper-key-array'
        ? 'passes a relation alias through a helper key array — the helper can read a populated relation object or undefined instead of the scalar foreign key'
        : violation.rule === 'identity-comparison'
          ? 'compares a relation alias to an id — undefined === undefined passes, so the tenant gate never runs'
          : violation.rule === 'identity-key'
            ? 'uses a Document identity alias as an object key for a scalar id — the server reads the scalar FK, so this key is dropped or never matches'
            : 'feeds a relation alias into an id-shaped filter key — an undefined value is dropped by normalizeWhere, silently unscoping the query';
  return (
    `  ${violation.file}:${violation.line} — '${violation.receiver}.${violation.alias}' ${consequence}. ` +
    `Read '${violation.receiver}.${violation.scalar}' instead, or route it through ` +
    'resolveRelationId()/requireRelationId(). If the alias really is populated here, annotate the ' +
    `line with '// ${SUPPRESSION_COMMENT}: <reason>'.`
  );
}

function writeBaseline(counts: Record<string, number>): void {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const body = entries
    .map(([file, count]) => `  '${file}': ${count},`)
    .join('\n');

  writeFileSync(
    BASELINE_PATH,
    `${BASELINE_HEADER}\nexport const RELATION_ALIAS_READ_BASELINE: Readonly<Record<string, number>> = {\n${body}\n};\n`,
  );
  console.log(
    `check:relation-alias-reads — baseline rewritten: ${entries.length} file(s), ${total} violation(s).`,
  );
}

function main(): void {
  const { aliasCount, filesScanned, violations } = runCheckRelationAliasReads();
  const counts = countByFile(violations);

  if (process.argv.includes('--update-baseline')) {
    writeBaseline(counts);
    return;
  }

  const { regressions, stale } = diffAgainstBaseline(
    counts,
    RELATION_ALIAS_READ_BASELINE,
  );

  if (regressions.length === 0 && stale.length === 0) {
    console.log(
      `check:relation-alias-reads — ${filesScanned} files scanned against ` +
        `${aliasCount} schema relation aliases; ${violations.length} violation(s). ` +
        'Relation-alias reads are banned.',
    );
    return;
  }

  if (regressions.length > 0) {
    console.error(
      'check:relation-alias-reads — new relation-alias read(s). Prisma relation fields are only ' +
        'present when a query explicitly includes them, so reading one yields a populated object, a ' +
        'back-filled id, or undefined depending on the call path — silently corrupting foreign keys ' +
        'and dropping tenant filters while type-check passes.',
    );
    const regressed = new Set(regressions.map((entry) => entry.file));
    for (const violation of violations.filter((entry) =>
      regressed.has(entry.file),
    )) {
      console.error(describe(violation));
    }
  }

  if (stale.length > 0) {
    console.error(
      '\ncheck:relation-alias-reads — the baseline is stale. These files improved; lower them in ' +
        'scripts/architecture/relation-alias-reads.baseline.ts (or run with --update-baseline) so the ' +
        'ratchet cannot slip back:',
    );
    for (const entry of stale) {
      console.error(
        `  ${entry.file} — baseline ${entry.baseline}, actual ${entry.actual}`,
      );
    }
  }

  process.exit(1);
}

if (import.meta.main) {
  main();
}
