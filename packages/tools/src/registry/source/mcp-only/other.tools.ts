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
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
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
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate face fidelity test images (3 configs x N prompts)',
    name: 'generate_face_test',
    parameters: {
      properties: {
        personaHandle: {
          description: 'Persona handle to test',
          type: 'string',
        },
        prompts: {
          description: 'Prompts to test with',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['personaHandle', 'prompts'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate N images for dataset expansion (bootstrap)',
    name: 'generate_bootstrap',
    parameters: {
      properties: {
        count: {
          default: 10,
          description: 'Number of images to generate',
          type: 'number',
        },
        personaHandle: {
          description: 'Persona handle',
          type: 'string',
        },
        prompt: {
          description: 'Generation prompt',
          type: 'string',
        },
      },
      required: ['personaHandle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate PuLID face-consistent images from a LoRA',
    name: 'generate_pulid',
    parameters: {
      properties: {
        count: {
          default: 1,
          description: 'Number of images',
          type: 'number',
        },
        personaHandle: {
          description: 'Persona handle',
          type: 'string',
        },
        prompt: {
          description: 'Generation prompt',
          type: 'string',
        },
      },
      required: ['personaHandle', 'prompt'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Run Florence-2 auto-captioning on a dataset',
    name: 'run_captioning',
    parameters: {
      properties: {
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
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
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
