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
      'List every organization you belong to, which one this connection works inside, and the brands in it. get_account, get_brands and every other tool act only in the active organization. When the connection allows switching, use switch_org to change it; otherwise reconnect and choose another on the consent screen.',
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
      'Switch which organization this connection works inside, by its name, slug or id from list_orgs. Only available when the connection was approved with organization switching on. Your role in the organization is checked on every request.',
    name: 'switch_org',
    parameters: {
      properties: {
        organization: {
          description:
            'The organization to switch to: its name, slug or id from list_orgs.',
          type: 'string',
        },
      },
      required: ['organization'],
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
