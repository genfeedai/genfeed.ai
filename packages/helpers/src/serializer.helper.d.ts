import { Serializer } from 'ts-jsonapi';
export declare function createEntityAttributes(customAttributes: string[]): string[];
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
type CaseOption = 'dash-case' | 'lisp-case' | 'spinal-case' | 'kebab-case' | 'underscore_case' | 'snake_case' | 'camelCase' | 'CamelCase';
export declare function getSerializer(data: ISerializerConfig, mode?: SerializerMode, customOptions?: ISerializerOptions): Serializer;
export {};
//# sourceMappingURL=serializer.helper.d.ts.map