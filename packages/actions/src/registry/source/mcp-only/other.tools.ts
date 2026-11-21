import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_OTHER_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Check the status and result of any generation (image, video, voice, music) by the job id returned when the generation started. Auto-detects content type.',
    mcpDescription:
      'Read generation status/result by returned job or ingredient ID; auto-detects image/video/voice/music.',
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
      'List every organization you belong to, which one this connection works inside, and the brands in it. A connection limited to one organization acts in it. A connection that allows all organizations lists each organization with its brand ids, and every other tool must then name the organization it acts in (name, slug or id) with its organization argument; a call without one is refused. Reconnect to choose another organization on a limited connection.',
    mcpDescription:
      'List member organizations, active one and brands. With all-organizations consent each org lists its brand ids and every other tool must name its organization; else reconnect to choose.',
    name: 'get_orgs',
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
