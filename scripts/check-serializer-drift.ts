/**
 * Serializer Drift Detector
 *
 * Compares top-level Mongoose schema fields against serializer attribute
 * definitions and reports any missing or extra fields.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_ROOT = path.join(ROOT_DIR, 'apps/server/api/src');
const ATTRIBUTE_ROOT = path.join(
  ROOT_DIR,
  'packages/serializers/src/attributes',
);

const IGNORED_FIELDS = new Set([
  '_id',
  'organization',
  'isDeleted',
  'createdAt',
  'updatedAt',
]);

const SCHEMA_TO_ATTRIBUTE_BASENAME_OVERRIDES: Record<string, string> = {
  'ad-insights': 'ad-insight',
  'credit-transactions': 'credit-transaction',
  'organization-setting': 'organization-settings',
};

type SchemaInfo = {
  basename: string;
  className: string;
  fields: Set<string>;
  filePath: string;
};

type ImportBinding = {
  importedName: string;
  source: string;
};

type AttributeExpression =
  | {
      fields: string[];
      kind: 'array';
    }
  | {
      kind: 'alias';
      targetName: string;
    };

type ParsedAttributeFile = {
  exports: Set<string>;
  imports: Map<string, ImportBinding>;
  symbols: Map<string, AttributeExpression>;
};

type AttributeMatch = {
  basename: string;
  exportName: string;
  fields: Set<string>;
  filePath: string;
};

type Drift = {
  attribute: AttributeMatch;
  extraFields: string[];
  missingFields: string[];
  schema: SchemaInfo;
};

type UnmatchedSchema = {
  reason: string;
  schema: SchemaInfo;
};

const parsedAttributeFiles = new Map<string, ParsedAttributeFile>();
const resolvedAttributeExports = new Map<string, string[] | null>();

function findTsFiles(dir: string, base = ''): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(path.join(dir, entry.name), relativePath));
      continue;
    }

    if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(relativePath);
    }
  }

  return results;
}

function extractQuotedStrings(content: string): string[] {
  const matches = content.match(/['"]([^'"]+)['"]/g) ?? [];
  return matches.map((match) => match.slice(1, -1));
}

function extractSpreadTargets(content: string): string[] {
  return [...content.matchAll(/\.\.\.(\w+)/g)].map((match) => `...${match[1]}`);
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}

function singularize(value: string): string {
  if (value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith('s')) {
    return value.slice(0, -1);
  }

  return value;
}

function countCharacters(value: string, target: string): number {
  let count = 0;

  for (const character of value) {
    if (character === target) {
      count += 1;
    }
  }

  return count;
}

function extractBalancedBlock(
  content: string,
  openIndex: number,
): string | null {
  let depth = 0;

  for (let index = openIndex; index < content.length; index += 1) {
    const character = content[index];

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openIndex + 1, index);
      }
    }
  }

  return null;
}

function extractTargetSchemaClass(content: string): string | null {
  const matches = [
    ...content.matchAll(/SchemaFactory\.createForClass\(\s*(\w+)\s*\)/g),
  ];

  return matches.at(-1)?.[1] ?? null;
}

function extractClassBody(content: string, className: string): string | null {
  const classMatch = new RegExp(
    `export\\s+class\\s+${className}\\b[^\\{]*\\{`,
  ).exec(content);

  if (!classMatch) {
    return null;
  }

  const openIndex = content.indexOf('{', classMatch.index);
  if (openIndex === -1) {
    return null;
  }

  return extractBalancedBlock(content, openIndex);
}

function parseSchemaFields(classBody: string): Set<string> {
  const fields = new Set<string>();
  const lines = classBody.split('\n');
  const fieldRegex =
    /^\s*(?:public|private|protected|readonly\s+)*([A-Za-z_]\w*)(?:\?|!)?\s*:/;

  let awaitingField = false;
  let decoratorDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!awaitingField && trimmed.startsWith('@Prop')) {
      awaitingField = true;
      decoratorDepth = countCharacters(line, '(') - countCharacters(line, ')');
      continue;
    }

    if (!awaitingField) {
      continue;
    }

    if (decoratorDepth > 0) {
      decoratorDepth += countCharacters(line, '(') - countCharacters(line, ')');
      continue;
    }

    if (!trimmed) {
      continue;
    }

    const match = fieldRegex.exec(line);
    if (match?.[1]) {
      fields.add(match[1]);
      awaitingField = false;
      continue;
    }

    if (trimmed.startsWith('@')) {
      awaitingField = false;
    }
  }

  return fields;
}

function collectSchemas(): SchemaInfo[] {
  const schemaFiles = findTsFiles(SCHEMA_ROOT).filter((filePath) =>
    filePath.endsWith('.schema.ts'),
  );

  return schemaFiles
    .map((relativePath) => {
      const filePath = path.join(SCHEMA_ROOT, relativePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const className = extractTargetSchemaClass(content);

      if (!className) {
        return null;
      }

      const classBody = extractClassBody(content, className);
      if (!classBody) {
        return null;
      }

      return {
        basename: path.basename(filePath, '.schema.ts'),
        className,
        fields: parseSchemaFields(classBody),
        filePath,
      } satisfies SchemaInfo;
    })
    .filter((schema): schema is SchemaInfo => schema !== null)
    .sort((left, right) => left.basename.localeCompare(right.basename));
}

function parseAttributeFile(filePath: string): ParsedAttributeFile {
  const cached = parsedAttributeFiles.get(filePath);
  if (cached) {
    return cached;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = new Map<string, ImportBinding>();
  const exports = new Set<string>();
  const symbols = new Map<string, AttributeExpression>();

  const importRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(importRegex)) {
    const specifiers = match[1]?.split(',') ?? [];
    const source = match[2];

    for (const specifier of specifiers) {
      const trimmedSpecifier = specifier.trim();
      if (!trimmedSpecifier) {
        continue;
      }

      const aliasMatch = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(trimmedSpecifier);
      if (!aliasMatch?.[1]) {
        continue;
      }

      const importedName = aliasMatch[1];
      const localName = aliasMatch[2] ?? importedName;

      imports.set(localName, {
        importedName,
        source,
      });
    }
  }

  const localArrayRegex =
    /(?:export\s+)?const\s+(\w+)\s*=\s*\[([\s\S]*?)\]\s*;?/g;
  for (const match of content.matchAll(localArrayRegex)) {
    const symbolName = match[1];
    const arrayBody = match[2] ?? '';
    symbols.set(symbolName, {
      fields: [
        ...extractQuotedStrings(arrayBody),
        ...extractSpreadTargets(arrayBody),
      ],
      kind: 'array',
    });
  }

  const createEntityRegex =
    /export\s+const\s+(\w+)\s*=\s*createEntityAttributes\(\s*([\s\S]*?)\s*\)\s*;?/g;
  for (const match of content.matchAll(createEntityRegex)) {
    const exportName = match[1];
    const argument = match[2]?.trim() ?? '';
    exports.add(exportName);

    if (argument.startsWith('[') && argument.endsWith(']')) {
      const arrayBody = argument.slice(1, -1);
      symbols.set(exportName, {
        fields: [
          ...extractQuotedStrings(arrayBody),
          ...extractSpreadTargets(arrayBody),
        ],
        kind: 'array',
      });
      continue;
    }

    if (/^\w+$/.test(argument)) {
      symbols.set(exportName, {
        kind: 'alias',
        targetName: argument,
      });
    }
  }

  const plainArrayRegex = /export\s+const\s+(\w+)\s*=\s*\[([\s\S]*?)\]\s*;?/g;
  for (const match of content.matchAll(plainArrayRegex)) {
    const exportName = match[1];
    if (symbols.has(exportName)) {
      continue;
    }

    const arrayBody = match[2] ?? '';
    exports.add(exportName);
    symbols.set(exportName, {
      fields: [
        ...extractQuotedStrings(arrayBody),
        ...extractSpreadTargets(arrayBody),
      ],
      kind: 'array',
    });
  }

  const aliasRegex = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*;?/g;
  for (const match of content.matchAll(aliasRegex)) {
    const exportName = match[1];
    if (symbols.has(exportName)) {
      continue;
    }

    const targetName = match[2];
    if (!targetName) {
      continue;
    }

    exports.add(exportName);
    symbols.set(exportName, {
      kind: 'alias',
      targetName,
    });
  }

  const parsed = { exports, imports, symbols };
  parsedAttributeFiles.set(filePath, parsed);
  return parsed;
}

function resolveAttributeImportPath(
  filePath: string,
  source: string,
): string | null {
  let resolvedPath: string | null = null;

  if (source.startsWith('.')) {
    resolvedPath = path.resolve(path.dirname(filePath), source);
  } else if (source.startsWith('@serializers/')) {
    resolvedPath = path.join(
      ROOT_DIR,
      'packages/serializers/src',
      source.replace('@serializers/', ''),
    );
  }

  if (!resolvedPath) {
    return null;
  }

  const withExtension = resolvedPath.endsWith('.ts')
    ? resolvedPath
    : `${resolvedPath}.ts`;

  return fs.existsSync(withExtension) ? withExtension : null;
}

function resolveSymbol(
  filePath: string,
  symbolName: string,
  trail: Set<string> = new Set(),
): string[] | null {
  const cacheKey = `${filePath}:${symbolName}`;
  if (resolvedAttributeExports.has(cacheKey)) {
    return resolvedAttributeExports.get(cacheKey) ?? null;
  }

  if (trail.has(cacheKey)) {
    return null;
  }

  const nextTrail = new Set(trail);
  nextTrail.add(cacheKey);

  const parsed = parseAttributeFile(filePath);
  const expression = parsed.symbols.get(symbolName);

  if (!expression) {
    const importedSymbol = parsed.imports.get(symbolName);
    if (importedSymbol) {
      const importedFilePath = resolveAttributeImportPath(
        filePath,
        importedSymbol.source,
      );
      if (!importedFilePath) {
        resolvedAttributeExports.set(cacheKey, null);
        return null;
      }

      const resolvedImport = resolveSymbol(
        importedFilePath,
        importedSymbol.importedName,
        nextTrail,
      );
      resolvedAttributeExports.set(cacheKey, resolvedImport);
      return resolvedImport;
    }

    resolvedAttributeExports.set(cacheKey, null);
    return null;
  }

  if (expression.kind === 'array') {
    const directFields = expression.fields.filter(
      (field) => !field.startsWith('...'),
    );
    const spreadTargets = expression.fields
      .filter((field) => field.startsWith('...'))
      .map((field) => field.slice(3));

    const resolvedFields = [...directFields];

    for (const spreadTarget of spreadTargets) {
      const spreadFields = resolveSymbol(filePath, spreadTarget, nextTrail);
      if (!spreadFields) {
        resolvedAttributeExports.set(cacheKey, null);
        return null;
      }

      resolvedFields.push(...spreadFields);
    }

    const uniqueFields = [...new Set(resolvedFields)];
    resolvedAttributeExports.set(cacheKey, uniqueFields);
    return uniqueFields;
  }

  const targetExpression = parsed.symbols.get(expression.targetName);
  if (targetExpression) {
    const resolved = resolveSymbol(filePath, expression.targetName, nextTrail);
    resolvedAttributeExports.set(cacheKey, resolved);
    return resolved;
  }

  const importBinding = parsed.imports.get(expression.targetName);
  if (!importBinding) {
    resolvedAttributeExports.set(cacheKey, null);
    return null;
  }

  const importedFilePath = resolveAttributeImportPath(
    filePath,
    importBinding.source,
  );
  if (!importedFilePath) {
    resolvedAttributeExports.set(cacheKey, null);
    return null;
  }

  const resolved = resolveSymbol(
    importedFilePath,
    importBinding.importedName,
    nextTrail,
  );
  resolvedAttributeExports.set(cacheKey, resolved);
  return resolved;
}

function buildAttributeGroups(): Map<string, string[]> {
  const attributeFiles = findTsFiles(ATTRIBUTE_ROOT)
    .filter((filePath) => filePath.endsWith('.attributes.ts'))
    .map((relativePath) => path.join(ATTRIBUTE_ROOT, relativePath));

  const groups = new Map<string, string[]>();
  for (const filePath of attributeFiles) {
    const basename = path.basename(filePath, '.attributes.ts');
    const existingPaths = groups.get(basename) ?? [];
    groups.set(basename, [...existingPaths, filePath]);
  }

  return groups;
}

function resolveAttributeBasename(
  schemaBasename: string,
  attributeGroups: Map<string, string[]>,
): string | null {
  if (attributeGroups.has(schemaBasename)) {
    return schemaBasename;
  }

  const override = SCHEMA_TO_ATTRIBUTE_BASENAME_OVERRIDES[schemaBasename];
  if (override && attributeGroups.has(override)) {
    return override;
  }

  const singular = singularize(schemaBasename);
  if (singular !== schemaBasename && attributeGroups.has(singular)) {
    return singular;
  }

  return null;
}

function areFieldSetsEqual(left: Set<string>, right: Set<string>): boolean {
  const normalizedLeft = normalizeFields(left);
  const normalizedRight = normalizeFields(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  for (const value of normalizedLeft) {
    if (!normalizedRight.includes(value)) {
      return false;
    }
  }

  return true;
}

function pickAttributeMatch(
  schema: SchemaInfo,
  attributeGroups: Map<string, string[]>,
): AttributeMatch | null {
  const attributeBasename = resolveAttributeBasename(
    schema.basename,
    attributeGroups,
  );

  if (!attributeBasename) {
    return null;
  }

  const candidateFiles = attributeGroups.get(attributeBasename) ?? [];
  const expectedExportName = `${toCamelCase(attributeBasename)}Attributes`;
  const matches: AttributeMatch[] = [];

  for (const filePath of candidateFiles) {
    const parsed = parseAttributeFile(filePath);
    const exportNames = parsed.exports.has(expectedExportName)
      ? [expectedExportName]
      : parsed.exports.size === 1
        ? [...parsed.exports]
        : [];

    for (const exportName of exportNames) {
      const fields = resolveSymbol(filePath, exportName);
      if (!fields) {
        continue;
      }

      matches.push({
        basename: attributeBasename,
        exportName,
        fields: new Set(fields),
        filePath,
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const [firstMatch, ...rest] = matches;
  if (
    rest.every((match) => areFieldSetsEqual(match.fields, firstMatch.fields))
  ) {
    return firstMatch;
  }

  return null;
}

function normalizeFields(fields: Set<string>): string[] {
  return [...fields]
    .filter((field) => !IGNORED_FIELDS.has(field))
    .sort((left, right) => left.localeCompare(right));
}

function formatPath(filePath: string): string {
  return path.relative(ROOT_DIR, filePath);
}

function compareSchemasForSelection(
  schemas: SchemaInfo[],
  attributeGroups: Map<string, string[]>,
): {
  drifts: Drift[];
  matchedCount: number;
  scannedCount: number;
  unmatchedSchemas: UnmatchedSchema[];
} {
  const drifts: Drift[] = [];
  const unmatchedSchemas: UnmatchedSchema[] = [];
  let matchedCount = 0;

  for (const schema of schemas) {
    const attribute = pickAttributeMatch(schema, attributeGroups);
    if (!attribute) {
      unmatchedSchemas.push({
        reason: 'No attribute file/export mapping found',
        schema,
      });
      continue;
    }

    matchedCount += 1;

    const schemaFields = normalizeFields(schema.fields);
    const attributeFields = normalizeFields(attribute.fields);

    const schemaFieldSet = new Set(schemaFields);
    const attributeFieldSet = new Set(attributeFields);

    const missingFields = schemaFields.filter(
      (field) => !attributeFieldSet.has(field),
    );
    const extraFields = attributeFields.filter(
      (field) => !schemaFieldSet.has(field),
    );

    if (missingFields.length > 0 || extraFields.length > 0) {
      drifts.push({
        attribute,
        extraFields,
        missingFields,
        schema,
      });
    }
  }

  return {
    drifts,
    matchedCount,
    scannedCount: schemas.length,
    unmatchedSchemas,
  };
}

type CliOptions = {
  files: string[];
};

function parseCliOptions(argv: string[]): CliOptions {
  const files: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--files') {
      continue;
    }

    for (let fileIndex = index + 1; fileIndex < argv.length; fileIndex += 1) {
      const value = argv[fileIndex];
      if (value.startsWith('--')) {
        break;
      }

      files.push(value);
      index = fileIndex;
    }
  }

  return { files };
}

function matchesFileSelection(
  schema: SchemaInfo,
  selectedFiles: Set<string>,
  attributeGroups: Map<string, string[]>,
): boolean {
  const relativeSchemaPath = formatPath(schema.filePath);
  if (
    selectedFiles.has(schema.filePath) ||
    selectedFiles.has(relativeSchemaPath)
  ) {
    return true;
  }

  const attributeBasename = resolveAttributeBasename(
    schema.basename,
    attributeGroups,
  );
  if (!attributeBasename) {
    return false;
  }

  const candidateFiles = attributeGroups.get(attributeBasename) ?? [];
  return candidateFiles.some((filePath) => {
    const relativePath = formatPath(filePath);
    return selectedFiles.has(filePath) || selectedFiles.has(relativePath);
  });
}

function printResults(result: {
  drifts: Drift[];
  matchedCount: number;
  unmatchedSchemas: UnmatchedSchema[];
  scannedCount: number;
}): void {
  const { drifts, matchedCount, scannedCount, unmatchedSchemas } = result;

  console.log('Serializer drift report');
  console.log(`- Schemas scanned: ${scannedCount}`);
  console.log(`- Matched schema/attribute pairs: ${matchedCount}`);
  console.log(`- Unmatched schemas: ${unmatchedSchemas.length}`);
  console.log(`- Drifted pairs: ${drifts.length}`);

  if (drifts.length > 0) {
    console.log('\nDrift detected:\n');

    for (const drift of drifts) {
      console.log(
        `- ${drift.schema.className} (${formatPath(drift.schema.filePath)} ↔ ${formatPath(drift.attribute.filePath)})`,
      );

      if (drift.missingFields.length > 0) {
        console.log(
          `  Missing in serializer: ${drift.missingFields.join(', ')}`,
        );
      }

      if (drift.extraFields.length > 0) {
        console.log(`  Extra in serializer: ${drift.extraFields.join(', ')}`);
      }

      console.log('');
    }
  } else {
    console.log('\nNo serializer drift detected.');
  }

  if (unmatchedSchemas.length > 0) {
    console.log('\nUnmatched schemas (not treated as drift):\n');

    for (const entry of unmatchedSchemas) {
      console.log(
        `- ${entry.schema.className} (${formatPath(entry.schema.filePath)})`,
      );
      console.log(`  Reason: ${entry.reason}`);
    }
  }
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const attributeGroups = buildAttributeGroups();
  const schemas = collectSchemas();
  const selectedFiles = new Set(
    options.files.map((filePath) =>
      path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(filePath),
    ),
  );
  const filteredSchemas =
    selectedFiles.size === 0
      ? schemas
      : schemas.filter((schema) =>
          matchesFileSelection(schema, selectedFiles, attributeGroups),
        );

  const result = compareSchemasForSelection(filteredSchemas, attributeGroups);
  printResults(result);
  process.exitCode = result.drifts.length > 0 ? 1 : 0;
}

main();
