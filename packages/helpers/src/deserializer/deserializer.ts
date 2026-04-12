export interface JsonApiResource {
  id?: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, JsonApiRelationship>;
}

interface JsonApiResourceIdentifier {
  id: string;
  type: string;
}

type JsonApiRelationship =
  | { data: JsonApiResourceIdentifier | null }
  | { data: JsonApiResourceIdentifier[] | null };

export interface JsonApiDocument {
  data?: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
}

type JsonApiDocumentWithData = JsonApiDocument & {
  data: JsonApiResource | JsonApiResource[];
};

interface RelationshipDeserializerOptions {
  valueForRelationship: (
    relationship: JsonApiResourceIdentifier,
    included?: Record<string, unknown> | null,
  ) => unknown;
}

type AttributeCaseOption =
  | 'dash-case'
  | 'lisp-case'
  | 'spinal-case'
  | 'kebab-case'
  | 'underscore_case'
  | 'snake_case'
  | 'camelCase'
  | 'CamelCase';

interface JsonApiDeserializerOptions {
  keyForAttribute?: AttributeCaseOption | ((attribute: string) => string);
  nullIfMissing?: boolean;
  relationships?: Record<string, RelationshipDeserializerOptions>;
}

interface JsonApiDeserializerRuntimeOptions
  extends Required<
    Pick<JsonApiDeserializerOptions, 'keyForAttribute' | 'nullIfMissing'>
  > {
  [relationshipType: string]:
    | RelationshipDeserializerOptions
    | JsonApiDeserializerOptions['keyForAttribute']
    | JsonApiDeserializerOptions['nullIfMissing'];
}

interface JsonApiDeserializerRuntime {
  deserialize<TOutput = unknown>(document: JsonApiDocument): TOutput;
  collection<TOutput = unknown>(document: JsonApiDocument): TOutput[];
  resource<TOutput = unknown>(document: JsonApiDocument): TOutput;
}

// ── Native camelCase conversion (replaces inflected dependency) ──

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function convertKey(
  key: string,
  keyForAttribute: JsonApiDeserializerOptions['keyForAttribute'],
): string {
  if (typeof keyForAttribute === 'function') {
    return keyForAttribute(key);
  }
  // Default and most common case
  return toCamelCase(key);
}

// ── Native Deserializer (replaces ts-jsonapi + lodash) ──

class NativeDeserializer {
  constructor(
    _jsonapi: JsonApiDocument,
    private opts: JsonApiDeserializerRuntimeOptions,
  ) {}

  deserialize<TOutput = unknown>(document: JsonApiDocument): TOutput {
    if (Array.isArray(document.data)) {
      return this.collection(document) as TOutput;
    }
    return this.resource(document) as TOutput;
  }

  collection<TOutput = unknown>(document: JsonApiDocument): TOutput[] {
    return (document.data as JsonApiResource[]).map(
      (d) => this.processResource(document, d) as TOutput,
    );
  }

  resource<TOutput = unknown>(document: JsonApiDocument): TOutput {
    return this.processResource(
      document,
      document.data as JsonApiResource,
    ) as TOutput;
  }

  private processResource(
    document: JsonApiDocument,
    data: JsonApiResource,
  ): Record<string, unknown> {
    const utils = new DeserializerUtils(document, data, this.opts);
    return utils.perform();
  }
}

class DeserializerUtils {
  private alreadyIncluded: Array<{
    to: { id: string; type: string };
    from: { id: string; type: string };
    relation: string;
  }> = [];

  constructor(
    private jsonapi: JsonApiDocument,
    private data: JsonApiResource,
    private opts: JsonApiDeserializerRuntimeOptions,
  ) {}

  perform(): Record<string, unknown> {
    return {
      ...this.extractAttributes(this.data),
      ...this.extractRelationships(this.data),
    };
  }

  private extractAttributes(from: JsonApiResource): Record<string, unknown> {
    const dest = this.convertKeys(from.attributes || {});
    if ('id' in from) {
      dest.id = from.id;
    }
    return dest;
  }

  private convertKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = convertKey(key, this.opts.keyForAttribute);
      if (Array.isArray(value)) {
        result[newKey] = value.map((item) =>
          isPlainObject(item)
            ? this.convertKeys(item as Record<string, unknown>)
            : item,
        );
      } else if (isPlainObject(value)) {
        result[newKey] = this.convertKeys(value as Record<string, unknown>);
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  private extractRelationships(from: JsonApiResource): Record<string, unknown> {
    if (!from.relationships) {
      return {};
    }

    const dest: Record<string, unknown> = {};

    for (const key of Object.keys(from.relationships)) {
      const relationship = from.relationships[key] as {
        data: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
      };

      if (relationship.data === null) {
        dest[convertKey(key, this.opts.keyForAttribute)] = null;
      } else if (Array.isArray(relationship.data)) {
        dest[convertKey(key, this.opts.keyForAttribute)] =
          relationship.data.map((rd) => this.extractIncludes(rd, key, from));
      } else {
        const includes = this.extractIncludes(relationship.data, key, from);
        if (includes) {
          dest[convertKey(key, this.opts.keyForAttribute)] = includes;
        }
      }
    }

    return dest;
  }

  private extractIncludes(
    relationshipData: JsonApiResourceIdentifier,
    relationshipName: string,
    from: JsonApiResource,
  ): unknown {
    const included = this.findIncluded(
      relationshipData,
      relationshipName,
      from,
    );
    return this.getValueForRelationship(relationshipData, included);
  }

  private getValueForRelationship(
    relationshipData: JsonApiResourceIdentifier,
    included: Record<string, unknown> | null,
  ): unknown {
    const relOpts = this.opts[relationshipData.type] as
      | RelationshipDeserializerOptions
      | undefined;
    if (
      relOpts &&
      typeof relOpts === 'object' &&
      'valueForRelationship' in relOpts
    ) {
      return relOpts.valueForRelationship(relationshipData, included);
    }
    return included;
  }

  private findIncluded(
    relationshipData: JsonApiResourceIdentifier,
    relationshipName: string,
    from: JsonApiResource,
  ): Record<string, unknown> | null {
    if (!this.jsonapi.included || !relationshipData) {
      return null;
    }

    const included = this.jsonapi.included.find(
      (inc) =>
        inc.id === relationshipData.id && inc.type === relationshipData.type,
    );

    const includedObject = {
      from: { id: relationshipData.id, type: relationshipData.type },
      relation: relationshipName,
      to: { id: from.id!, type: from.type },
    };

    const alreadySeen = this.alreadyIncluded.some(
      (ai) =>
        ai.to.id === includedObject.to.id &&
        ai.to.type === includedObject.to.type &&
        ai.from.id === includedObject.from.id &&
        ai.from.type === includedObject.from.type &&
        ai.relation === includedObject.relation,
    );

    if (alreadySeen) {
      return null;
    }

    this.alreadyIncluded.push(includedObject);

    if (included) {
      return {
        ...this.extractAttributes(included),
        ...this.extractRelationships(included),
      };
    }

    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// ── Public API (unchanged interface) ──

function buildRuntimeOptions(
  document?: JsonApiDocument,
  customOptions?: JsonApiDeserializerOptions,
): JsonApiDeserializerRuntimeOptions {
  const options: JsonApiDeserializerRuntimeOptions = {
    keyForAttribute: customOptions?.keyForAttribute ?? 'camelCase',
    nullIfMissing: customOptions?.nullIfMissing ?? true,
  };

  const relationshipOptions = {
    ...inferRelationshipOptions(document),
    ...(customOptions?.relationships ?? {}),
  };

  for (const [relationshipType, config] of Object.entries(
    relationshipOptions,
  )) {
    options[relationshipType] = config;
  }

  return options;
}

function inferRelationshipOptions(
  document?: JsonApiDocument,
): Record<string, RelationshipDeserializerOptions> {
  if (!hasPrimaryData(document) || hasIncludedResources(document)) {
    return {};
  }

  const inferred: Record<string, RelationshipDeserializerOptions> = {};

  for (const resource of normalizeResources(document.data)) {
    const relationships = resource.relationships;
    if (!relationships) {
      continue;
    }

    for (const relationshipKey of Object.keys(relationships)) {
      const relationship = relationships[relationshipKey] as {
        data: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
      };
      const relationshipData = relationship?.data;

      let relationType: string | undefined;
      if (Array.isArray(relationshipData) && relationshipData.length > 0) {
        relationType = relationshipData[0].type;
      } else if (relationshipData && !Array.isArray(relationshipData)) {
        relationType = relationshipData.type;
      }

      const optionKey = relationType || relationshipKey;

      if (inferred[optionKey]) {
        continue;
      }

      inferred[optionKey] = {
        valueForRelationship: (rel) => {
          if (!rel || typeof rel.id !== 'string') {
            return null;
          }

          return { id: rel.id };
        },
      };
    }
  }

  return inferred;
}

function hasIncludedResources(document: JsonApiDocument): boolean {
  return Array.isArray(document.included) && document.included.length > 0;
}

function hasPrimaryData(
  document?: JsonApiDocument,
): document is JsonApiDocumentWithData {
  if (!document) {
    return false;
  }
  if (Array.isArray(document.data)) {
    return true;
  }
  return typeof document.data === 'object' && document.data !== null;
}

function normalizeResources(
  data: JsonApiResource | JsonApiResource[],
): JsonApiResource[] {
  return Array.isArray(data) ? data : [data];
}

export function getDeserializer<TOutput = unknown>(
  document?: JsonApiDocument,
  customOptions?: JsonApiDeserializerOptions,
): JsonApiDeserializerRuntime | TOutput {
  const options = buildRuntimeOptions(document, customOptions);
  const deserializer = new NativeDeserializer(
    document || { data: [] },
    options,
  ) as unknown as JsonApiDeserializerRuntime;

  if (!document || !hasPrimaryData(document)) {
    return deserializer;
  }

  return deserializer.deserialize<TOutput>(document as JsonApiDocumentWithData);
}

export function isDeserializerRuntime(
  value: unknown,
): value is JsonApiDeserializerRuntime {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as JsonApiDeserializerRuntime).deserialize === 'function'
  );
}
