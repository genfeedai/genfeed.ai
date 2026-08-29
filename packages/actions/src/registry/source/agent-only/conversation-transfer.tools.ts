import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_CONVERSATION_TRANSFER_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'List safe summaries of active conversations owned by the initiating user and organization. Use this before proposing a cross-conversation handoff.',
    name: 'list_agent_conversations',
    parameters: {
      properties: {
        query: { description: 'Optional title search.', type: 'string' },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Transfer bounded context to an authorized conversation. SEND only records and delivers the handoff. SEND_AND_RUN always returns a confirmation card and cannot execute until the user confirms it.',
    name: 'transfer_agent_conversation',
    parameters: {
      properties: {
        artifactReferences: {
          description: 'Canonical references selected for the handoff.',
          items: { type: 'object' },
          maxItems: 20,
          type: 'array',
        },
        content: { maxLength: 12000, type: 'string' },
        deliveryMode: { enum: ['SEND', 'SEND_AND_RUN'], type: 'string' },
        destinationBrandId: { type: 'string' },
        destinationThreadId: { type: 'string' },
        destinationTitle: {
          description: 'Title when creating a new destination conversation.',
          maxLength: 120,
          type: 'string',
        },
        idempotencyKey: {
          description: 'Stable key reused for retries of this same handoff.',
          maxLength: 200,
          type: 'string',
        },
        selectedContext: { type: 'object' },
      },
      required: ['content', 'deliveryMode', 'idempotencyKey'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
