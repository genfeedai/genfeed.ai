import {
  getSerializer,
  type ISerializerConfig,
  type ISerializerRelationship,
} from '@genfeedai/helpers';
import type { Serializer as JsonApiSerializer } from 'ts-jsonapi';

type SerializerBuilderConfig = ISerializerConfig & {
  relationships?: Record<string, ISerializerRelationship>;
  [key: string]: unknown;
};

export type BuiltSerializer = JsonApiSerializer;
export type BuiltSerializerMap = Record<string, BuiltSerializer>;

/**
 * Builds a serializer with the appropriate ID mapping based on package type.
 */
export function buildSerializer(
  packageType: 'client' | 'server',
  config: SerializerBuilderConfig,
): BuiltSerializerMap {
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

export function buildSingleSerializer(
  packageType: 'client' | 'server',
  config: SerializerBuilderConfig,
): BuiltSerializer {
  const serializers = buildSerializer(packageType, config);
  const firstSerializer = Object.values(serializers)[0];

  if (!firstSerializer) {
    throw new Error(
      `buildSingleSerializer failed for type="${config.type}". No serializer was produced.`,
    );
  }

  return firstSerializer;
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
