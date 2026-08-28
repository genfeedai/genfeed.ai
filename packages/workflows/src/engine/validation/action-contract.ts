import Ajv, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv';
import addFormats from 'ajv-formats';

export type ActionContractJsonSchema = Readonly<Record<string, unknown>>;

export interface ActionContractDefinition {
  inputSchema: ActionContractJsonSchema;
  outputSchema: ActionContractJsonSchema;
}

export interface ActionContractProvenance {
  nodeId: string;
  runId: string;
  workflowId: string;
  workflowVersionId: string;
}

export type ActionContractBoundary = 'input' | 'output';

export interface ActionContractValidationIssue {
  message: string;
  path: string;
}

export interface CompiledActionContract {
  validateInput(value: unknown, provenance: ActionContractProvenance): void;
  validateOutput(value: unknown, provenance: ActionContractProvenance): void;
}

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
});
addFormats(ajv);

const compiledSchemas = new WeakMap<object, ValidateFunction>();

const ANNOTATION_KEYWORDS: ReadonlySet<string> = new Set([
  '$comment',
  '$id',
  '$schema',
  'default',
  'deprecated',
  'description',
  'examples',
  'readOnly',
  'title',
  'writeOnly',
]);

const SCHEMA_ARRAY_KEYWORDS = [
  'allOf',
  'anyOf',
  'oneOf',
  'prefixItems',
] as const;
const SCHEMA_KEYWORDS = [
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
] as const;

export class ActionContractCompilationError extends Error {
  constructor(
    actionId: string,
    boundary: ActionContractBoundary,
    detail: string,
  ) {
    super(
      `Action contract compilation failed [action=${actionId} boundary=${boundary}]: ${detail}`,
    );
    this.name = 'ActionContractCompilationError';
  }
}

export class ActionContractValidationError extends Error {
  readonly issues: readonly ActionContractValidationIssue[];

  constructor(
    actionId: string,
    boundary: ActionContractBoundary,
    provenance: ActionContractProvenance,
    issues: readonly ActionContractValidationIssue[],
  ) {
    const details = issues
      .slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    const omitted = issues.length > 5 ? `; ${issues.length - 5} more` : '';
    super(
      `Action contract ${boundary} validation failed [action=${actionId} workflow=${provenance.workflowId} version=${provenance.workflowVersionId} run=${provenance.runId} node=${provenance.nodeId}] ${details}${omitted}`,
    );
    this.issues = issues;
    this.name = 'ActionContractValidationError';
  }
}

export function compileActionContract(
  actionId: string,
  contract: ActionContractDefinition,
): CompiledActionContract {
  const inputValidator = compileSchema(actionId, 'input', contract.inputSchema);
  const outputValidator = compileSchema(
    actionId,
    'output',
    contract.outputSchema,
  );

  return {
    validateInput: (value, provenance) =>
      assertValid(actionId, 'input', inputValidator, value, provenance),
    validateOutput: (value, provenance) =>
      assertValid(actionId, 'output', outputValidator, value, provenance),
  };
}

function compileSchema(
  actionId: string,
  boundary: ActionContractBoundary,
  schema: ActionContractJsonSchema,
): ValidateFunction {
  const cached = compiledSchemas.get(schema);
  if (cached) {
    return cached;
  }

  assertConcreteSchema(actionId, boundary, schema, '$');
  try {
    const validator = ajv.compile(schema as AnySchema);
    compiledSchemas.set(schema, validator);
    return validator;
  } catch (error) {
    throw new ActionContractCompilationError(
      actionId,
      boundary,
      error instanceof Error ? error.message : 'schema compilation failed',
    );
  }
}

function assertValid(
  actionId: string,
  boundary: ActionContractBoundary,
  validator: ValidateFunction,
  value: unknown,
  provenance: ActionContractProvenance,
): void {
  if (validator(value)) {
    return;
  }
  throw new ActionContractValidationError(
    actionId,
    boundary,
    provenance,
    (validator.errors ?? []).map(toValidationIssue),
  );
}

function assertConcreteSchema(
  actionId: string,
  boundary: ActionContractBoundary,
  candidate: unknown,
  path: string,
): void {
  if (!isRecord(candidate)) {
    failCompilation(actionId, boundary, `${path} must be a schema object`);
  }
  const schema = candidate as ActionContractJsonSchema;
  const assertionKeys = Object.keys(schema).filter(
    (key) => !ANNOTATION_KEYWORDS.has(key) && !key.startsWith('x-'),
  );
  if (assertionKeys.length === 0) {
    failCompilation(
      actionId,
      boundary,
      `${path} is unconstrained; define an explicit contract`,
    );
  }

  if (declaresObject(schema)) {
    const additionalProperties = schema.additionalProperties;
    if (additionalProperties === undefined || additionalProperties === true) {
      failCompilation(
        actionId,
        boundary,
        `${path} must set additionalProperties to false or a concrete schema`,
      );
    }
  }

  if (declaresArray(schema) && schema.items === undefined) {
    failCompilation(
      actionId,
      boundary,
      `${path} arrays must define an items contract`,
    );
  }

  visitSchemaRecord(
    actionId,
    boundary,
    schema.properties,
    `${path}.properties`,
  );
  visitSchemaRecord(
    actionId,
    boundary,
    schema.patternProperties,
    `${path}.patternProperties`,
  );
  visitSchemaRecord(actionId, boundary, schema.$defs, `${path}.$defs`);
  visitSchemaRecord(
    actionId,
    boundary,
    schema.definitions,
    `${path}.definitions`,
  );
  visitSchemaRecord(
    actionId,
    boundary,
    schema.dependentSchemas,
    `${path}.dependentSchemas`,
  );

  for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
    const schemas = schema[keyword];
    if (schemas === undefined) {
      continue;
    }
    if (!Array.isArray(schemas)) {
      failCompilation(
        actionId,
        boundary,
        `${path}.${keyword} must be a schema array`,
      );
    }
    schemas.forEach((nested, index) => {
      assertConcreteSchema(
        actionId,
        boundary,
        nested,
        `${path}.${keyword}[${index}]`,
      );
    });
  }

  for (const keyword of SCHEMA_KEYWORDS) {
    const nested = schema[keyword];
    if (nested === undefined || nested === false) {
      continue;
    }
    if (nested === true) {
      failCompilation(
        actionId,
        boundary,
        `${path}.${keyword} may not use an unconstrained true schema`,
      );
    }
    assertConcreteSchema(actionId, boundary, nested, `${path}.${keyword}`);
  }
}

function visitSchemaRecord(
  actionId: string,
  boundary: ActionContractBoundary,
  candidate: unknown,
  path: string,
): void {
  if (candidate === undefined) {
    return;
  }
  if (!isRecord(candidate)) {
    failCompilation(actionId, boundary, `${path} must be a schema map`);
  }
  for (const [key, schema] of Object.entries(candidate)) {
    assertConcreteSchema(
      actionId,
      boundary,
      schema,
      `${path}${propertyPath(key)}`,
    );
  }
}

function declaresObject(schema: ActionContractJsonSchema): boolean {
  return (
    includesType(schema.type, 'object') ||
    schema.properties !== undefined ||
    schema.patternProperties !== undefined ||
    schema.additionalProperties !== undefined
  );
}

function declaresArray(schema: ActionContractJsonSchema): boolean {
  return includesType(schema.type, 'array');
}

function includesType(candidate: unknown, expected: string): boolean {
  return (
    candidate === expected ||
    (Array.isArray(candidate) && candidate.includes(expected))
  );
}

function toValidationIssue(error: ErrorObject): ActionContractValidationIssue {
  const property = readMissingProperty(error) ?? readAdditionalProperty(error);
  return {
    message: error.message ?? `failed ${error.keyword} validation`,
    path: `${jsonPointerToPath(error.instancePath)}${
      property ? propertyPath(property) : ''
    }`,
  };
}

function readMissingProperty(error: ErrorObject): string | undefined {
  return error.keyword === 'required' &&
    typeof error.params.missingProperty === 'string'
    ? error.params.missingProperty
    : undefined;
}

function readAdditionalProperty(error: ErrorObject): string | undefined {
  return error.keyword === 'additionalProperties' &&
    typeof error.params.additionalProperty === 'string'
    ? error.params.additionalProperty
    : undefined;
}

function jsonPointerToPath(pointer: string): string {
  if (pointer.length === 0) {
    return '$';
  }
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce(
      (path, segment) =>
        /^\d+$/.test(segment)
          ? `${path}[${segment}]`
          : `${path}${propertyPath(segment)}`,
      '$',
    );
}

function propertyPath(property: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(property)
    ? `.${property}`
    : `[${JSON.stringify(property)}]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failCompilation(
  actionId: string,
  boundary: ActionContractBoundary,
  detail: string,
): never {
  throw new ActionContractCompilationError(actionId, boundary, detail);
}
