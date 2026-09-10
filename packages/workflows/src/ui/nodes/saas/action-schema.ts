import type {
  ActionJsonSchema,
  GenfeedActionDefinition,
} from '@genfeedai/actions';
import type {
  VisualHandleDefinition,
  VisualNodeDefinition,
} from '@genfeedai/contracts/types';

export interface ActionSchemaProperty {
  anyOf?: ActionSchemaProperty[];
  default?: unknown;
  description?: string;
  enum?: unknown[];
  items?: ActionSchemaProperty;
  properties?: Record<string, ActionSchemaProperty>;
  title?: string;
  type?: string;
}

export interface ActionObjectSchema {
  properties: Record<string, ActionSchemaProperty>;
  required: ReadonlySet<string>;
}

const MEDIA_FIELD_PATTERN = /(audio|image|media|music|photo|sound|video)/i;

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatFieldLabel(field: string, title?: string): string {
  if (title) return title;
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function unwrapActionSchemaProperty(
  property: ActionSchemaProperty,
): ActionSchemaProperty {
  if (!property.anyOf) return property;
  return (
    property.anyOf.find((candidate) => candidate.type !== 'null') ?? property
  );
}

export function readActionObjectSchema(
  schema: ActionJsonSchema | undefined,
): ActionObjectSchema {
  if (!isSchemaRecord(schema)) {
    return { properties: {}, required: new Set() };
  }

  const alternatives = [
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
  ];
  if (alternatives.length > 0) {
    const firstObject = alternatives.find(
      (candidate) =>
        isSchemaRecord(candidate) &&
        (isSchemaRecord(candidate.properties) ||
          Array.isArray(candidate.oneOf) ||
          Array.isArray(candidate.anyOf)),
    );
    if (isSchemaRecord(firstObject)) {
      return readActionObjectSchema(firstObject as ActionJsonSchema);
    }
  }

  const properties = isSchemaRecord(schema.properties)
    ? (schema.properties as Record<string, ActionSchemaProperty>)
    : {};
  const required = Array.isArray(schema.required)
    ? new Set(
        schema.required.filter(
          (field): field is string => typeof field === 'string',
        ),
      )
    : new Set<string>();

  return { properties, required };
}

const MEDIA_HANDLE_TYPES = new Set(['audio', 'image', 'video']);
const CONFIG_HANDLE_SKIP = new Set([
  'agentStrategyId',
  'brandId',
  'credentialId',
  'credentialIds',
  'minScore',
  'organizationId',
  'timezone',
  'topics',
]);

const PIPELINE_FIELDS = new Set([
  'avoid',
  'brand',
  'brandVoice',
  'content',
  'fullText',
  'hooks',
  'input',
  'item',
  'items',
  'media',
  'negativePrompt',
  'negative_prompt',
  'output',
  'outputText',
  'productContext',
  'prompt',
  'resolvedPrompt',
  'script',
  'state',
  'text',
  'title',
  'topic',
]);

function resolveHandleType(
  field: string,
  property: ActionSchemaProperty,
): string {
  const resolved = unwrapActionSchemaProperty(property);
  const lowerField = field.toLowerCase();

  if (lowerField.includes('audio') || lowerField.includes('music')) {
    return 'audio';
  }
  if (lowerField.includes('video')) return 'video';
  if (
    lowerField.includes('image') ||
    lowerField.includes('photo') ||
    lowerField.includes('frame') ||
    lowerField === 'references'
  ) {
    return 'image';
  }
  if (resolved.type === 'number' || resolved.type === 'integer') {
    return 'number';
  }
  if (resolved.type === 'array' && MEDIA_FIELD_PATTERN.test(field)) {
    return lowerField.includes('video')
      ? 'video'
      : lowerField.includes('audio') || lowerField.includes('music')
        ? 'audio'
        : 'image';
  }
  if (resolved.type === 'object' || resolved.type === 'array') {
    return 'object';
  }
  return 'text';
}

function toHandle(
  field: string,
  property: ActionSchemaProperty,
  direction: 'input' | 'output',
  required: ReadonlySet<string>,
): VisualHandleDefinition {
  return {
    id: field,
    label: formatFieldLabel(field, property.title),
    multiple: unwrapActionSchemaProperty(property).type === 'array',
    optional: direction === 'input' && !required.has(field),
    required: direction === 'input' && required.has(field),
    type: resolveHandleType(field, property),
  };
}

function wholeObjectHandle(
  properties: Record<string, ActionSchemaProperty>,
): VisualHandleDefinition {
  return {
    id: Object.hasOwn(properties, 'output') ? 'result' : 'output',
    label: 'Output',
    multiple: false,
    optional: false,
    required: false,
    type: 'object',
  };
}

function schemaToHandles(
  schema: ActionJsonSchema | undefined,
  direction: 'input' | 'output',
): VisualHandleDefinition[] {
  const { properties, required } = readActionObjectSchema(schema);
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return direction === 'output'
      ? [
          {
            id: 'output',
            label: 'Output',
            multiple: false,
            optional: false,
            required: false,
            type: 'text',
          },
        ]
      : [];
  }

  const handles = entries
    .filter(([field]) => !CONFIG_HANDLE_SKIP.has(field))
    .map(([field, property]) => toHandle(field, property, direction, required));

  if (direction === 'input') {
    const preferred = handles.filter(
      (handle) =>
        MEDIA_HANDLE_TYPES.has(handle.type) ||
        PIPELINE_FIELDS.has(handle.id) ||
        handle.type === 'brand',
    );
    if (preferred.length > 0) {
      return preferred;
    }

    const requiredConnectable = handles.filter(
      (handle) => handle.required && handle.type !== 'number',
    );
    if (requiredConnectable.length <= 2) {
      return requiredConnectable;
    }

    return requiredConnectable.slice(0, 1);
  }

  const media = handles.filter((handle) => MEDIA_HANDLE_TYPES.has(handle.type));
  if (media.length > 0) {
    return media;
  }

  const pipeline = handles.filter((handle) => PIPELINE_FIELDS.has(handle.id));
  if (pipeline.length === 1) {
    return pipeline;
  }
  if (pipeline.length > 1) {
    return [wholeObjectHandle(properties)];
  }

  if (
    handles.length <= 2 &&
    handles.every((handle) => handle.type !== 'number')
  ) {
    return handles;
  }

  const identity = handles.find((handle) => handle.id === 'id');
  if (identity) {
    return [identity];
  }

  return [wholeObjectHandle(properties)];
}

export function actionSchemaHandles(
  schema: ActionJsonSchema | undefined,
  direction: 'input' | 'output',
): VisualHandleDefinition[] {
  return schemaToHandles(schema, direction);
}

export function createActionVisualDefinition(
  action: GenfeedActionDefinition,
): VisualNodeDefinition {
  return {
    category: action.workflowCategory ?? 'processing',
    icon: action.workflowIcon ?? 'Workflow',
    inputs: schemaToHandles(action.inputSchema, 'input'),
    label: action.label,
    outputs: schemaToHandles(action.outputSchema, 'output'),
  };
}

export function formatActionFieldLabel(field: string, title?: string): string {
  return formatFieldLabel(field, title);
}

const ON_NODE_SKIP = new Set([
  'agentStrategyId',
  'brand',
  'brandId',
  'credentialId',
  'credentialIds',
  'input',
  'item',
  'items',
  'organizationId',
  'output',
  'request',
  'state',
]);

const ON_NODE_PRIORITY = [
  'prompt',
  'query',
  'text',
  'content',
  'topic',
  'topics',
  'username',
  'platform',
  'model',
  'mode',
];

export const ON_NODE_FIELD_LIMIT = 4;

function isOnNodeField(field: string, property: ActionSchemaProperty): boolean {
  if (ON_NODE_SKIP.has(field) || MEDIA_FIELD_PATTERN.test(field)) {
    return false;
  }
  const resolved = unwrapActionSchemaProperty(property);
  if (resolved.type === 'object') {
    return false;
  }
  if (resolved.type === 'array') {
    return unwrapActionSchemaProperty(resolved.items ?? {}).type === 'string';
  }
  return true;
}

/**
 * Compact subset of action inputs to render on the node body so operators
 * can edit without opening the inspector.
 */
export function selectOnNodeProperties(
  schema: ActionJsonSchema | undefined,
): Record<string, ActionSchemaProperty> {
  const { properties } = readActionObjectSchema(schema);
  const ranked = Object.entries(properties)
    .filter(([field, property]) => isOnNodeField(field, property))
    .sort(([left], [right]) => {
      const leftRank = ON_NODE_PRIORITY.indexOf(left);
      const rightRank = ON_NODE_PRIORITY.indexOf(right);
      return (
        (leftRank === -1 ? ON_NODE_PRIORITY.length : leftRank) -
        (rightRank === -1 ? ON_NODE_PRIORITY.length : rightRank)
      );
    });
  return Object.fromEntries(ranked.slice(0, ON_NODE_FIELD_LIMIT));
}
