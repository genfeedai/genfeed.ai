import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_WORK_OBJECT_TOOLS: SourceTool[] = [
  {
    name: 'request_input',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Ask a consequential format, source, variant or path choice as cards. Always use this instead of asking in prose. Stop and wait for the answer before spending.',
    parameters: {
      type: 'object',
      required: ['requestId', 'title', 'prompt', 'options'],
      properties: {
        requestId: { type: 'string' },
        title: { type: 'string' },
        prompt: { type: 'string' },
        recommendedOptionId: { type: 'string' },
        options: {
          type: 'array',
          maxItems: 5,
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['id', 'label'],
          },
        },
      },
    },
  },
  {
    name: 'present_work_object',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Persist a script, table or brief in Library and show it inline for editing and review before generation. Reuse objectKey on retries. Generation stays blocked until reviewed or explicitly skipped.',
    parameters: {
      type: 'object',
      required: ['objectKey', 'kind', 'title'],
      properties: {
        objectKey: { type: 'string' },
        kind: { type: 'string', enum: ['table', 'script', 'brief'] },
        title: { type: 'string' },
        body: { type: 'string' },
        columns: {
          type: 'array',
          items: {
            type: 'object',
            properties: { key: { type: 'string' }, label: { type: 'string' } },
            required: ['key', 'label'],
          },
        },
        rows: {
          type: 'array',
          maxItems: 500,
          items: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  },
  {
    name: 'ingest_source_media',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Import a source URL or attach an existing canonical Library image, audio or video to this session. This creates a scoped Library asset with extracted metadata before generation. Failed imports are recoverable; do not generate until source ingest succeeds.',
    parameters: {
      type: 'object',
      properties: {
        ingredientId: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        kind: { type: 'string', enum: ['video', 'image', 'audio'] },
      },
    },
  },
];
