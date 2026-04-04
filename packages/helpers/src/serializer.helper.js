"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntityAttributes = createEntityAttributes;
exports.getSerializer = getSerializer;
const ts_jsonapi_1 = require("ts-jsonapi");
function createEntityAttributes(customAttributes) {
    return [
        ...new Set([...customAttributes, 'createdAt', 'updatedAt', 'isDeleted']),
    ];
}
const PASSTHROUGH_KEY = (attribute) => attribute;
const DEFAULT_OPTIONS = {
    id: 'id',
    keyForAttribute: PASSTHROUGH_KEY,
    nullIfMissing: true,
    pluralizeType: false,
};
const MODE_OPTIONS = {
    api: {
        id: '_id',
        keyForAttribute: 'camelCase',
        nullIfMissing: true,
        pluralizeType: false,
    },
    default: DEFAULT_OPTIONS,
    frontend: DEFAULT_OPTIONS,
};
function getDefaultOptions(mode) {
    return MODE_OPTIONS[mode];
}
function getSerializer(data, mode = 'default', customOptions) {
    const defaultOptions = getDefaultOptions(mode);
    const options = { ...defaultOptions, ...customOptions };
    const serializerOptions = {
        ...data,
        id: options.id ?? 'id',
        keyForAttribute: options.keyForAttribute ?? 'camelCase',
        nullIfMissing: options.nullIfMissing ?? true,
        pluralizeType: options.pluralizeType ?? false,
    };
    const serializer = new ts_jsonapi_1.Serializer(data.type, serializerOptions);
    const originalSerialize = serializer.serialize.bind(serializer);
    const serializerWithPayload = serializer;
    serializerWithPayload.serialize = (payload) => {
        serializerWithPayload.payload = {};
        return originalSerialize(payload);
    };
    return serializer;
}
//# sourceMappingURL=serializer.helper.js.map