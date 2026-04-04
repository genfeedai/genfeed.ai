export interface ISerializer {
  serialize: (data: unknown) => unknown;
}

export interface IDeserializer {
  deserialize: (data: unknown) => unknown;
}

export interface ISerializerConfig {
  type: string;
  attributes: string[];
}
