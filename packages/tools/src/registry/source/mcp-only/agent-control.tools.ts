import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_AGENT_CONTROL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Start a new agent conversation',
    name: 'create_chat',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
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
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
