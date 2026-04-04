// @ts-nocheck

import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { GENERATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/generation-templates';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowEngineAdapterService', () => {
  let service: WorkflowEngineAdapterService;
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new WorkflowEngineAdapterService(
      {
        ingredientsEndpoint: 'https://ingredients.example.com',
      } as never,
      loggerService as never,
    );
  });

  describe('convertToExecutableWorkflow', () => {
    it('should convert a workflow document to executable format', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        edges: [
          {
            id: 'e1',
            source: 'n1',
            sourceHandle: 'out',
            target: 'n2',
            targetHandle: 'in',
          },
        ],
        lockedNodeIds: ['n1'],
        nodes: [
          {
            data: { config: { model: 'flux' }, label: 'Image Gen' },
            id: 'n1',
            type: 'imageGen',
          },
          {
            data: { config: { scale: 2 }, label: 'Upscale' },
            id: 'n2',
            type: 'upscale',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.id).toBe('wf-1');
      expect(result.organizationId).toBe('org-1');
      expect(result.userId).toBe('user-1');
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.lockedNodeIds).toEqual(['n1']);
      expect(result.nodes[0].isLocked).toBe(true);
      expect(result.nodes[1].isLocked).toBe(false);
    });

    it('should handle empty nodes and edges', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should extract config from node.data.config', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: { model: 'flux', steps: 20 }, label: 'Gen' },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].config).toEqual({ model: 'flux', steps: 20 });
    });

    it('should fallback to node.config when data.config is missing', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            config: { scale: 2 },
            id: 'n1',
            type: 'upscale',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].config).toEqual({ scale: 2 });
    });

    it('injects the workflow primary brand into avatar and media processing nodes', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        brands: [{ toString: () => 'brand-1' }],
        nodes: [
          {
            data: { config: {}, label: 'Avatar' },
            id: 'n1',
            type: 'ai-avatar-video',
          },
          {
            data: { config: {}, label: 'Captions' },
            id: 'n2',
            type: 'effect-captions',
          },
          {
            data: { config: {}, label: 'Music' },
            id: 'n3',
            type: 'musicSource',
          },
          {
            data: { config: {}, label: 'Overlay' },
            id: 'n4',
            type: 'soundOverlay',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes.map((node) => node.config.brandId)).toEqual([
        'brand-1',
        'brand-1',
        'brand-1',
        'brand-1',
      ]);
    });
  });

  describe('convertStepsToExecutableWorkflow', () => {
    it('should convert steps to nodes with edges from dependsOn', () => {
      const steps = [
        {
          config: { model: 'gpt' },
          id: 'step-1',
          name: 'Generate',
          type: 'generate',
        },
        {
          config: { scale: 2 },
          dependsOn: ['step-1'],
          id: 'step-2',
          name: 'Upscale',
          type: 'upscale',
        },
      ];

      const result = service.convertStepsToExecutableWorkflow(
        'wf-1',
        steps,
        'user-1',
        'org-1',
      );

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('step-1');
      expect(result.edges[0].target).toBe('step-2');
    });

    it('should handle steps without dependencies', () => {
      const steps = [
        { config: {}, id: 'step-1', name: 'Step 1', type: 'generate' },
        { config: {}, id: 'step-2', name: 'Step 2', type: 'publish' },
      ];

      const result = service.convertStepsToExecutableWorkflow(
        'wf-1',
        steps,
        'user-1',
        'org-1',
      );

      expect(result.edges).toHaveLength(0);
    });
  });

  describe('registerExecutor', () => {
    it('should register an executor without errors', () => {
      const executor = vi.fn().mockResolvedValue({});

      expect(() =>
        service.registerExecutor('customType', executor),
      ).not.toThrow();
      expect(loggerService.debug).toHaveBeenCalled();
    });
  });

  describe('estimateCredits', () => {
    it('should return a number', () => {
      const result = service.estimateCredits([
        {
          config: {},
          id: 'n1',
          inputs: [],
          label: 'Test',
          type: 'imageGen',
        },
      ]);

      expect(typeof result).toBe('number');
    });
  });

  describe('executeWorkflow', () => {
    it('should execute workflows with fallback node types', async () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-unsupported' },
        nodes: [
          {
            data: { config: {}, label: 'AI Enhance' },
            id: 'n1',
            type: 'ai-enhance',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const workflow = service.convertToExecutableWorkflow(workflowDoc);
      const result = await service.executeWorkflow(workflow);
      expect(result.status).toBe('completed');
    });

    it('executes image inputs from picker-backed config', async () => {
      const workflow = service.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-image-input' },
        nodes: [
          {
            data: {
              config: {
                itemCategory: 'image',
                itemId: 'img-1',
                resolvedUrl: 'https://cdn.example.com/img-1.png',
                selectedResolvedUrl: 'https://cdn.example.com/img-1.png',
                source: 'library',
              },
              label: 'Image Input',
            },
            id: 'image-input',
            type: 'input-image',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      });

      const result = await service.executeWorkflow(workflow);

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('image-input')?.output).toBe(
        'https://cdn.example.com/img-1.png',
      );
    });

    it('executes video inputs from picker-backed config', async () => {
      const workflow = service.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-video-input' },
        nodes: [
          {
            data: {
              config: {
                itemCategory: 'video',
                itemId: 'vid-1',
                resolvedUrl: 'https://cdn.example.com/vid-1.mp4',
                selectedResolvedUrl: 'https://cdn.example.com/vid-1.mp4',
                source: 'library',
              },
              label: 'Video Input',
            },
            id: 'video-input',
            type: 'input-video',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      });

      const result = await service.executeWorkflow(workflow);

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('video-input')?.output).toBe(
        'https://cdn.example.com/vid-1.mp4',
      );
    });

    it('passes brandId from workflow config into avatar generation', async () => {
      const avatarVideoGenerationService = {
        generateAvatarVideo: vi.fn().mockResolvedValue({
          externalId: 'ext-1',
          ingredientId: 'video-1',
          status: 'processing',
        }),
      };

      const avatarService = new WorkflowEngineAdapterService(
        {
          ingredientsEndpoint: 'https://ingredients.example.com',
        } as never,
        loggerService as never,
        undefined,
        avatarVideoGenerationService as never,
      );

      const workflow = avatarService.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-1' },
        brands: [{ toString: () => 'brand-1' }],
        edges: [],
        nodes: [
          {
            data: {
              config: { aspectRatio: '16:9', useIdentityDefaults: true },
              label: 'Avatar',
            },
            id: 'avatar',
            type: 'ai-avatar-video',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      });

      workflow.lockedNodeIds = ['script'];
      workflow.nodes.unshift({
        cachedOutput: 'hello world',
        config: {},
        id: 'script',
        inputs: [],
        isLocked: true,
        label: 'Script',
        type: 'workflow-input',
      });
      workflow.edges.push({
        id: 'script-avatar',
        source: 'script',
        target: 'avatar',
        targetHandle: 'script',
      });

      await avatarService.executeWorkflow(workflow);

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '16:9',
          text: 'hello world',
        }),
        expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      );
    });

    it('executes captions, music source, and sound overlay nodes without fallback', async () => {
      const brandId = '507f1f77bcf86cd799439011';
      const organizationId = '507f1f77bcf86cd799439012';
      const userId = '507f1f77bcf86cd799439013';
      const avatarId = '507f1f77bcf86cd799439014';
      const musicId = '507f1f77bcf86cd799439015';
      const captionedId = '507f1f77bcf86cd799439016';
      const captionsService = { create: vi.fn().mockResolvedValue({}) };
      const fileQueueService = {
        processVideo: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
        waitForJob: vi.fn().mockResolvedValue({ outputPath: '/tmp/out.mp4' }),
      };
      const filesClientService = {
        uploadToS3: vi.fn().mockResolvedValue({ width: 1920 }),
      };
      const ingredientsService = { patch: vi.fn().mockResolvedValue({}) };
      const metadataService = { patch: vi.fn().mockResolvedValue({}) };
      const musicsService = {
        findOne: vi
          .fn()
          .mockResolvedValue({ _id: { toString: () => musicId } }),
      };
      const sharedService = {
        saveDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: { _id: { toString: () => captionedId } },
          metadataData: { _id: 'meta-1' },
        }),
      };
      const videoMusicOrchestrationService = {
        mergeVideoWithMusic: vi.fn().mockResolvedValue('merged-1'),
      };
      const whisperService = {
        generateCaptions: vi.fn().mockResolvedValue('caption text'),
      };

      const executionService = new WorkflowEngineAdapterService(
        {
          ingredientsEndpoint: 'https://ingredients.example.com',
        } as never,
        loggerService as never,
        undefined,
        undefined,
        captionsService as never,
        fileQueueService as never,
        filesClientService as never,
        ingredientsService as never,
        metadataService as never,
        musicsService as never,
        undefined,
        undefined,
        undefined,
        sharedService as never,
        videoMusicOrchestrationService as never,
        whisperService as never,
      );

      const captionsWorkflow = executionService.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-caption' },
        brands: [{ toString: () => brandId }],
        edges: [
          {
            id: 'avatar-caption',
            source: 'avatar',
            target: 'captions',
            targetHandle: 'video',
          },
        ],
        nodes: [
          {
            cachedOutput: { id: avatarId },
            data: { config: {}, label: 'Avatar' },
            id: 'avatar',
            type: 'ai-avatar-video',
          },
          {
            data: { config: {}, label: 'Captions' },
            id: 'captions',
            type: 'effect-captions',
          },
        ],
        organization: { toString: () => organizationId },
        user: { toString: () => userId },
      });
      captionsWorkflow.lockedNodeIds = ['avatar'];
      captionsWorkflow.nodes[0].isLocked = true;

      const captionsResult =
        await executionService.executeWorkflow(captionsWorkflow);

      expect(captionsResult.status).toBe('completed');
      expect(whisperService.generateCaptions).toHaveBeenCalledWith(avatarId);
      expect(captionsService.create).toHaveBeenCalled();

      const musicWorkflow = executionService.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-music' },
        brands: [{ toString: () => brandId }],
        edges: [],
        nodes: [
          {
            data: { config: {}, label: 'Music' },
            id: 'music',
            type: 'musicSource',
          },
        ],
        organization: { toString: () => organizationId },
        user: { toString: () => userId },
      });

      const musicResult = await executionService.executeWorkflow(musicWorkflow);

      expect(musicResult.status).toBe('completed');
      expect(musicsService.findOne).toHaveBeenCalled();

      const overlayWorkflow = executionService.convertToExecutableWorkflow({
        _id: { toString: () => 'wf-overlay' },
        brands: [{ toString: () => brandId }],
        edges: [
          {
            id: 'caption-overlay',
            source: 'captioned',
            target: 'overlay',
            targetHandle: 'videoUrl',
          },
          {
            id: 'music-overlay',
            source: 'music',
            target: 'overlay',
            targetHandle: 'soundUrl',
          },
        ],
        nodes: [
          {
            cachedOutput: { id: captionedId },
            data: { config: {}, label: 'Captioned' },
            id: 'captioned',
            type: 'effect-captions',
          },
          {
            cachedOutput: { musicIngredientId: musicId },
            data: { config: {}, label: 'Music' },
            id: 'music',
            type: 'musicSource',
          },
          {
            data: { config: { audioVolume: 30 }, label: 'Overlay' },
            id: 'overlay',
            type: 'soundOverlay',
          },
        ],
        organization: { toString: () => organizationId },
        user: { toString: () => userId },
      });
      overlayWorkflow.lockedNodeIds = ['captioned', 'music'];
      overlayWorkflow.nodes[0].isLocked = true;
      overlayWorkflow.nodes[1].isLocked = true;

      const overlayResult =
        await executionService.executeWorkflow(overlayWorkflow);

      expect(overlayResult.status).toBe('completed');
      expect(
        videoMusicOrchestrationService.mergeVideoWithMusic,
      ).toHaveBeenCalledWith(
        captionedId,
        musicId,
        30,
        false,
        expect.objectContaining({
          brandId,
        }),
      );
    });

    it('executes image generation workflows with reference-image prompts', async () => {
      const promptBuilderService = {
        buildPrompt: vi.fn().mockResolvedValue({
          input: {
            image: 'https://example.com/source-room.jpg',
            prompt: 'resolved staging prompt',
            strength: 0.32,
          },
        }),
      };
      const ingredientsService = {
        patch: vi.fn().mockResolvedValue({}),
      };
      const metadataService = {
        patch: vi.fn().mockResolvedValue({}),
      };
      const sharedService = {
        saveDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: {
            _id: { toString: () => 'ingredient-1' },
          },
          metadataData: {
            _id: { toString: () => 'metadata-1' },
          },
        }),
      };
      const replicateService = {
        runModel: vi.fn().mockResolvedValue('prediction-1'),
      };

      const imageWorkflowService = new WorkflowEngineAdapterService(
        {
          ingredientsEndpoint: 'https://ingredients.example.com',
        } as never,
        loggerService as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ingredientsService as never,
        metadataService as never,
        undefined,
        undefined,
        undefined,
        undefined,
        sharedService as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        replicateService as never,
        promptBuilderService as never,
        undefined,
      );

      const template = GENERATION_WORKFLOW_TEMPLATES['virtual-staging-rescue'];

      const workflowDoc = {
        _id: { toString: () => 'wf-real-estate' },
        brands: [{ toString: () => '507f1f77bcf86cd799439011' }],
        edges: template.edges,
        inputVariables: template.inputVariables,
        nodes: template.nodes,
        organization: { toString: () => '507f1f77bcf86cd799439012' },
        user: { toString: () => '507f1f77bcf86cd799439013' },
      };

      const executableWorkflow =
        imageWorkflowService.convertToExecutableWorkflow(workflowDoc);
      const hydratedWorkflow = imageWorkflowService.applyRuntimeInputValues(
        workflowDoc,
        executableWorkflow,
        {
          listingTier: 'premium',
          roomType: 'bedroom',
          sourcePhoto: 'https://example.com/source-room.jpg',
          stylePreset: 'modern warm',
        },
      );

      const result =
        await imageWorkflowService.executeWorkflow(hydratedWorkflow);

      expect(result.status).toBe('completed');
      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        'qwen/qwen-image',
        expect.objectContaining({
          modelCategory: 'image',
          prompt: expect.stringContaining('bedroom'),
          references: ['https://example.com/source-room.jpg'],
          strength: 0.32,
          style: 'sale-ready cleanup with subtle realistic furnishing',
        }),
        undefined,
      );
      expect(replicateService.runModel).toHaveBeenCalledWith(
        'qwen/qwen-image',
        {
          image: 'https://example.com/source-room.jpg',
          prompt: 'resolved staging prompt',
          strength: 0.32,
        },
      );
    });
  });

  describe('node type to executor mapping', () => {
    it('should map brandAsset to brandAsset executor', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: { assetType: 'logo', brandId: 'brand-1' } },
            id: 'n1',
            type: 'brandAsset',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('brandAsset');
    });

    it('should map social-post-reply to postReply executor', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {}, label: 'Post Reply' },
            id: 'n1',
            type: 'social-post-reply',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('postReply');
    });

    it('should map social-send-dm to sendDm executor', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {}, label: 'Send DM' },
            id: 'n1',
            type: 'social-send-dm',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('sendDm');
    });

    it('should map trigger nodes to corresponding executors', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'trigger-mention',
          },
          {
            data: { config: {} },
            id: 'n2',
            type: 'trigger-new-follower',
          },
          {
            data: { config: {} },
            id: 'n3',
            type: 'trigger-new-like',
          },
          {
            data: { config: {} },
            id: 'n4',
            type: 'trigger-new-repost',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('mentionTrigger');
      expect(result.nodes[1].type).toBe('newFollowerTrigger');
      expect(result.nodes[2].type).toBe('newLikeTrigger');
      expect(result.nodes[3].type).toBe('newRepostTrigger');
    });

    it('should map control nodes', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'control-branch',
          },
          {
            data: { config: {} },
            id: 'n2',
            type: 'control-delay',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('condition');
      expect(result.nodes[1].type).toBe('delay');
    });

    it('should map fallback types to dedicated fallback executors', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'ai-enhance',
          },
          {
            data: { config: {} },
            id: 'n2',
            type: 'control-loop',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('ai-enhance');
      expect(result.nodes[1].type).toBe('control-loop');
    });

    it('should map input-video to the dedicated input-video executor', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'input-video',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('input-video');
    });

    it('should pass through unknown types unchanged', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'customType',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].type).toBe('customType');
    });
  });

  describe('node configuration handling', () => {
    it('should handle node.inputs array', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            inputs: ['input1', 'input2'],
            type: 'imageGen',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].inputs).toEqual(['input1', 'input2']);
    });

    it('should handle node.cachedOutput', () => {
      const cachedOutput = { result: 'cached' };
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            cachedOutput,
            data: { config: {} },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].cachedOutput).toEqual(cachedOutput);
    });

    it('should extract label from node.data.label', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {}, label: 'Custom Label' },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].label).toBe('Custom Label');
    });

    it('should fallback to node type when label is missing', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.nodes[0].label).toBe('imageGen');
    });
  });

  describe('brand asset execution', () => {
    it('resolves logo, banner, and references through the brand asset executor', async () => {
      const brandsService = {
        findOne: vi
          .fn()
          .mockResolvedValueOnce({ logo: { _id: 'logo-1' } })
          .mockResolvedValueOnce({ banner: { _id: 'banner-1' } })
          .mockResolvedValueOnce({
            references: [{ _id: 'ref-1' }, { _id: 'ref-2' }],
          }),
      };

      const brandAssetService = new WorkflowEngineAdapterService(
        {
          ingredientsEndpoint: 'https://ingredients.example.com',
        } as never,
        loggerService as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        brandsService as never,
      );

      const runNode = async (assetType: 'logo' | 'banner' | 'references') => {
        const workflow = brandAssetService.convertToExecutableWorkflow({
          _id: { toString: () => `wf-${assetType}` },
          nodes: [
            {
              data: {
                config: { assetType, brandId: '507f1f77bcf86cd799439011' },
                label: 'Brand Asset',
              },
              id: `brand-${assetType}`,
              type: 'brandAsset',
            },
          ],
          organization: { toString: () => '507f1f77bcf86cd799439012' },
          user: { toString: () => '507f1f77bcf86cd799439013' },
        });

        const result = await brandAssetService.executeWorkflow(workflow);
        return result.nodeResults.get(`brand-${assetType}`)?.output;
      };

      await expect(runNode('logo')).resolves.toBe(
        'https://ingredients.example.com/logos/logo-1',
      );
      await expect(runNode('banner')).resolves.toBe(
        'https://ingredients.example.com/banners/banner-1',
      );
      await expect(runNode('references')).resolves.toEqual([
        'https://ingredients.example.com/references/ref-1',
        'https://ingredients.example.com/references/ref-2',
      ]);
    });
  });

  describe('edges handling', () => {
    it('should preserve sourceHandle and targetHandle', () => {
      const workflowDoc = {
        _id: { toString: () => 'wf-1' },
        edges: [
          {
            id: 'e1',
            source: 'n1',
            sourceHandle: 'output-1',
            target: 'n2',
            targetHandle: 'input-2',
          },
        ],
        nodes: [],
        organization: { toString: () => 'org-1' },
        user: { toString: () => 'user-1' },
      };

      const result = service.convertToExecutableWorkflow(workflowDoc);

      expect(result.edges[0]).toEqual({
        id: 'e1',
        source: 'n1',
        sourceHandle: 'output-1',
        target: 'n2',
        targetHandle: 'input-2',
      });
    });
  });

  describe('convertStepsToExecutableWorkflow - multiple dependencies', () => {
    it('should create edges for all dependencies', () => {
      const steps = [
        {
          config: {},
          id: 'step-1',
          name: 'Step 1',
          type: 'generate',
        },
        {
          config: {},
          id: 'step-2',
          name: 'Step 2',
          type: 'transform',
        },
        {
          config: {},
          dependsOn: ['step-1', 'step-2'],
          id: 'step-3',
          name: 'Step 3',
          type: 'merge',
        },
      ];

      const result = service.convertStepsToExecutableWorkflow(
        'wf-1',
        steps,
        'user-1',
        'org-1',
      );

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].source).toBe('step-1');
      expect(result.edges[0].target).toBe('step-3');
      expect(result.edges[1].source).toBe('step-2');
      expect(result.edges[1].target).toBe('step-3');
    });
  });
});
