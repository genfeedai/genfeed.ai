import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_ADMIN_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get darkroom GPU health: GPU name, VRAM, utilization, temperature, and disk usage',
    name: 'get_darkroom_health',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Control ComfyUI service: start, stop, restart, or check status. Destructive actions require confirm: true.',
    name: 'control_comfyui',
    parameters: {
      properties: {
        action: {
          description: 'Action to perform',
          enum: ['start', 'stop', 'restart', 'status'],
          type: 'string',
        },
        confirm: {
          default: false,
          description:
            'Required for stop/restart actions. Set to true to confirm.',
          type: 'boolean',
        },
      },
      required: ['action'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List LoRA models available on the GPU',
    name: 'list_loras',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List personas available on the darkroom GPU',
    name: 'list_gpu_personas',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Check the status of a darkroom generation job',
    name: 'get_darkroom_job_status',
    parameters: {
      properties: {
        jobId: {
          description: 'Darkroom job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Start LoRA training with configurable steps, rank, and learning rate',
    name: 'start_training',
    parameters: {
      properties: {
        handle: {
          description: 'Persona handle to train',
          type: 'string',
        },
        learningRate: {
          default: 0.0001,
          description: 'Learning rate',
          type: 'number',
        },
        rank: {
          default: 32,
          description: 'LoRA rank',
          type: 'number',
        },
        steps: {
          default: 1000,
          description: 'Number of training steps',
          type: 'number',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get training job progress, current stage, and estimated time',
    name: 'get_training_status',
    parameters: {
      properties: {
        jobId: {
          description: 'Training job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get dataset info including image count, caption count, and file list',
    name: 'get_dataset_info',
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
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Delete a training dataset. Requires confirm: true.',
    name: 'delete_dataset',
    parameters: {
      properties: {
        confirm: {
          default: false,
          description: 'Set to true to confirm deletion',
          type: 'boolean',
        },
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Approve or decline a pending MCP write action that was queued for human review, executing it on approval. Pass the approvalId returned by the original (pending) tool call. Superadmin-only.',
    name: 'resolve_approval',
    parameters: {
      properties: {
        approvalId: {
          description: 'The approval ID returned by the pending tool call',
          type: 'string',
        },
        decision: {
          description:
            'approve to execute the queued action, decline to cancel it',
          enum: ['approve', 'decline'],
          type: 'string',
        },
      },
      required: ['approvalId', 'decision'],
      type: 'object',
    },
    requiredRole: 'superadmin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
