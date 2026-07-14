import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_AGENT_CONTROL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Cancel a running or pending agent run',
    name: 'cancel_agent_run',
    parameters: {
      properties: {
        runId: {
          description: 'The agent run ID to cancel',
          type: 'string',
        },
      },
      required: ['runId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Start a new agent conversation',
    name: 'create_chat',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Inspect a single agent run',
    name: 'get_agent_run',
    parameters: {
      properties: {
        runId: {
          description: 'The agent run ID to inspect',
          type: 'string',
        },
      },
      required: ['runId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Inspect content produced by an agent run',
    name: 'get_agent_run_content',
    parameters: {
      properties: {
        runId: {
          description:
            'The agent run ID whose produced content should be returned',
          type: 'string',
        },
      },
      required: ['runId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'List recent or active agent runs',
    name: 'list_agent_runs',
    parameters: {
      properties: {
        active: {
          description: 'When true, return only pending or running agent runs',
          type: 'boolean',
        },
        cursor: {
          description: 'Optional pagination cursor from the previous page',
          type: 'string',
        },
        historyOnly: {
          description: 'When true, exclude pending and running agent runs',
          type: 'boolean',
        },
        limit: {
          description: 'Maximum number of runs to return',
          type: 'number',
        },
        q: {
          description: 'Search label, objective, and routing metadata',
          type: 'string',
        },
        status: {
          description:
            'Optional status filter such as PENDING, RUNNING, COMPLETED, FAILED, or CANCELLED',
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Retry an agent run by sending a follow-up message on its persisted thread',
    name: 'retry_agent_run',
    parameters: {
      properties: {
        message: {
          description:
            'Optional retry instruction. Defaults to continuing the prior run context.',
          type: 'string',
        },
        runId: {
          description: 'The agent run ID to retry from',
          type: 'string',
        },
      },
      required: ['runId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description: 'Send a message in an existing agent conversation',
    name: 'send_chat_message',
    parameters: {
      properties: {
        message: {
          description: 'Message to send',
          type: 'string',
        },
        threadId: {
          description: 'The thread ID',
          type: 'string',
        },
      },
      required: ['threadId', 'message'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
