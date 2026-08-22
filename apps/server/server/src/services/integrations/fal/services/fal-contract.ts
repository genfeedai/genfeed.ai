export enum FalSchemaFamily {
  IMAGE_EDIT_MULTI = 'image-edit-multi-v1',
  IMAGE_EDIT_SINGLE = 'image-edit-single-v1',
  IMAGE_TEXT = 'image-text-v1',
  VIDEO_IMAGE = 'video-image-v1',
  VIDEO_TEXT = 'video-text-v1',
}

export interface FalJsonSchema extends Record<string, unknown> {
  allOf?: FalJsonSchema[];
  anyOf?: FalJsonSchema[];
  enum?: unknown[];
  items?: FalJsonSchema;
  oneOf?: FalJsonSchema[];
  properties?: Record<string, FalJsonSchema>;
  required?: string[];
  type?: string;
}

export interface FalEndpointSchemas {
  input: FalJsonSchema;
  output: FalJsonSchema;
}

export interface FalImageAdapterInput {
  height: number;
  prompt: string;
  referenceImageUrls: string[];
  seed?: number;
  width: number;
}

export interface FalVideoAdapterInput {
  duration?: number;
  imageUrl?: string;
  prompt: string;
  promptParams: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asSchema(value: unknown): FalJsonSchema {
  if (!isRecord(value)) {
    throw new Error('Fal OpenAPI contract is missing a JSON schema');
  }
  return value as FalJsonSchema;
}

function resolveLocalRef(
  openapi: Record<string, unknown>,
  schema: FalJsonSchema,
): FalJsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return schema;
  }

  let current: unknown = openapi;
  for (const segment of ref.slice(2).split('/')) {
    if (!isRecord(current)) {
      throw new Error(`Fal OpenAPI reference cannot be resolved: ${ref}`);
    }
    current = current[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return asSchema(current);
}

function resolveSchemaRefs(
  openapi: Record<string, unknown>,
  schema: FalJsonSchema,
  resolvingRefs = new Set<string>(),
): FalJsonSchema {
  const ref = typeof schema.$ref === 'string' ? schema.$ref : null;
  if (ref && resolvingRefs.has(ref)) {
    return schema;
  }

  const nextResolvingRefs = new Set(resolvingRefs);
  let resolved = schema;
  if (ref) {
    nextResolvingRefs.add(ref);
    resolved = { ...resolveLocalRef(openapi, schema), ...schema };
    delete resolved.$ref;
  }

  const result: FalJsonSchema = { ...resolved };
  if (resolved.properties) {
    result.properties = Object.fromEntries(
      Object.entries(resolved.properties).map(([key, property]) => [
        key,
        resolveSchemaRefs(openapi, property, nextResolvingRefs),
      ]),
    );
  }
  if (resolved.items) {
    result.items = resolveSchemaRefs(
      openapi,
      resolved.items,
      nextResolvingRefs,
    );
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const variants = resolved[keyword];
    if (variants) {
      result[keyword] = variants.map((variant) =>
        resolveSchemaRefs(openapi, variant, nextResolvingRefs),
      );
    }
  }
  return result;
}

function readContentSchema(
  openapi: Record<string, unknown>,
  container: unknown,
): FalJsonSchema {
  if (!isRecord(container) || !isRecord(container.content)) {
    throw new Error(
      'Fal OpenAPI operation is missing application/json content',
    );
  }
  const media = container.content['application/json'];
  if (!isRecord(media)) {
    throw new Error(
      'Fal OpenAPI operation is missing application/json content',
    );
  }
  return resolveSchemaRefs(openapi, asSchema(media.schema));
}

export function extractFalEndpointSchemas(
  openapi: Record<string, unknown>,
): FalEndpointSchemas {
  if (!isRecord(openapi.paths)) {
    throw new Error('Fal OpenAPI contract is missing paths');
  }

  const operation = Object.values(openapi.paths)
    .filter(isRecord)
    .map((path) => path.post)
    .find(isRecord);
  if (!operation) {
    throw new Error('Fal OpenAPI contract is missing a POST operation');
  }
  if (!isRecord(operation.responses)) {
    throw new Error('Fal OpenAPI contract is missing responses');
  }

  const successResponse =
    operation.responses['200'] ?? operation.responses['201'];
  return {
    input: readContentSchema(openapi, operation.requestBody),
    output: readContentSchema(openapi, successResponse),
  };
}

function hasProperty(schema: FalJsonSchema, property: string): boolean {
  return Boolean(schema.properties?.[property]);
}

function hasRequiredPrompt(schema: FalJsonSchema): boolean {
  return (
    schema.required?.includes('prompt') === true &&
    hasProperty(schema, 'prompt')
  );
}

export function classifyFalSchemaFamily(
  category: string | undefined,
  input: FalJsonSchema,
  output: FalJsonSchema,
): FalSchemaFamily | null {
  if (!hasRequiredPrompt(input)) {
    return null;
  }

  const normalizedCategory = category?.trim().toLowerCase();
  const imageOutput =
    hasProperty(output, 'image') || hasProperty(output, 'images');
  const videoOutput =
    hasProperty(output, 'video') || hasProperty(output, 'videos');

  if (
    imageOutput &&
    ['image-to-image', 'text-to-image'].includes(normalizedCategory ?? '')
  ) {
    if (hasProperty(input, 'image_urls')) {
      return FalSchemaFamily.IMAGE_EDIT_MULTI;
    }
    if (hasProperty(input, 'image_url')) {
      return FalSchemaFamily.IMAGE_EDIT_SINGLE;
    }
    return FalSchemaFamily.IMAGE_TEXT;
  }

  if (
    videoOutput &&
    ['image-to-video', 'text-to-video'].includes(normalizedCategory ?? '')
  ) {
    return hasProperty(input, 'image_url')
      ? FalSchemaFamily.VIDEO_IMAGE
      : FalSchemaFamily.VIDEO_TEXT;
  }

  return null;
}

function matchesSchema(value: unknown, schema: FalJsonSchema): boolean {
  const variants = schema.oneOf ?? schema.anyOf;
  if (variants) {
    return variants.some((variant) => matchesSchema(value, variant));
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return false;
  }

  switch (schema.type) {
    case 'array':
      return (
        Array.isArray(value) &&
        (!schema.items ||
          value.every((item) =>
            matchesSchema(item, schema.items as FalJsonSchema),
          ))
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isRecord(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function validateFalInput(
  schema: FalJsonSchema,
  input: Record<string, unknown>,
): Record<string, unknown> {
  for (const required of schema.required ?? []) {
    const value = input[required];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Fal input is missing required field: ${required}`);
    }
    if (Array.isArray(value) && value.length === 0) {
      throw new Error(`Fal input is missing required field: ${required}`);
    }
  }

  for (const [key, value] of Object.entries(input)) {
    const property = schema.properties?.[key];
    if (property && !matchesSchema(value, property)) {
      throw new Error(`Fal input does not match reviewed field: ${key}`);
    }
  }
  return input;
}

function acceptsObject(schema: FalJsonSchema | undefined): boolean {
  if (!schema) return false;
  if (schema.type === 'object') return true;
  return (schema.oneOf ?? schema.anyOf ?? []).some(acceptsObject);
}

function coerceReviewedValue(
  value: unknown,
  schema: FalJsonSchema | undefined,
): unknown {
  if (schema?.type === 'string' && typeof value === 'number') {
    return String(value);
  }
  return value;
}

export function adaptFalImageRequest(
  family: FalSchemaFamily,
  schema: FalJsonSchema,
  request: FalImageAdapterInput,
): Record<string, unknown> {
  if (
    ![
      FalSchemaFamily.IMAGE_EDIT_MULTI,
      FalSchemaFamily.IMAGE_EDIT_SINGLE,
      FalSchemaFamily.IMAGE_TEXT,
    ].includes(family)
  ) {
    throw new Error(`Fal schema family is not an image adapter: ${family}`);
  }

  const input: Record<string, unknown> = { prompt: request.prompt };
  if (acceptsObject(schema.properties?.image_size)) {
    input.image_size = { height: request.height, width: request.width };
  }
  if (request.seed !== undefined && schema.properties?.seed) {
    input.seed = request.seed;
  }
  if (family === FalSchemaFamily.IMAGE_EDIT_MULTI) {
    input.image_urls = request.referenceImageUrls;
  }
  if (family === FalSchemaFamily.IMAGE_EDIT_SINGLE) {
    input.image_url = request.referenceImageUrls[0];
  }

  return validateFalInput(schema, input);
}

export function adaptFalVideoRequest(
  family: FalSchemaFamily,
  schema: FalJsonSchema,
  request: FalVideoAdapterInput,
): Record<string, unknown> {
  if (
    ![FalSchemaFamily.VIDEO_IMAGE, FalSchemaFamily.VIDEO_TEXT].includes(family)
  ) {
    throw new Error(`Fal schema family is not a video adapter: ${family}`);
  }

  const allowedProperties = schema.properties ?? {};
  const input = Object.fromEntries(
    Object.entries(request.promptParams).filter(
      ([key, value]) =>
        Object.hasOwn(allowedProperties, key) && value !== undefined,
    ),
  );
  input.prompt = request.prompt;
  if (request.duration !== undefined && allowedProperties.duration) {
    input.duration = coerceReviewedValue(
      request.duration,
      allowedProperties.duration,
    );
  }
  if (family === FalSchemaFamily.VIDEO_IMAGE) {
    input.image_url = request.imageUrl;
  }

  return validateFalInput(schema, input);
}
