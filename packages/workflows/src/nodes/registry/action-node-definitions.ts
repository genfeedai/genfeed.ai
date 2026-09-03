import {
  type ActionWorkflowCategory,
  ALL_ACTIONS,
  type GenfeedActionDefinition,
} from '@genfeedai/actions';
import { generateHandlesFromSchema } from '../../ui/lib/schemaHandles';
import { DEFAULT_GENFEED_ACTION_DATA } from '../definitions';
import type { ExtendedNodeCategory, SaaSHandleType } from '../types';
import type { CatalogNodeDefinition } from './catalog-node-definition';

const WORKFLOW_CATEGORY_TO_NODE_CATEGORY: Record<
  ActionWorkflowCategory,
  ExtendedNodeCategory
> = {
  ai: 'ai',
  composition: 'composition',
  input: 'input',
  output: 'output',
  processing: 'processing',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObjectSchema(schema: object | undefined): {
  properties: Record<string, unknown>;
  required: Set<string>;
} {
  if (!isRecord(schema)) {
    return { properties: {}, required: new Set() };
  }
  const alternatives = [
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
  ];
  if (alternatives.length > 0) {
    const firstObject = alternatives.find(
      (candidate) =>
        isRecord(candidate) &&
        (isRecord(candidate.properties) ||
          Array.isArray(candidate.oneOf) ||
          Array.isArray(candidate.anyOf)),
    );
    return readObjectSchema(firstObject);
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [],
  );
  return { properties, required };
}

function handleTypeForField(fieldName: string, prop: unknown): SaaSHandleType {
  const lower = fieldName.toLowerCase();
  if (fieldName === 'brand' || fieldName === 'brandId') {
    return 'brand';
  }
  if (
    lower.includes('image') ||
    lower.endsWith('photo') ||
    fieldName === 'references'
  ) {
    return 'image';
  }
  if (lower.includes('video')) {
    return 'video';
  }
  if (lower.includes('audio') || lower.includes('sound')) {
    return 'audio';
  }
  const schemaType = isRecord(prop) ? prop.type : undefined;
  if (schemaType === 'number' || schemaType === 'integer') {
    return 'number';
  }
  if (schemaType === 'object' || schemaType === 'array') {
    return 'object';
  }
  return 'text';
}

function labelForField(fieldName: string, prop: unknown): string {
  if (isRecord(prop) && typeof prop.title === 'string' && prop.title.trim()) {
    return prop.title;
  }
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function handlesFromSchema(
  schema: object | undefined,
): CatalogNodeDefinition['inputs'] {
  const { properties, required } = readObjectSchema(schema);
  const named = generateHandlesFromSchema(
    isRecord(schema) ? schema : undefined,
    [],
  );
  const seen = new Set(named.map((handle) => handle.id));
  const extras: CatalogNodeDefinition['inputs'] = [];

  for (const [fieldName, prop] of Object.entries(properties)) {
    if (seen.has(fieldName)) {
      continue;
    }
    extras.push({
      id: fieldName,
      label: labelForField(fieldName, prop),
      multiple: isRecord(prop) && prop.type === 'array',
      required: required.has(fieldName),
      type: handleTypeForField(fieldName, prop),
    });
  }

  return [
    ...named.map((handle) => ({
      id: handle.id,
      label: handle.label,
      multiple: handle.multiple,
      required: handle.required,
      type: handle.type as SaaSHandleType,
    })),
    ...extras,
  ];
}

function categoryForAction(
  action: GenfeedActionDefinition,
): ExtendedNodeCategory {
  if (!action.workflowCategory) {
    return 'saas';
  }
  return WORKFLOW_CATEGORY_TO_NODE_CATEGORY[action.workflowCategory];
}

export function buildActionNodeDefinitions(
  actions: readonly GenfeedActionDefinition[] = ALL_ACTIONS,
): Record<string, CatalogNodeDefinition> {
  const definitions: Record<string, CatalogNodeDefinition> = {};

  for (const action of actions) {
    if (action.visibility !== 'workflow') {
      continue;
    }

    definitions[action.id] = {
      category: categoryForAction(action),
      defaultData: {
        ...DEFAULT_GENFEED_ACTION_DATA,
        actionId: action.id,
        label: action.label,
      },
      description: action.description,
      icon: action.workflowIcon ?? 'Workflow',
      inputs: handlesFromSchema(action.inputSchema),
      label: action.label,
      outputs: handlesFromSchema(action.outputSchema),
      type: action.id,
    };
  }

  return definitions;
}

export const ACTION_NODE_DEFINITIONS = buildActionNodeDefinitions();
