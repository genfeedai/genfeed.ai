import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_OTHER_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get detailed usage statistics including content created, credits used, and account activity',
    name: 'get_usage_stats',
    parameters: {
      properties: {
        timeRange: {
          default: '30d',
          description: 'Time range for stats',
          enum: ['today', '7d', '30d', '90d', 'all'],
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
      'Check the status of a content generation job. Auto-detects content type.',
    name: 'get_job_status',
    parameters: {
      properties: {
        jobId: {
          description: 'The job/ingredient ID to check',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Check whether a LinkedIn account is connected for the current user. Returns connection status, handle, and avatar if connected.',
    name: 'get_linkedin_connection_status',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
];
