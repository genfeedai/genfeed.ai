import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_SOCIAL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get current account info including user, organization, scopes, and active brand',
    name: 'get_account_info',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get details of the currently active brand',
    name: 'get_brand',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List connected Meta (Facebook) ad accounts',
    name: 'list_meta_ad_accounts',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
