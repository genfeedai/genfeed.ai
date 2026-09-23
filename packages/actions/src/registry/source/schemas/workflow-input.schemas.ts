import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  JSON_OBJECT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from '../../contracts/schema-builders';

export const WORKFLOW_NODE_SCHEMA = closedObjectSchema(
  {
    data: JSON_OBJECT_SCHEMA,
    id: STRING_SCHEMA,
    position: closedObjectSchema({ x: NUMBER_SCHEMA, y: NUMBER_SCHEMA }, [
      'x',
      'y',
    ]),
    type: STRING_SCHEMA,
  },
  ['id', 'type', 'position', 'data'],
);

export const WORKFLOW_EDGE_SCHEMA = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    source: STRING_SCHEMA,
    sourceHandle: { type: ['string', 'null'] },
    target: STRING_SCHEMA,
    targetHandle: { type: ['string', 'null'] },
  },
  ['id', 'source', 'target'],
);

export const WORKFLOW_INPUT_VARIABLE_SCHEMA = closedObjectSchema(
  {
    defaultValue: JSON_DOCUMENT_SCHEMA,
    description: STRING_SCHEMA,
    key: STRING_SCHEMA,
    label: STRING_SCHEMA,
    required: BOOLEAN_SCHEMA,
    type: enumSchema([
      'image',
      'video',
      'audio',
      'text',
      'number',
      'select',
      'asset',
      'boolean',
    ]),
    validation: closedObjectSchema({
      max: NUMBER_SCHEMA,
      min: NUMBER_SCHEMA,
      options: arraySchema(STRING_SCHEMA),
      pattern: STRING_SCHEMA,
    }),
  },
  ['key', 'type', 'label'],
);
