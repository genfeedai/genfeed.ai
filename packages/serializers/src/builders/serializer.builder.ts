import {
  getSerializer,
  type ISerializerConfig,
  type ISerializerRelationship,
} from '@genfeedai/helpers';
import type { ISerializer } from '@serializers/interfaces';

type SerializerBuilderConfig = ISerializerConfig & {
  relationships?: Record<string, ISerializerRelationship>;
  [key: string]: unknown;
};

/**
 * Builds a serializer with the appropriate ID mapping based on package type.
 */
export function buildSerializer(
  packageType: 'client' | 'server',
  config: SerializerBuilderConfig,
): Record<string, ISerializer> {
  if (!config) {
    throw new Error(
      `buildSerializer received undefined config for packageType="${packageType}". This is likely a circular import.`,
    );
  }
  const { type, attributes, relationships, ...rest } = config;
  const { relationshipEntries, passthrough } = partitionRelationships(rest);

  const serializerConfig: SerializerBuilderConfig = {
    attributes,
    type,
    ...passthrough,
    ...(relationships ?? {}),
  };

  for (const [key, value] of relationshipEntries) {
    serializerConfig[key] = value;
  }

  const typeCapitalized = type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  const idMapping = packageType === 'client' ? 'id' : '_id';

  return {
    [`${typeCapitalized}Serializer`]: getSerializer(
      serializerConfig,
      'default',
      { id: idMapping },
    ),
  };
}

/**
 * Backward-compatible helper for consumers compiled against the older
 * single-serializer API surface.
 */
export function buildSingleSerializer(
  packageType: 'client' | 'server',
  config: SerializerBuilderConfig,
): ISerializer {
  const serializers = buildSerializer(packageType, config);
  const [serializer] = Object.values(serializers);

  if (!serializer) {
    throw new Error(
      `buildSingleSerializer could not create a serializer for type="${config?.type ?? 'unknown'}".`,
    );
  }

  return serializer;
}

/**
 * Creates a serializer config with optional relationships.
 */
export function createSerializerConfig(
  type: string,
  attributes: string[],
  relationships?: Record<string, ISerializerRelationship>,
): SerializerBuilderConfig {
  return {
    attributes,
    type,
    ...(relationships ?? {}),
  };
}

/**
 * Creates a simple serializer config with just type and attributes.
 * Use this for configs without relationships for cleaner code.
 */
export function simpleConfig(
  type: string,
  attributes: string[],
): SerializerBuilderConfig {
  return { attributes, type };
}

/**
 * Creates a relationship definition with standard _id reference.
 * Reduces boilerplate: `rel('user', userAttributes)` instead of `{ ref: '_id', type: 'user', attributes: userAttributes }`
 */
export function rel(
  type: string,
  attributes: string[],
): ISerializerRelationship {
  return { attributes, ref: '_id', type };
}

/**
 * Creates a nested relationship with child relationships.
 * Use for relationships that have their own relationships.
 */
export function nestedRel(
  type: string,
  attributes: string[],
  nested: Record<string, ISerializerRelationship>,
): ISerializerRelationship & Record<string, ISerializerRelationship> {
  return {
    attributes,
    ref: '_id',
    type,
    ...nested,
  } as ISerializerRelationship & Record<string, ISerializerRelationship>;
}

function isSerializerRelationship(
  value: unknown,
): value is ISerializerRelationship {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

function partitionRelationships(entries: Record<string, unknown>): {
  relationshipEntries: Array<[string, ISerializerRelationship]>;
  passthrough: Record<string, unknown>;
} {
  const relationshipEntries: Array<[string, ISerializerRelationship]> = [];
  const passthrough: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entries)) {
    if (isSerializerRelationship(value)) {
      relationshipEntries.push([key, value]);
    } else {
      passthrough[key] = value;
    }
  }

  return { passthrough, relationshipEntries };
}
