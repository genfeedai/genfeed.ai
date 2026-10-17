import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_OTHER_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Check the status and result of any generation (image, video, voice, music) by the job id returned when the generation started. Auto-detects content type.',
    name: 'get_job_status',
    parameters: {
      properties: {
        jobId: {
          description: 'The job or ingredient id to check',
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
      'List every organization you belong to and which one this connection works inside. get_account, get_brands and every other tool act only in that organization; to work in another, reconnect and choose it on the consent screen.',
    name: 'list_orgs',
    parameters: {
      properties: {},
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
