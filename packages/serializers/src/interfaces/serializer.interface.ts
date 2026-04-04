import type {
  ISerializerConfig,
  ISerializerRelationship,
  JsonApiDocument,
} from '@genfeedai/helpers';

export interface ISerializer<TInput = unknown> {
  serialize: (data: TInput) => JsonApiDocument;
}

export interface IDeserializer<TOutput = unknown> {
  deserialize: (document: JsonApiDocument) => TOutput;
}

export type { ISerializerConfig, ISerializerRelationship };
