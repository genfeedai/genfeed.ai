import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  closedObjectSchema,
  JSON_OBJECT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const id = { type: 'string', minLength: 1, maxLength: 128 } as const;
const number = { type: 'integer', minimum: 1 } as const;
const credits = { type: 'number', minimum: 0 } as const;
const source = { type: 'string', minLength: 1, maxLength: 262144 } as const;
const prompt = { type: 'string', minLength: 1, maxLength: 8192 } as const;
const settings = closedObjectSchema(
  {
    width: { type: 'integer', minimum: 256, maximum: 1920, multipleOf: 2 },
    height: { type: 'integer', minimum: 256, maximum: 1920, multipleOf: 2 },
    fps: { type: 'integer', enum: [24, 30] },
    durationFrames: { type: 'integer', minimum: 1, maximum: 900 },
  },
  ['width', 'height', 'fps', 'durationFrames'],
);
const outputs = {
  type: 'array',
  minItems: 1,
  maxItems: 8,
  uniqueItems: true,
  items: closedObjectSchema(
    {
      format: { type: 'string', enum: ['mp4', 'png', 'jpeg'] },
      frame: { type: 'integer', minimum: 0, maximum: 899 },
    },
    ['format'],
  ),
} as const;
const create = {
  brandId: id,
  requestId: id,
  label: { type: 'string', minLength: 1, maxLength: 120 },
  prompt,
  sourceCode: source,
  modelKey: id,
  settings,
  props: JSON_OBJECT_SCHEMA,
  sourceAssetIds: { type: 'array', maxItems: 12, uniqueItems: true, items: id },
  outputs,
} satisfies Record<string, ActionJsonSchema>;
const revise = {
  requestId: id,
  expectedRevision: number,
  prompt,
  sourceCode: source,
  props: JSON_OBJECT_SCHEMA,
};
const retry = { requestId: id, expectedRevision: number, revision: number };
const exportInput = { ...retry, outputs };
const quoteInputs = [
  closedObjectSchema(
    {
      operation: { const: 'create' },
      input: closedObjectSchema(create, [
        'brandId',
        'requestId',
        'label',
        'settings',
      ]),
    },
    ['operation', 'input'],
  ),
  ...Object.entries({ revise, export: exportInput, retry }).map(
    ([operation, properties]) =>
      closedObjectSchema(
        {
          operation: { const: operation },
          projectId: id,
          input: closedObjectSchema(properties, [
            'requestId',
            'expectedRevision',
            ...(operation === 'revise' ? [] : ['revision']),
          ]),
        },
        ['operation', 'projectId', 'input'],
      ),
  ),
];
const quote = closedObjectSchema(
  {
    unit: { const: 'credits' },
    modelKey: STRING_SCHEMA,
    isByok: { type: 'boolean' },
    authoringCredits: credits,
    inspectionCredits: credits,
    renderCredits: credits,
    maximumCredits: credits,
    maximumAuthoringCalls: credits,
    maximumInspectionCalls: credits,
    maximumRepairs: credits,
    maximumRenderJobs: credits,
    renderDeadlineSeconds: credits,
    rendererVersion: STRING_SCHEMA,
    creditsPerSecond: credits,
    settings,
    outputRequests: outputs,
  },
  [
    'unit',
    'modelKey',
    'isByok',
    'maximumCredits',
    'settings',
    'outputRequests',
  ],
);
const nullableString = { anyOf: [STRING_SCHEMA, { type: 'null' }] } as const;
const media = closedObjectSchema(
  {
    url: STRING_SCHEMA,
    format: { enum: ['mp4', 'png', 'jpeg'], type: 'string' },
    width: number,
    height: number,
    frame: { type: 'integer', minimum: 0 },
    ingredientId: STRING_SCHEMA,
  },
  ['url', 'format', 'width', 'height'],
);
const quoteSnapshot = {
  ...quote,
  properties: {
    ...(quote as { properties: Record<string, ActionJsonSchema> }).properties,
    provider: STRING_SCHEMA,
    inputCostPerMillion: credits,
    outputCostPerMillion: credits,
  },
};
const receipt = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    kind: {
      type: 'string',
      enum: [
        'quote',
        'settlement',
        'admission',
        'authoring',
        'inspection',
        'repair',
        'render',
      ],
    },
    state: { type: 'string', enum: ['started', 'confirmed', 'indeterminate'] },
    boundCredits: credits,
    isResultApplied: { type: 'boolean' },
    isAccepted: { type: 'boolean' },
    credits,
    operatorCredits: credits,
    modelKey: STRING_SCHEMA,
    sourceHash: STRING_SCHEMA,
    providerCost: credits,
    isByok: { type: 'boolean' },
    computeSeconds: credits,
    quote: quoteSnapshot,
  },
  [
    'id',
    'kind',
    'state',
    'credits',
    'operatorCredits',
    'boundCredits',
    'isResultApplied',
  ],
);
const revision = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    revisionId: STRING_SCHEMA,
    projectId: STRING_SCHEMA,
    number,
    requestId: STRING_SCHEMA,
    status: {
      type: 'string',
      enum: [
        'queued',
        'authoring',
        'checking',
        'rendering',
        'completed',
        'failed',
        'cancelled',
      ],
    },
    progress: credits,
    modelKey: nullableString,
    rendererVersion: STRING_SCHEMA,
    sourceHash: nullableString,
    prompt: nullableString,
    hasSource: { type: 'boolean' },
    settings,
    props: JSON_OBJECT_SCHEMA,
    sourceAssetIds: { type: 'array', items: STRING_SCHEMA },
    maximumCredits: credits,
    consumedCredits: credits,
    receipts: { type: 'array', items: receipt },
    outputRequests: outputs,
    previews: { type: 'array', items: media },
    outputs: { type: 'array', items: media },
    diagnostics: { type: 'array', items: STRING_SCHEMA },
  },
  [
    'id',
    'number',
    'status',
    'hasSource',
    'receipts',
    'outputRequests',
    'previews',
    'outputs',
    'diagnostics',
  ],
);
const project = closedObjectSchema(
  {
    id: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    brandId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
    label: STRING_SCHEMA,
    currentRevision: number,
    revisions: { type: 'array', items: revision },
    nextRevisionCursor: { anyOf: [number, { type: 'null' }] },
    isDeleted: { type: 'boolean' },
    createdAt: STRING_SCHEMA,
    updatedAt: STRING_SCHEMA,
  },
  ['id', 'brandId', 'currentRevision', 'revisions', 'nextRevisionCursor'],
);
const catalogModel = closedObjectSchema(
  {
    key: STRING_SCHEMA,
    label: STRING_SCHEMA,
    provider: STRING_SCHEMA,
    isDefault: { type: 'boolean' },
    isByok: { type: 'boolean' },
    isAvailable: { type: 'boolean' },
    unavailableReason: nullableString,
    inspectionCapability: { type: 'string', enum: ['declared', 'unknown'] },
    inputCostPerMillion: { anyOf: [credits, { type: 'null' }] },
    outputCostPerMillion: { anyOf: [credits, { type: 'null' }] },
  },
  [
    'key',
    'label',
    'provider',
    'isDefault',
    'isByok',
    'isAvailable',
    'unavailableReason',
    'inspectionCapability',
    'inputCostPerMillion',
    'outputCostPerMillion',
  ],
);
const limits = closedObjectSchema(
  Object.fromEntries(
    [
      'maxSourceBytes',
      'maxPromptBytes',
      'maxPropsBytes',
      'maxAssets',
      'maxOutputs',
      'maxWidth',
      'maxHeight',
      'maxPixels',
      'maxDurationFrames',
      'maxDurationSeconds',
      'maxRepairs',
      'renderDeadlineSeconds',
    ].map((key) => [key, credits]),
  ),
);
const catalog = closedObjectSchema(
  {
    isAvailable: { type: 'boolean' },
    unavailableReason: nullableString,
    rendererVersion: STRING_SCHEMA,
    creditsPerSecond: { anyOf: [credits, { type: 'null' }] },
    defaultModelKey: nullableString,
    models: { type: 'array', items: catalogModel },
    limits: {
      ...limits,
      properties: {
        ...(limits as { properties: Record<string, ActionJsonSchema> })
          .properties,
        allowedFps: { type: 'array', items: number },
      },
    },
    outputFormats: { type: 'array', items: STRING_SCHEMA },
    defaultSettings: settings,
  },
  ['isAvailable', 'models', 'limits', 'defaultSettings'],
);
export const VISUAL_CODE_ACTION_ALIASES = {
  get_visual_code_catalog: 'catalog',
  quote_visual_code_generation: 'quote',
  generate_visual_code: 'generate',
  get_visual_code_project: 'status',
  revise_visual_code_project: 'revise',
  export_visual_code_project: 'export',
  cancel_visual_code_project: 'cancel',
  retry_visual_code_project: 'retry',
} as const;
export const VISUAL_CODE_INPUT_SCHEMAS: Record<string, ActionJsonSchema> = {
  catalog: closedObjectSchema({ brandId: id }, ['brandId']),
  quote: {
    ...closedObjectSchema(
      {
        operation: {
          type: 'string',
          enum: ['create', 'revise', 'export', 'retry'],
        },
        projectId: id,
        input: JSON_OBJECT_SCHEMA,
      },
      ['operation', 'input'],
    ),
    oneOf: quoteInputs,
  },
  generate: closedObjectSchema({ ...create, maximumCredits: credits }, [
    'brandId',
    'label',
    'settings',
    'maximumCredits',
  ]),
  status: closedObjectSchema(
    {
      projectId: id,
      beforeRevision: number,
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    ['projectId'],
  ),
  revise: closedObjectSchema(
    { projectId: id, ...revise, maximumCredits: credits },
    ['projectId', 'expectedRevision', 'maximumCredits'],
  ),
  export: closedObjectSchema(
    { projectId: id, ...exportInput, maximumCredits: credits },
    ['projectId', 'revision', 'expectedRevision', 'maximumCredits'],
  ),
  retry: closedObjectSchema(
    { projectId: id, ...retry, maximumCredits: credits },
    ['projectId', 'revision', 'expectedRevision', 'maximumCredits'],
  ),
  cancel: closedObjectSchema({ projectId: id, revision: number }, [
    'projectId',
    'revision',
  ]),
};
export function getVisualCodeActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  if (
    actionId === 'visual-code.execute-internal' ||
    actionId === 'visual-code.fail-internal'
  )
    return {
      inputSchema: closedObjectSchema(
        {
          job: closedObjectSchema(
            { revisionId: id, organizationId: id, brandId: id, userId: id },
            ['revisionId', 'organizationId', 'brandId', 'userId'],
          ),
        },
        ['job'],
      ),
      outputSchema: closedObjectSchema(
        { revisionId: id, status: STRING_SCHEMA },
        ['revisionId', 'status'],
      ),
    };
  if (
    !actionId.startsWith('visual-code.') &&
    !Object.hasOwn(VISUAL_CODE_ACTION_ALIASES, actionId)
  )
    return undefined;
  const operation = actionId.startsWith('visual-code.')
    ? actionId.slice(12)
    : VISUAL_CODE_ACTION_ALIASES[
        actionId as keyof typeof VISUAL_CODE_ACTION_ALIASES
      ];
  if (!Object.hasOwn(VISUAL_CODE_INPUT_SCHEMAS, operation)) return undefined;
  const inputSchema = VISUAL_CODE_INPUT_SCHEMAS[operation];
  if (!inputSchema) return undefined;
  return {
    inputSchema,
    outputSchema:
      operation === 'catalog'
        ? catalog
        : operation === 'quote'
          ? quote
          : project,
  };
}
