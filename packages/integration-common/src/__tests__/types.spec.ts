import {
  IMAGE_MODELS,
  ImageModel,
  REDIS_EVENTS,
  VIDEO_MODELS,
  VideoModel,
} from '@integrations/constants';
import {
  ExecutionResult,
  OrgIntegration,
  UserSettings,
  WorkflowInput,
  WorkflowJson,
  WorkflowSession,
} from '@integrations/types';

describe('Integration Common Types', () => {
  describe('OrgIntegration interface', () => {
    it('should accept valid telegram integration', () => {
      const integration: OrgIntegration = {
        botToken: 'encrypted-token',
        config: {
          allowedUserIds: ['123', '456'],
          defaultWorkflow: 'wf-1',
          webhookMode: false,
        },
        createdAt: new Date('2024-01-01'),
        id: 'int-123',
        orgId: 'org-456',
        platform: 'telegram',
        status: 'active',
        updatedAt: new Date('2024-01-02'),
      };

      expect(integration.platform).toBe('telegram');
      expect(integration.status).toBe('active');
      expect(integration.config.allowedUserIds).toContain('123');
    });

    it('should accept valid slack integration', () => {
      const integration: OrgIntegration = {
        botToken: 'xoxb-slack-token',
        config: {
          webhookMode: true,
        },
        createdAt: new Date(),
        id: 'int-slack-123',
        orgId: 'org-789',
        platform: 'slack',
        status: 'paused',
        updatedAt: new Date(),
      };

      expect(integration.platform).toBe('slack');
      expect(integration.status).toBe('paused');
      expect(integration.config.webhookMode).toBe(true);
    });

    it('should accept valid discord integration', () => {
      const integration: OrgIntegration = {
        botToken: 'discord-bot-token',
        config: {
          defaultWorkflow: 'image-gen-wf',
        },
        createdAt: new Date(),
        id: 'int-discord-123',
        orgId: 'org-999',
        platform: 'discord',
        status: 'error',
        updatedAt: new Date(),
      };

      expect(integration.platform).toBe('discord');
      expect(integration.status).toBe('error');
      expect(integration.config.defaultWorkflow).toBe('image-gen-wf');
    });
  });

  describe('WorkflowInput interface', () => {
    it('should accept text input', () => {
      const input: WorkflowInput = {
        defaultValue: 'A beautiful sunset',
        inputType: 'text',
        label: 'Prompt',
        nodeId: 'node-1',
      };

      expect(input.inputType).toBe('text');
      expect(input.defaultValue).toBe('A beautiful sunset');
    });

    it('should accept image input without default', () => {
      const input: WorkflowInput = {
        inputType: 'image',
        label: 'Reference Image',
        nodeId: 'node-2',
      };

      expect(input.inputType).toBe('image');
      expect(input.defaultValue).toBeUndefined();
    });

    it('should accept all input types', () => {
      const textInput: WorkflowInput = {
        inputType: 'text',
        label: 'Text',
        nodeId: 'text',
      };
      const imageInput: WorkflowInput = {
        inputType: 'image',
        label: 'Image',
        nodeId: 'image',
      };
      const audioInput: WorkflowInput = {
        inputType: 'audio',
        label: 'Audio',
        nodeId: 'audio',
      };
      const videoInput: WorkflowInput = {
        inputType: 'video',
        label: 'Video',
        nodeId: 'video',
      };

      expect(textInput.inputType).toBe('text');
      expect(imageInput.inputType).toBe('image');
      expect(audioInput.inputType).toBe('audio');
      expect(videoInput.inputType).toBe('video');
    });
  });

  describe('WorkflowJson interface', () => {
    it('should accept valid workflow definition', () => {
      const workflow: WorkflowJson = {
        description: 'Generate images from text prompts',
        edges: [
          { source: 'input-1', target: 'model-1' },
          { source: 'model-1', target: 'output-1' },
        ],
        id: 'wf-123',
        name: 'Image Generation',
        nodes: {
          'input-1': { label: 'Prompt', type: 'text-input' },
          'model-1': { model: 'flux-dev', type: 'flux-model' },
          'output-1': { type: 'image-output' },
        },
        version: '1.0.0',
      };

      expect(workflow.id).toBe('wf-123');
      expect(workflow.nodes).toHaveProperty('input-1');
      expect(workflow.edges).toHaveLength(2);
    });
  });

  describe('UserSettings interface', () => {
    it('should accept valid user settings', () => {
      const settings: UserSettings = {
        imageModel: 'flux-dev',
        videoModel: 'luma-dream-machine',
      };

      expect(settings.imageModel).toBe('flux-dev');
      expect(settings.videoModel).toBe('luma-dream-machine');
    });
  });

  describe('WorkflowSession interface', () => {
    it('should accept idle session state', () => {
      const session: WorkflowSession = {
        collectedInputs: new Map(),
        currentInputIndex: 0,
        requiredInputs: [],
        startedAt: Date.now(),
        state: 'idle',
      };

      expect(session.state).toBe('idle');
      expect(session.requiredInputs).toEqual([]);
      expect(session.collectedInputs.size).toBe(0);
    });

    it('should accept running session with workflow', () => {
      const session: WorkflowSession = {
        collectedInputs: new Map([['input-1', 'A sunset']]),
        currentInputIndex: 1,
        orgId: 'org-123',
        requiredInputs: [
          {
            inputType: 'text',
            label: 'Prompt',
            nodeId: 'input-1',
          },
        ],
        startedAt: Date.now(),
        state: 'running',
        statusMessageId: 12345,
        workflow: {
          description: 'Generate images',
          edges: [],
          id: 'wf-456',
          name: 'Image Gen',
          nodes: {},
          version: '1.0',
        },
        workflowId: 'wf-456',
        workflowName: 'Image Gen',
      };

      expect(session.state).toBe('running');
      expect(session.workflowName).toBe('Image Gen');
      expect(session.collectedInputs.get('input-1')).toBe('A sunset');
      expect(session.statusMessageId).toBe(12345);
    });

    it('should accept all session states', () => {
      const states: WorkflowSession['state'][] = [
        'idle',
        'selecting',
        'collecting',
        'confirming',
        'running',
      ];

      for (const state of states) {
        const session: WorkflowSession = {
          collectedInputs: new Map(),
          currentInputIndex: 0,
          requiredInputs: [],
          startedAt: Date.now(),
          state,
        };

        expect(session.state).toBe(state);
      }
    });
  });

  describe('ExecutionResult interface', () => {
    it('should accept successful result with outputs', () => {
      const result: ExecutionResult = {
        durationMs: 5000,
        modelUsed: 'flux-dev',
        outputs: [
          {
            type: 'image',
            url: 'https://example.com/generated-image.png',
          },
          {
            type: 'video',
            url: 'https://example.com/generated-video.mp4',
          },
        ],
        success: true,
      };

      expect(result.success).toBe(true);
      expect(result.outputs).toHaveLength(2);
      expect(result.outputs[0].type).toBe('image');
      expect(result.outputs[1].type).toBe('video');
    });

    it('should accept failed result with error', () => {
      const result: ExecutionResult = {
        durationMs: 1200,
        error: 'Model execution failed',
        outputs: [],
        success: false,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Model execution failed');
      expect(result.outputs).toEqual([]);
    });
  });

  describe('Model constants', () => {
    it('should export valid image models', () => {
      expect(IMAGE_MODELS).toContain('flux-dev');
      expect(IMAGE_MODELS).toContain('flux-schnell');
      expect(IMAGE_MODELS).toContain('flux-pro');
      expect(IMAGE_MODELS).toContain('sdxl');
      expect(IMAGE_MODELS).toContain('midjourney');
    });

    it('should export valid video models', () => {
      expect(VIDEO_MODELS).toContain('luma-dream-machine');
      expect(VIDEO_MODELS).toContain('runway-gen3');
      expect(VIDEO_MODELS).toContain('minimax-video');
      expect(VIDEO_MODELS).toContain('kling-ai');
    });

    it('should allow valid image model types', () => {
      const models: ImageModel[] = [
        'flux-dev',
        'flux-schnell',
        'flux-pro',
        'sdxl',
        'midjourney',
      ];

      expect(models).toHaveLength(5);
      expect(models.every((model) => IMAGE_MODELS.includes(model))).toBe(true);
    });

    it('should allow valid video model types', () => {
      const models: VideoModel[] = [
        'luma-dream-machine',
        'runway-gen3',
        'minimax-video',
        'kling-ai',
      ];

      expect(models).toHaveLength(4);
      expect(models.every((model) => VIDEO_MODELS.includes(model))).toBe(true);
    });
  });

  describe('Redis Events', () => {
    it('should export correct event constants', () => {
      expect(REDIS_EVENTS.INTEGRATION_CREATED).toBe('integration:created');
      expect(REDIS_EVENTS.INTEGRATION_UPDATED).toBe('integration:updated');
      expect(REDIS_EVENTS.INTEGRATION_DELETED).toBe('integration:deleted');
    });
  });
});
