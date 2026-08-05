import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'glob';
import ts from 'typescript';

const INCLUDE_GLOBS = ['apps/server/**/*.ts'];
const IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
];
const SCHEMA_PATH = 'packages/prisma/prisma/schema.prisma';
const WRITE_METHOD_DATA_ARGUMENT = new Map([
  ['create', 0],
  ['patch', 1],
  ['patchAll', 1],
  ['update', 1],
]);
const SERVICE_FILTER_ARGUMENT = new Map([
  ['count', 0],
  ['find', 0],
  ['findAll', 0],
  ['findFirst', 0],
  ['findMany', 0],
  ['findOne', 0],
  ['patchAll', 0],
  ['removeAll', 0],
]);
const SERVICE_POPULATE_ARGUMENT = new Map([
  ['create', 1],
  ['find', 1],
  ['findAllByOrganization', 3],
  ['findOne', 1],
  ['findOneWithOrganization', 2],
  ['patch', 2],
]);
const PRISMA_WRITE_METHODS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);
const PRISMA_FILTER_METHODS = new Set([
  'count',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'upsert',
]);
const NESTED_RELATION_OPERATIONS = new Set([
  'connect',
  'connectOrCreate',
  'create',
  'createMany',
  'delete',
  'disconnect',
  'set',
  'update',
  'upsert',
]);
const GENERIC_RELATION_ID_FIELDS = new Map([
  ['botConfig', 'botConfigId'],
  ['brand', 'brandId'],
  ['credential', 'credentialId'],
  ['organization', 'organizationId'],
  ['parent', 'parentId'],
  ['strategy', 'strategyId'],
  ['thread', 'threadId'],
  ['user', 'userId'],
]);
const FILTER_VARIABLE_NAMES = new Set([
  'filter',
  'match',
  'matchFilter',
  'matchQuery',
  'where',
]);

type ModelMetadata = {
  fields: ReadonlySet<string>;
  relationFields: ReadonlySet<string>;
  relations: ReadonlyMap<string, string>;
};

export type RelationAliasWriteViolation = {
  alias: string;
  end: number;
  file: string;
  line: number;
  model: string;
  replacement?: string;
  scalar?: string;
  start: number;
  type: 'relation-alias' | 'unknown-field' | 'unknown-projection';
};

export type RelationAliasWriteCheckOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  schemaPath?: string;
};

export type RelationAliasWriteCheckResult = {
  filesScanned: number;
  serviceCount: number;
  violations: RelationAliasWriteViolation[];
};

type Violation = RelationAliasWriteViolation;

function toPascalCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function collectModelMetadata(schema: string): Map<string, ModelMetadata> {
  const models = new Map<string, ModelMetadata>();
  const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const modelBlocks = [...schema.matchAll(modelPattern)];
  const modelNames = new Set(modelBlocks.map((match) => match[1]));

  for (const match of modelBlocks) {
    const [, model, body] = match;
    const fields = new Set<string>();
    const relationFields = new Set<string>();
    const relations = new Map<string, string>();

    for (const line of body.split('\n')) {
      const compoundFields = /@@(?:id|unique)\(\[([^\]]+)\]/.exec(line)?.[1];
      if (compoundFields) {
        fields.add(
          compoundFields
            .split(',')
            .map((entry) => entry.trim())
            .join('_'),
        );
      }

      const fieldDefinition =
        /^\s*(\w+)\s+([A-Za-z]\w*)(?:\[\])?\??(?:\s|$)/.exec(line);
      const field = fieldDefinition?.[1];
      const fieldType = fieldDefinition?.[2];
      const relationScalarFields =
        /@relation\([^)]*fields:\s*\[([^\]]+)\]/.exec(line)?.[1];
      if (field && fieldType && modelNames.has(fieldType)) {
        relationFields.add(field);
      }
      if (!field || !relationScalarFields) {
        if (field) {
          fields.add(field);
        }
        continue;
      }
      fields.add(field);

      const scalar = relationScalarFields
        .split(',')
        .map((entry) => entry.trim())
        .find((entry) => entry === `${field}Id`);
      if (scalar) {
        relations.set(field, scalar);
      }
    }

    for (const field of fields) {
      const scalarAlias = /^(.+)Id$/.exec(field)?.[1];
      if (scalarAlias && !fields.has(scalarAlias)) {
        relations.set(scalarAlias, field);
      }
    }

    models.set(model, { fields, relationFields, relations });
  }

  return models;
}

function inspectProjectionExpression(
  expression: ts.Expression,
  kind: 'include' | 'select',
  file: string,
  model: string,
  metadata: ModelMetadata,
  sourceFile: ts.SourceFile,
  violations: Violation[],
): void {
  const projection = resolveExpression(expression, sourceFile);
  if (!ts.isObjectLiteralExpression(projection)) {
    return;
  }

  for (const property of projection.properties) {
    if (ts.isSpreadAssignment(property)) {
      inspectProjectionExpression(
        property.expression,
        kind,
        file,
        model,
        metadata,
        sourceFile,
        violations,
      );
      continue;
    }
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const field = propertyName(property.name);
    if (!field || field === '_count') {
      continue;
    }
    const isValid =
      kind === 'include'
        ? metadata.relationFields.has(field)
        : metadata.fields.has(field);
    if (!isValid) {
      violations.push({
        alias: field,
        end: property.name.getEnd(),
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
          1,
        model,
        start: property.name.getStart(sourceFile),
        type: 'unknown-projection',
      });
    }
  }
}

function inspectPopulateExpression(
  expression: ts.Expression,
  file: string,
  model: string,
  metadata: ModelMetadata,
  sourceFile: ts.SourceFile,
  violations: Violation[],
): void {
  const populate = resolveExpression(expression, sourceFile);
  if (!ts.isArrayLiteralExpression(populate)) {
    return;
  }

  for (const element of populate.elements) {
    if (!ts.isExpression(element)) {
      continue;
    }
    const value = unwrapExpression(element);
    let pathNode: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | null =
      ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
        ? value
        : null;
    if (ts.isObjectLiteralExpression(value)) {
      const path = objectProperty(value, 'path', sourceFile);
      const unwrappedPath = path ? resolveExpression(path, sourceFile) : null;
      pathNode =
        unwrappedPath &&
        (ts.isStringLiteral(unwrappedPath) ||
          ts.isNoSubstitutionTemplateLiteral(unwrappedPath))
          ? unwrappedPath
          : null;
    }
    if (!pathNode) {
      continue;
    }
    const field = pathNode.text.split('.')[0];
    if (!metadata.relationFields.has(field)) {
      violations.push({
        alias: field,
        end: pathNode.getEnd(),
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(pathNode.getStart()).line +
          1,
        model,
        start: pathNode.getStart(sourceFile),
        type: 'unknown-projection',
      });
    }
  }
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

type ExpressionBindings = ReadonlyMap<string, ts.Expression | null>;

const expressionBindingsByFile = new WeakMap<
  ts.SourceFile,
  ExpressionBindings
>();

/**
 * Resolve only identifiers with one initialized declaration and no direct
 * reassignment. Duplicate/shadowed names are deliberately left unresolved so
 * the guard stays conservative without a TypeScript type checker.
 */
function collectExpressionBindings(
  sourceFile: ts.SourceFile,
): ExpressionBindings {
  const bindings = new Map<string, ts.Expression | null>();

  const invalidate = (name: string): void => {
    bindings.set(name, null);
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const name = node.name.text;
      if (bindings.has(name)) {
        invalidate(name);
      } else {
        bindings.set(name, node.initializer);
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      invalidate(node.left.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function resolveExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  seen: ReadonlySet<string> = new Set(),
): ts.Expression {
  const value = unwrapExpression(expression);
  if (!ts.isIdentifier(value) || seen.has(value.text)) {
    return value;
  }

  let bindings = expressionBindingsByFile.get(sourceFile);
  if (!bindings) {
    bindings = collectExpressionBindings(sourceFile);
    expressionBindingsByFile.set(sourceFile, bindings);
  }
  const initializer = bindings.get(value.text);
  if (!initializer) {
    return value;
  }

  return resolveExpression(
    initializer,
    sourceFile,
    new Set([...seen, value.text]),
  );
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
    return node.text;
  }
  return null;
}

function isNestedRelationOperation(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): boolean {
  const value = resolveExpression(expression, sourceFile);
  if (!ts.isObjectLiteralExpression(value)) {
    return false;
  }

  return value.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false;
    }
    const name = propertyName(property.name);
    return name !== null && NESTED_RELATION_OPERATIONS.has(name);
  });
}

function inspectDataExpression(
  expression: ts.Expression,
  file: string,
  model: string,
  metadata: ModelMetadata,
  sourceFile: ts.SourceFile,
  violations: Violation[],
  checkUnknownFields: boolean,
): void {
  const data = resolveExpression(expression, sourceFile);
  if (ts.isConditionalExpression(data)) {
    inspectDataExpression(
      data.whenTrue,
      file,
      model,
      metadata,
      sourceFile,
      violations,
      checkUnknownFields,
    );
    inspectDataExpression(
      data.whenFalse,
      file,
      model,
      metadata,
      sourceFile,
      violations,
      checkUnknownFields,
    );
    return;
  }
  if (ts.isArrayLiteralExpression(data)) {
    for (const element of data.elements) {
      if (ts.isExpression(element)) {
        inspectDataExpression(
          element,
          file,
          model,
          metadata,
          sourceFile,
          violations,
          checkUnknownFields,
        );
      }
    }
    return;
  }
  if (!ts.isObjectLiteralExpression(data)) {
    return;
  }

  for (const property of data.properties) {
    if (ts.isSpreadAssignment(property)) {
      inspectDataExpression(
        property.expression,
        file,
        model,
        metadata,
        sourceFile,
        violations,
        checkUnknownFields,
      );
      continue;
    }

    let alias: string | null = null;
    let value: ts.Expression | null = null;
    if (ts.isPropertyAssignment(property)) {
      alias = propertyName(property.name);
      value = property.initializer;
    } else if (ts.isShorthandPropertyAssignment(property)) {
      alias = property.name.text;
      value = property.name;
    }
    if (!alias || !value) {
      continue;
    }

    if (
      (checkUnknownFields || alias === '_id') &&
      !metadata.fields.has(alias)
    ) {
      violations.push({
        alias,
        end: property.name.getEnd(),
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
          1,
        model,
        replacement:
          alias === value.getText(sourceFile)
            ? `${alias}: ${alias}`
            : undefined,
        start: property.name.getStart(sourceFile),
        type: 'unknown-field',
      });
      continue;
    }

    const scalar = metadata.relations.get(alias);
    if (!scalar || isNestedRelationOperation(value, sourceFile)) {
      continue;
    }

    violations.push({
      alias,
      end: property.name.getEnd(),
      file,
      line:
        sourceFile.getLineAndCharacterOfPosition(property.getStart()).line + 1,
      model,
      replacement: ts.isShorthandPropertyAssignment(property)
        ? `${scalar}: ${alias}`
        : scalar,
      scalar,
      start: property.name.getStart(sourceFile),
      type: 'relation-alias',
    });
  }
}

const LOGICAL_FILTER_FIELDS = new Set(['AND', 'NOT', 'OR']);
const PRISMA_ARGUMENT_FIELDS = new Set([
  'cursor',
  'distinct',
  'include',
  'orderBy',
  'select',
  'skip',
  'take',
]);
const SCALAR_FILTER_FIELDS = new Set(['equals', 'in', 'not', 'notIn']);
const RELATION_FILTER_FIELDS = new Set([
  'every',
  'is',
  'isNot',
  'none',
  'some',
]);

function isRelationFilter(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): boolean {
  const value = resolveExpression(expression, sourceFile);
  return (
    ts.isObjectLiteralExpression(value) &&
    value.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        RELATION_FILTER_FIELDS.has(propertyName(property.name) ?? ''),
    )
  );
}

function relationFilterReplacement(
  property: ts.ObjectLiteralElementLike,
  alias: string,
  scalar: string,
  value: ts.Expression,
  sourceFile: ts.SourceFile,
): { end: number; replacement?: string; start: number } {
  if (ts.isShorthandPropertyAssignment(property)) {
    return {
      end: property.getEnd(),
      replacement: `${scalar}: ${alias}`,
      start: property.getStart(sourceFile),
    };
  }

  const unwrapped = resolveExpression(value, sourceFile);
  if (!ts.isObjectLiteralExpression(unwrapped)) {
    return {
      end: property.name.getEnd(),
      replacement: scalar,
      start: property.name.getStart(sourceFile),
    };
  }

  if (unwrapped.properties.length === 1) {
    const nested = unwrapped.properties[0];
    if (ts.isPropertyAssignment(nested)) {
      const nestedName = propertyName(nested.name);
      if (nestedName === 'id' || nestedName === '_id') {
        return {
          end: property.getEnd(),
          replacement: `${scalar}: ${nested.initializer.getText(sourceFile)}`,
          start: property.getStart(sourceFile),
        };
      }
    }
  }

  const isScalarFilter = unwrapped.properties.every((nested) => {
    if (!ts.isPropertyAssignment(nested)) {
      return false;
    }
    const nestedName = propertyName(nested.name);
    return nestedName !== null && SCALAR_FILTER_FIELDS.has(nestedName);
  });

  return {
    end: property.name.getEnd(),
    replacement: isScalarFilter ? scalar : undefined,
    start: property.name.getStart(sourceFile),
  };
}

function inspectFilterExpression(
  expression: ts.Expression,
  file: string,
  model: string,
  metadata: ModelMetadata,
  sourceFile: ts.SourceFile,
  violations: Violation[],
): void {
  const filter = resolveExpression(expression, sourceFile);
  if (ts.isConditionalExpression(filter)) {
    inspectFilterExpression(
      filter.whenTrue,
      file,
      model,
      metadata,
      sourceFile,
      violations,
    );
    inspectFilterExpression(
      filter.whenFalse,
      file,
      model,
      metadata,
      sourceFile,
      violations,
    );
    return;
  }
  if (ts.isArrayLiteralExpression(filter)) {
    for (const element of filter.elements) {
      if (ts.isExpression(element)) {
        inspectFilterExpression(
          element,
          file,
          model,
          metadata,
          sourceFile,
          violations,
        );
      }
    }
    return;
  }
  if (!ts.isObjectLiteralExpression(filter)) {
    return;
  }

  for (const property of filter.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = resolveExpression(property.expression, sourceFile);
      if (ts.isConditionalExpression(spread)) {
        inspectFilterExpression(
          spread.whenTrue,
          file,
          model,
          metadata,
          sourceFile,
          violations,
        );
        inspectFilterExpression(
          spread.whenFalse,
          file,
          model,
          metadata,
          sourceFile,
          violations,
        );
      } else {
        inspectFilterExpression(
          spread,
          file,
          model,
          metadata,
          sourceFile,
          violations,
        );
      }
      continue;
    }

    let alias: string | null = null;
    let value: ts.Expression | null = null;
    if (ts.isPropertyAssignment(property)) {
      alias = propertyName(property.name);
      value = property.initializer;
    } else if (ts.isShorthandPropertyAssignment(property)) {
      alias = property.name.text;
      value = property.name;
    }
    if (!alias || !value) {
      continue;
    }

    if (LOGICAL_FILTER_FIELDS.has(alias)) {
      inspectFilterExpression(
        value,
        file,
        model,
        metadata,
        sourceFile,
        violations,
      );
      continue;
    }

    if (alias === 'where') {
      inspectFilterExpression(
        value,
        file,
        model,
        metadata,
        sourceFile,
        violations,
      );
      continue;
    }

    if (PRISMA_ARGUMENT_FIELDS.has(alias)) {
      continue;
    }

    const scalar = metadata.relations.get(alias);
    if (!metadata.fields.has(alias) && !scalar) {
      let end = property.name.getEnd();
      let replacement = alias === '_id' ? 'id' : undefined;
      if (alias === 'isDeleted' && value.kind === ts.SyntaxKind.FalseKeyword) {
        end = property.getEnd();
        const source = sourceFile.getFullText();
        while (/\s/.test(source[end] ?? '')) {
          end += 1;
        }
        if (source[end] === ',') {
          end += 1;
        }
        replacement = '';
      }
      violations.push({
        alias,
        end,
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
          1,
        model,
        replacement,
        start: property.name.getStart(sourceFile),
        type: 'unknown-field',
      });
      continue;
    }

    if (!scalar || isRelationFilter(value, sourceFile)) {
      continue;
    }

    const fix = relationFilterReplacement(
      property,
      alias,
      scalar,
      value,
      sourceFile,
    );
    violations.push({
      alias,
      end: fix.end,
      file,
      line:
        sourceFile.getLineAndCharacterOfPosition(property.getStart()).line + 1,
      model,
      replacement: fix.replacement,
      scalar,
      start: fix.start,
      type: 'relation-alias',
    });
  }
}

function inspectGenericFilterExpression(
  expression: ts.Expression,
  file: string,
  sourceFile: ts.SourceFile,
  violations: Violation[],
): void {
  const filter = resolveExpression(expression, sourceFile);
  if (ts.isConditionalExpression(filter)) {
    inspectGenericFilterExpression(
      filter.whenTrue,
      file,
      sourceFile,
      violations,
    );
    inspectGenericFilterExpression(
      filter.whenFalse,
      file,
      sourceFile,
      violations,
    );
    return;
  }
  if (ts.isArrayLiteralExpression(filter)) {
    for (const element of filter.elements) {
      if (ts.isExpression(element)) {
        inspectGenericFilterExpression(element, file, sourceFile, violations);
      }
    }
    return;
  }
  if (!ts.isObjectLiteralExpression(filter)) {
    return;
  }

  for (const property of filter.properties) {
    if (ts.isSpreadAssignment(property)) {
      inspectGenericFilterExpression(
        property.expression,
        file,
        sourceFile,
        violations,
      );
      continue;
    }
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const name = propertyName(property.name);
    const value = ts.isPropertyAssignment(property)
      ? property.initializer
      : property.name;
    if (name === '_id') {
      violations.push({
        alias: name,
        end: property.name.getEnd(),
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
          1,
        model: 'PrismaFilter',
        replacement: 'id',
        start: property.name.getStart(sourceFile),
        type: 'unknown-field',
      });
      continue;
    }
    const scalar = name ? GENERIC_RELATION_ID_FIELDS.get(name) : undefined;
    if (name && scalar) {
      const fix = relationFilterReplacement(
        property,
        name,
        scalar,
        value,
        sourceFile,
      );
      if (fix.replacement !== undefined) {
        violations.push({
          alias: name,
          end: fix.end,
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
            1,
          model: 'PrismaFilter',
          replacement: fix.replacement,
          scalar,
          start: fix.start,
          type: 'relation-alias',
        });
      }
      continue;
    }
    if (name === 'where' || LOGICAL_FILTER_FIELDS.has(name ?? '')) {
      inspectGenericFilterExpression(value, file, sourceFile, violations);
    }
  }
}

function typeName(node: ts.TypeNode | undefined): string | null {
  if (!node || !ts.isTypeReferenceNode(node)) {
    return null;
  }
  let name: ts.EntityName = node.typeName;
  while (ts.isQualifiedName(name)) {
    name = name.right;
  }
  return name.text;
}

function collectReceiverTypes(sourceFile: ts.SourceFile): Map<string, string> {
  const receivers = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isParameter(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isVariableDeclaration(node)) &&
      ts.isIdentifier(node.name)
    ) {
      const name = typeName(node.type);
      if (name) {
        receivers.set(node.name.text, name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return receivers;
}

function collectServiceModels(
  sourceFiles: readonly ts.SourceFile[],
): Map<string, string> {
  const services = new Map<string, string>();

  for (const sourceFile of sourceFiles) {
    let currentClass: string | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const previousClass = currentClass;
        currentClass = node.name?.text ?? null;
        ts.forEachChild(node, visit);
        currentClass = previousClass;
        return;
      }

      if (
        currentClass &&
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.SuperKeyword &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[1])
      ) {
        services.set(currentClass, toPascalCase(node.arguments[1].text));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return services;
}

function resolveServiceModel(
  receiver: ts.Expression,
  currentClass: string | null,
  receiverTypes: ReadonlyMap<string, string>,
  serviceModels: ReadonlyMap<string, string>,
): string | null {
  if (receiver.kind === ts.SyntaxKind.SuperKeyword) {
    return currentClass ? (serviceModels.get(currentClass) ?? null) : null;
  }
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    return currentClass ? (serviceModels.get(currentClass) ?? null) : null;
  }
  if (ts.isIdentifier(receiver)) {
    const receiverType = receiverTypes.get(receiver.text);
    return receiverType ? (serviceModels.get(receiverType) ?? null) : null;
  }
  if (
    ts.isPropertyAccessExpression(receiver) &&
    receiver.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    const receiverType = receiverTypes.get(receiver.name.text);
    return receiverType ? (serviceModels.get(receiverType) ?? null) : null;
  }
  return null;
}

function directPrismaTarget(
  callee: ts.PropertyAccessExpression,
): { model: string; method: string } | null {
  const modelAccess = callee.expression;
  if (!ts.isPropertyAccessExpression(modelAccess)) {
    return null;
  }
  const prismaAccess = modelAccess.expression;
  if (
    !ts.isPropertyAccessExpression(prismaAccess) ||
    prismaAccess.name.text !== 'prisma'
  ) {
    return null;
  }
  return {
    method: callee.name.text,
    model: toPascalCase(modelAccess.name.text),
  };
}

function objectProperty(
  expression: ts.Expression,
  name: string,
  sourceFile: ts.SourceFile,
): ts.Expression | null {
  const object = resolveExpression(expression, sourceFile);
  if (!ts.isObjectLiteralExpression(object)) {
    return null;
  }
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      propertyName(property.name) === name
    ) {
      return property.initializer;
    }
  }
  return null;
}

function collectFilterBindingNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set(FILTER_VARIABLE_NAMES);
  const addIdentifier = (expression: ts.Expression | undefined): void => {
    if (!expression) {
      return;
    }
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value)) {
      names.add(value.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const direct = directPrismaTarget(node.expression);
      if (direct && PRISMA_FILTER_METHODS.has(direct.method)) {
        const args = node.arguments[0];
        if (args) {
          addIdentifier(objectProperty(args, 'where', sourceFile) ?? undefined);
        }
      } else {
        const filterIndex = SERVICE_FILTER_ARGUMENT.get(
          node.expression.name.text,
        );
        if (filterIndex !== undefined) {
          addIdentifier(node.arguments[filterIndex]);
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'scopedWhere'
    ) {
      addIdentifier(node.arguments[1]);
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function assignedMember(
  expression: ts.Expression,
): { name: string; nameNode: ts.Node; objectName: string } | null {
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return {
      name: expression.name.text,
      nameNode: expression.name,
      objectName: expression.expression.text,
    };
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.argumentExpression &&
    ts.isStringLiteral(expression.argumentExpression)
  ) {
    return {
      name: expression.argumentExpression.text,
      nameNode: expression.argumentExpression,
      objectName: expression.expression.text,
    };
  }
  return null;
}

export function runCheckRelationAliasWrites(
  options: RelationAliasWriteCheckOptions = {},
): RelationAliasWriteCheckResult {
  const files = globSync(options.includeGlobs ?? INCLUDE_GLOBS, {
    ignore: options.ignoreGlobs ?? IGNORE_GLOBS,
    nodir: true,
  }).sort();
  const sourceFiles = files.map((file) =>
    ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  );
  const models = collectModelMetadata(
    readFileSync(options.schemaPath ?? SCHEMA_PATH, 'utf8'),
  );
  const serviceModels = collectServiceModels(sourceFiles);
  const violations: Violation[] = [];

  for (const sourceFile of sourceFiles) {
    const receiverTypes = collectReceiverTypes(sourceFile);
    const filterBindingNames = collectFilterBindingNames(sourceFile);
    let currentClass: string | null = null;

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node)) {
        const previousClass = currentClass;
        currentClass = node.name?.text ?? null;
        ts.forEachChild(node, visit);
        currentClass = previousClass;
        return;
      }

      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        FILTER_VARIABLE_NAMES.has(node.name.text) &&
        node.initializer
      ) {
        inspectGenericFilterExpression(
          node.initializer,
          sourceFile.fileName,
          sourceFile,
          violations,
        );
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        assignedMember(node.left) !== null
      ) {
        const target = assignedMember(node.left);
        if (!target || !filterBindingNames.has(target.objectName)) {
          ts.forEachChild(node, visit);
          return;
        }
        const alias = target.name;
        const scalar =
          alias === '_id' ? 'id' : GENERIC_RELATION_ID_FIELDS.get(alias);
        if (scalar) {
          violations.push({
            alias,
            end: target.nameNode.getEnd(),
            file: sourceFile.fileName,
            line:
              sourceFile.getLineAndCharacterOfPosition(node.left.getStart())
                .line + 1,
            model: 'PrismaFilter',
            replacement: scalar,
            scalar: alias === '_id' ? undefined : scalar,
            start: target.nameNode.getStart(sourceFile),
            type: alias === '_id' ? 'unknown-field' : 'relation-alias',
          });
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const callee = node.expression;
        const direct = directPrismaTarget(callee);
        if (direct && node.arguments[0]) {
          const metadata = models.get(direct.model);
          if (metadata) {
            for (const kind of ['include', 'select'] as const) {
              const projection = objectProperty(
                node.arguments[0],
                kind,
                sourceFile,
              );
              if (projection) {
                inspectProjectionExpression(
                  projection,
                  kind,
                  sourceFile.fileName,
                  direct.model,
                  metadata,
                  sourceFile,
                  violations,
                );
              }
            }
          }
        }

        if (direct && PRISMA_WRITE_METHODS.has(direct.method)) {
          const metadata = models.get(direct.model);
          const args = node.arguments[0];
          if (metadata && args) {
            const fields =
              direct.method === 'upsert' ? ['create', 'update'] : ['data'];
            for (const field of fields) {
              const data = objectProperty(args, field, sourceFile);
              if (data) {
                inspectDataExpression(
                  data,
                  sourceFile.fileName,
                  direct.model,
                  metadata,
                  sourceFile,
                  violations,
                  true,
                );
              }
            }
          }
        }

        if (direct && PRISMA_FILTER_METHODS.has(direct.method)) {
          const metadata = models.get(direct.model);
          const args = node.arguments[0];
          const where = args ? objectProperty(args, 'where', sourceFile) : null;
          if (metadata && where) {
            inspectFilterExpression(
              where,
              sourceFile.fileName,
              direct.model,
              metadata,
              sourceFile,
              violations,
            );
          }
        }

        if (!direct) {
          const model = resolveServiceModel(
            callee.expression,
            currentClass,
            receiverTypes,
            serviceModels,
          );
          const metadata = model ? models.get(model) : undefined;
          const dataIndex = WRITE_METHOD_DATA_ARGUMENT.get(callee.name.text);
          if (dataIndex !== undefined && node.arguments[dataIndex]) {
            if (model && metadata) {
              inspectDataExpression(
                node.arguments[dataIndex],
                sourceFile.fileName,
                model,
                metadata,
                sourceFile,
                violations,
                false,
              );
            }
          }

          const filterIndex = SERVICE_FILTER_ARGUMENT.get(callee.name.text);
          if (filterIndex !== undefined && node.arguments[filterIndex]) {
            if (model && metadata) {
              inspectFilterExpression(
                node.arguments[filterIndex],
                sourceFile.fileName,
                model,
                metadata,
                sourceFile,
                violations,
              );
            } else {
              inspectGenericFilterExpression(
                node.arguments[filterIndex],
                sourceFile.fileName,
                sourceFile,
                violations,
              );
            }
          }

          const populateIndex = SERVICE_POPULATE_ARGUMENT.get(callee.name.text);
          if (
            populateIndex !== undefined &&
            node.arguments[populateIndex] &&
            model &&
            metadata
          ) {
            inspectPopulateExpression(
              node.arguments[populateIndex],
              sourceFile.fileName,
              model,
              metadata,
              sourceFile,
              violations,
            );
          }

          if (callee.name.text === 'findAll' && node.arguments[0] && metadata) {
            for (const kind of ['include', 'select'] as const) {
              const projection = objectProperty(
                node.arguments[0],
                kind,
                sourceFile,
              );
              if (projection && model) {
                inspectProjectionExpression(
                  projection,
                  kind,
                  sourceFile.fileName,
                  model,
                  metadata,
                  sourceFile,
                  violations,
                );
              }
            }
          }
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'scopedWhere' &&
        node.arguments[1]
      ) {
        inspectGenericFilterExpression(
          node.arguments[1],
          sourceFile.fileName,
          sourceFile,
          violations,
        );
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return {
    filesScanned: files.length,
    serviceCount: serviceModels.size,
    violations,
  };
}

function main(): void {
  const { filesScanned, serviceCount, violations } =
    runCheckRelationAliasWrites();

  if (process.argv.includes('--fix')) {
    const replacementsByFile = new Map<string, Violation[]>();
    for (const violation of violations) {
      if (violation.replacement === undefined) {
        continue;
      }
      const replacements = replacementsByFile.get(violation.file) ?? [];
      replacements.push(violation);
      replacementsByFile.set(violation.file, replacements);
    }

    for (const [file, replacements] of replacementsByFile) {
      let source = readFileSync(file, 'utf8');
      for (const replacement of replacements.sort(
        (a, b) => b.start - a.start,
      )) {
        source = `${source.slice(0, replacement.start)}${replacement.replacement}${source.slice(replacement.end)}`;
      }
      writeFileSync(file, source);
    }

    const fixedCount = [...replacementsByFile.values()].reduce(
      (total, replacements) => total + replacements.length,
      0,
    );
    console.log(
      `Fixed ${fixedCount} relation alias persistence/filter violations.`,
    );
    process.exit(violations.length === fixedCount ? 0 : 1);
  }

  if (violations.length > 0) {
    console.error(
      `Found ${violations.length} invalid Prisma persistence/filter/projection violation${violations.length === 1 ? '' : 's'}:`,
    );
    for (const violation of violations) {
      const fix =
        violation.type === 'relation-alias'
          ? `use ${violation.scalar}`
          : violation.type === 'unknown-projection'
            ? 'projection relation/field is not present in schema.prisma'
            : 'field is not present in schema.prisma';
      const suffix =
        violation.replacement === undefined ? ' (manual fix required)' : '';
      console.error(
        `${violation.file}:${violation.line} ${violation.model}.${violation.alias} -> ${fix}${suffix}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Prisma persistence/filter/projection guard passed (${filesScanned} files, ${serviceCount} services).`,
  );
}

if (import.meta.main) {
  main();
}
