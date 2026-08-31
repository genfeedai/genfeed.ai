import type {
  ActionJsonSchema,
  GenfeedActionDefinition,
} from '@genfeedai/actions';
import type {
  VisualHandleDefinition,
  VisualNodeDefinition,
} from '@genfeedai/types';

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
    lowerField.includes('frame')
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
  return 'text';
}

function schemaToHandles(
  schema: ActionJsonSchema | undefined,
  direction: 'input' | 'output',
): VisualHandleDefinition[] {
  const { properties, required } = readActionObjectSchema(schema);
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return direction === 'output'
      ? [{ id: 'output', label: 'Output', type: 'text' }]
      : [];
  }

  return entries.map(([field, property]) => ({
    id: field,
    label: formatFieldLabel(field, property.title),
    multiple: unwrapActionSchemaProperty(property).type === 'array',
    optional: direction === 'input' && !required.has(field),
    required: direction === 'input' && required.has(field),
    type: resolveHandleType(field, property),
  }));
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
