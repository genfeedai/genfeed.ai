import { Serializer } from 'ts-jsonapi';

export function createEntityAttributes(customAttributes: string[]): string[] {
  return [
    ...new Set([...customAttributes, 'createdAt', 'updatedAt', 'isDeleted']),
  ];
}

export interface ISerializerConfig {
  type: string;
  attributes: string[];
  relationships?: Record<string, ISerializerRelationship>;
  where?: Record<string, unknown>;
}

export interface ISerializerRelationship {
  type: string;
  ref?: string;
  attributes?: string[];
  where?: Record<string, unknown>;
}

export interface ISerializerOptions {
  id?: string;
  keyForAttribute?: CaseOption | ((attribute: string) => string);
  nullIfMissing?: boolean;
  pluralizeType?: boolean;
}

export type SerializerMode = 'api' | 'frontend' | 'default';

type SerializerRuntimeOptions = ISerializerConfig & {
  id: string;
  keyForAttribute: CaseOption | ((attribute: string) => string);
  nullIfMissing: boolean;
  pluralizeType: boolean;
};

type SerializerResettable = {
  payload: Record<string, unknown>;
  serialize: (payload: unknown) => unknown;
};

type CaseOption =
  | 'dash-case'
  | 'lisp-case'
  | 'spinal-case'
  | 'kebab-case'
  | 'underscore_case'
  | 'snake_case'
  | 'camelCase'
  | 'CamelCase';

const PASSTHROUGH_KEY = (attribute: string): string => attribute;

const DEFAULT_OPTIONS: ISerializerOptions = {
  id: 'id',
  keyForAttribute: PASSTHROUGH_KEY,
  nullIfMissing: true,
  pluralizeType: false,
};

const MODE_OPTIONS: Record<SerializerMode, ISerializerOptions> = {
  api: {
    id: '_id',
    keyForAttribute: 'camelCase',
    nullIfMissing: true,
    pluralizeType: false,
  },
  default: DEFAULT_OPTIONS,
  frontend: DEFAULT_OPTIONS,
};

function getDefaultOptions(mode: SerializerMode): ISerializerOptions {
  return MODE_OPTIONS[mode];
}

export function getSerializer(
  data: ISerializerConfig,
  mode: SerializerMode = 'default',
  customOptions?: ISerializerOptions,
): Serializer {
  const defaultOptions = getDefaultOptions(mode);
  const options = { ...defaultOptions, ...customOptions };

  const serializerOptions: SerializerRuntimeOptions = {
    ...data,
    id: options.id ?? 'id',
    keyForAttribute: options.keyForAttribute ?? 'camelCase',
    nullIfMissing: options.nullIfMissing ?? true,
    pluralizeType: options.pluralizeType ?? false,
  };

  const serializer: Serializer = new Serializer(data.type, serializerOptions);
  const originalSerialize = serializer.serialize.bind(serializer);

  const serializerWithPayload = serializer as unknown as SerializerResettable;
  serializerWithPayload.serialize = (payload: unknown) => {
    serializerWithPayload.payload = {};
    return originalSerialize(payload);
  };

  return serializer;
}
