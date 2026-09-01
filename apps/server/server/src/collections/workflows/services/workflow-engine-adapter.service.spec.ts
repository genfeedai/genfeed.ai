// @ts-nocheck

import { getWorkflowActionIdForNodeType } from '@genfeedai/workflows/nodes';
import { testId } from '@helpers/testing/test-id.helper';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { GENERATION_WORKFLOW_TEMPLATES } from '@server/collections/workflows/templates/generation-templates';
import { isPersistableWorkflowNodeType } from '@server/collections/workflows/workflow-version-definition';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowEngineAdapterService', () => {
  const SOCIAL_ADAPTER_FACTORY_INDEX = 2;
  const SOCIAL_INBOX_SERVICE_INDEX = 38;
  let service: WorkflowEngineAdapterService;
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  /**
   * Asserts a completed run and surfaces the failing node's error message, so a
   * contract or executor regression names itself instead of reporting `failed`.
   */
  function expectCompleted(result: {
    error?: string;
    nodeResults: Map<string, { error?: string }>;
    status: string;
  }) {
    expect(
      result.status,
      Array.from(result.nodeResults.entries())
        .filter(([, nodeResult]) => nodeResult.error)
        .map(([nodeId, nodeResult]) => `${nodeId}: ${nodeResult.error}`)
        .join(' | ') ||
        (result.error ?? ''),
    ).toBe('completed');
  }

  function convertActionGraph(
    adapter: WorkflowEngineAdapterService,
    workflow: Record<string, unknown> & {
      nodes?: Array<Record<string, unknown>>;
    },
  ) {
    return adapter.convertToExecutableWorkflow({
      ...workflow,
      nodes: (workflow.nodes ?? []).map((node) => {
        const nodeType = String(node.type ?? '');
        if (
          nodeType === 'genfeedAction' ||
          isPersistableWorkflowNodeType(nodeType)
        ) {
          return node;
        }

        const actionId = getWorkflowActionIdForNodeType(nodeType);
        if (!actionId) {
          return node;
        }

        const data =
          node.data && typeof node.data === 'object'
            ? (node.data as Record<string, unknown>)
            : {};
        const configuredParameters =
          data.config && typeof data.config === 'object'
            ? (data.config as Record<string, unknown>)
            : {};
        const parameters = Object.fromEntries(
          Object.entries(data).filter(
            ([key]) => !['config', 'label'].includes(key),
          ),
        );

        return {
          ...node,
          data: {
            ...data,
            config: {
              actionId,
              parameters: { ...configuredParameters, ...parameters },
            },
          },
          type: 'genfeedAction',
        };
      }),
    });
  }

  beforeEach(() => {
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new WorkflowEngineAdapterService(
      {
        cdnUrl: 'https://cdn.example.com',
      } as never,
      loggerService as never,
    );
  });

  function createAdapterWithSocialInbox(socialInboxService: {
    postReply?: ReturnType<typeof vi.fn>;
    sendDm?: ReturnType<typeof vi.fn>;
  }): WorkflowEngineAdapterService {
    const args = new Array(42).fill(undefined);
    args[0] = { cdnUrl: 'https://cdn.example.com' };
    args[1] = loggerService;
    args[SOCIAL_INBOX_SERVICE_INDEX] = socialInboxService;
    return new WorkflowEngineAdapterService(...args);
  }

  describe('convertToExecutableWorkflow', () => {
    it('should convert a workflow document to executable format', () => {
      const workflowDoc = {
        id: 'wf-1',
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
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

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
        id: 'wf-1',
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should extract config from node.data.config', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: { model: 'flux', steps: 20 }, label: 'Gen' },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].config).toEqual({
        actionId: 'imageGen',
        parameters: { model: 'flux', steps: 20 },
      });
    });

    it('merges editor prompt fields into executable action parameters', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { label: 'Prompt', prompt: 'Write a FUD News brief' },
            id: 'PyHRz6uB',
            type: 'ai-llm',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0]?.type).toBe('genfeedAction');
      expect(result.nodes[0]?.config).toEqual({
        actionId: 'llm',
        parameters: { prompt: 'Write a FUD News brief' },
      });
    });

    it('injects the workflow primary brand into avatar and media processing nodes', () => {
      const workflowDoc = {
        id: 'wf-1',
        brandId: 'brand-1',
        nodes: [
          {
            data: { config: {}, label: 'Avatar' },
            id: 'n1',
            type: 'aiAvatarVideo',
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
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(
        result.nodes.map((node) => node.config.parameters.brandId),
      ).toEqual(['brand-1', 'brand-1', 'brand-1', 'brand-1']);
    });
  });

  describe('registerExecutor', () => {
    it('should reject executors absent from the shared action catalog', () => {
      const executor = vi.fn().mockResolvedValue({});

      expect(() => service.registerExecutor('customType', executor)).toThrow(
        'Cannot register unknown Genfeed action: customType',
      );
    });
  });

  describe('estimateCredits', () => {
    it('should return a number', () => {
      const result = service.estimateCredits([
        {
          config: { actionId: 'imageGen', parameters: {} },
          id: 'n1',
          inputs: [],
          label: 'Test',
          type: 'genfeedAction',
        },
      ]);

      expect(typeof result).toBe('number');
    });
  });

  describe('executeWorkflow', () => {
    it('refuses to run a catalog action that has no registered executor', async () => {
      // `ai-enhance` is an allowlisted action id with no backing service. The
      // hard cut removed the graceful no-op fallback, so the engine must refuse
      // the graph up front rather than report a node that never ran as done.
      const workflowDoc = {
        id: 'wf-unsupported',
        nodes: [
          {
            data: { config: {}, label: 'AI Enhance' },
            id: 'n1',
            type: 'ai-enhance',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const workflow = convertActionGraph(service, workflowDoc);
      const result = await service.executeWorkflow(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain(
        'No executor registered for Genfeed action: ai-enhance',
      );
    });

    it('routes workflow social replies through the social inbox when a conversation is present', async () => {
      const socialInboxService = {
        postReply: vi.fn().mockResolvedValue({
          externalMessageId: 'reply-message-1',
          id: 'message-1',
          sourceUrl: 'https://www.youtube.com/comment/reply-message-1',
        }),
      };
      const socialAdapter = createAdapterWithSocialInbox(socialInboxService);

      const workflow = convertActionGraph(socialAdapter, {
        id: 'wf-social-reply',
        nodes: [
          {
            data: {
              config: {
                brandId: 'brand-1',
                conversationId: 'conversation-1',
                platform: 'youtube',
                postId: 'comment-1',
                text: 'Thanks for watching',
              },
              label: 'Post Reply',
            },
            id: 'reply-node',
            type: 'postReply',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await socialAdapter.executeWorkflow(workflow, {
        executionId: 'execution-1',
      });

      expect(socialInboxService.postReply).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        'conversation-1',
        expect.objectContaining({
          idempotencyKey: 'workflow:execution-1:reply-node',
          text: 'Thanks for watching',
          workflowRunId: expect.any(String),
        }),
      );
      expectCompleted(result);
      expect(result.nodeResults.get('reply-node')?.output).toMatchObject({
        originalPostId: 'comment-1',
        replyId: 'reply-message-1',
        replyUrl: 'https://www.youtube.com/comment/reply-message-1',
        success: true,
      });
    });

    it('routes workflow social DMs through the social inbox when a conversation is present', async () => {
      const socialInboxService = {
        sendDm: vi.fn().mockResolvedValue({
          externalMessageId: 'dm-message-1',
          id: 'message-1',
        }),
      };
      const socialAdapter = createAdapterWithSocialInbox(socialInboxService);

      const workflow = convertActionGraph(socialAdapter, {
        id: 'wf-social-dm',
        nodes: [
          {
            data: {
              config: {
                brandId: 'brand-1',
                conversationId: 'conversation-1',
                platform: 'instagram',
                recipientId: 'recipient-1',
                text: 'Thanks for reaching out',
              },
              label: 'Send DM',
            },
            id: 'dm-node',
            type: 'sendDm',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await socialAdapter.executeWorkflow(workflow, {
        executionId: 'execution-1',
      });

      expect(socialInboxService.sendDm).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        'conversation-1',
        expect.objectContaining({
          idempotencyKey: 'workflow:execution-1:dm-node',
          recipientId: 'recipient-1',
          text: 'Thanks for reaching out',
          workflowRunId: expect.any(String),
        }),
      );
      expectCompleted(result);
      expect(result.nodeResults.get('dm-node')?.output).toMatchObject({
        messageId: 'dm-message-1',
        platform: 'instagram',
        recipientId: 'recipient-1',
        success: true,
      });
    });

    it('does not fall back to direct platform posting for conversation-backed replies', async () => {
      const replyToPost = vi.fn().mockResolvedValue({
        replyId: 'direct-reply-1',
        replyUrl: 'https://social.example.com/direct-reply-1',
      });
      const args = new Array(41).fill(undefined);
      args[0] = { cdnUrl: 'https://cdn.example.com' };
      args[1] = loggerService;
      args[SOCIAL_ADAPTER_FACTORY_INDEX] = {
        getAdapter: vi.fn().mockReturnValue({ replyToPost }),
        getSupportedPlatforms: vi.fn().mockReturnValue(['instagram']),
      };
      const socialAdapter = new WorkflowEngineAdapterService(...args);

      const workflow = convertActionGraph(socialAdapter, {
        id: 'wf-social-reply-no-inbox',
        nodes: [
          {
            data: {
              config: {
                brandId: 'brand-1',
                conversationId: 'conversation-1',
                platform: 'instagram',
                postId: 'comment-1',
                text: 'Thanks for watching',
              },
              label: 'Post Reply',
            },
            id: 'reply-node',
            type: 'postReply',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await socialAdapter.executeWorkflow(workflow, {
        executionId: 'execution-1',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Social inbox action service is not available');
      expect(replyToPost).not.toHaveBeenCalled();
    });

    it('executes a 1-node prompt workflow from editor node data', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-prompt',
        nodes: [
          {
            data: { label: 'Prompt', template: 'Write a FUD News brief' },
            id: 'PyHRz6uB',
            type: 'ai-prompt-constructor',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.error).toBeUndefined();
      expect(result.nodeResults.get('PyHRz6uB')?.output).toBe(
        'Write a FUD News brief',
      );
    });

    it('keeps a 1-node prompt on the graph after applyRuntimeInputValues', () => {
      const workflowDoc = {
        id: 'wf-prompt',
        nodes: [
          {
            data: { label: 'Prompt', template: 'Write a FUD News brief' },
            id: 'PyHRz6uB',
            type: 'ai-prompt-constructor',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };
      const workflow = convertActionGraph(service, workflowDoc);
      const hydrated = service.applyRuntimeInputValues(
        workflowDoc,
        workflow,
        {},
      );

      expect(hydrated.nodes).toHaveLength(1);
      expect(hydrated.nodes[0]?.id).toBe('PyHRz6uB');
      expect(hydrated.nodes[0]?.config.parameters.template).toBe(
        'Write a FUD News brief',
      );
    });

    it('executes a prompt constructor from data.template', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-prompt-constructor',
        nodes: [
          {
            data: {
              label: 'Constructor',
              template: 'Hello {{topic}}',
              topic: 'FUD News',
            },
            id: 'constructor-1',
            type: 'promptConstructor',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('constructor-1')?.output).toBe(
        'Hello FUD News',
      );
    });

    it('executes image inputs from picker-backed config', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-image-input',
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
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('image-input')?.output).toBe(
        'https://cdn.example.com/img-1.png',
      );
    });

    it('executes video inputs from picker-backed config', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-video-input',
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
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('video-input')?.output).toBe(
        'https://cdn.example.com/vid-1.mp4',
      );
    });

    it('executes analytics feedback without a performance summary service', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-analytics-feedback',
        brandId: 'brand-1',
        nodes: [
          {
            data: { config: { topN: 5, worstN: 3 }, label: 'Analytics' },
            id: 'analytics',
            type: 'analyticsFeedback',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('analytics')?.output).toEqual(
        expect.objectContaining({
          bestPlatform: null,
          topTopics: [],
          weekOverWeekDirection: 'stable',
        }),
      );
    });

    it('executes hook generator without invoking fallback behavior', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-hook-generator',
        nodes: [
          {
            data: {
              config: {
                hookFormula: 'list_reveal',
                niche: 'AI founders',
                product: 'content loops',
                toneStyle: 'educational',
              },
              label: 'Hook Generator',
            },
            id: 'hook',
            type: 'hookGenerator',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);
      const output = result.nodeResults.get('hook')?.output as {
        captionHook: string;
        hashtags: string[];
        hookText: string;
        slidePrompts: string[];
      };

      expectCompleted(result);
      expect(output.hookText).toContain('Here is what matters');
      expect(output.hashtags).toContain('#aifounders');
      expect(output.slidePrompts).toHaveLength(6);
      expect(loggerService.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('fallback executor invoked'),
        expect.objectContaining({ nodeType: 'hookGenerator' }),
      );
    });

    it('executes trend trigger with analytics keywords when no social trend adapter is available', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-trend',
        nodes: [
          {
            cachedOutput: ['ai tools'],
            data: { config: {}, label: 'Topics' },
            id: 'topics',
            type: 'workflowInput',
          },
          {
            data: {
              config: {
                minViralScore: 70,
                platform: 'tiktok',
                trendType: 'hashtag',
              },
              label: 'Trend',
            },
            id: 'trend',
            type: 'trendTrigger',
          },
        ],
        edges: [
          {
            id: 'topics-trend',
            source: 'topics',
            target: 'trend',
            targetHandle: 'keywords',
          },
        ],
        lockedNodeIds: ['topics'],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('trend')?.output).toEqual(
        expect.objectContaining({
          platform: 'tiktok',
          topic: 'ai tools',
          viralScore: 70,
        }),
      );
    });

    it('executes text-only publish when brand and caption inputs are present', async () => {
      const workflow = convertActionGraph(service, {
        id: 'wf-publish',
        edges: [
          {
            id: 'brand-publish',
            source: 'brand',
            target: 'publish',
            targetHandle: 'brand',
          },
          {
            id: 'caption-publish',
            source: 'caption',
            target: 'publish',
            targetHandle: 'caption',
          },
        ],
        lockedNodeIds: ['brand', 'caption'],
        nodes: [
          {
            cachedOutput: { brandId: 'brand-1' },
            data: { config: {}, label: 'Brand' },
            id: 'brand',
            type: 'workflowInput',
          },
          {
            cachedOutput: 'Ready to publish',
            data: { config: {}, label: 'Caption' },
            id: 'caption',
            type: 'workflowInput',
          },
          {
            data: {
              config: {
                platforms: ['twitter'],
                schedule: { type: 'immediate' },
              },
              label: 'Publish',
            },
            id: 'publish',
            type: 'publish',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await service.executeWorkflow(workflow);

      expectCompleted(result);
      expect(result.nodeResults.get('publish')?.output).toEqual(
        expect.objectContaining({
          platforms: ['twitter'],
          postIds: [],
          status: 'queued',
        }),
      );
    });

    it('passes brandId from workflow config into avatar generation', async () => {
      const avatarVideoGenerationService = {
        generateAvatarVideo: vi.fn(
          async (
            _params: unknown,
            _context: unknown,
            onPlaceholderCreated?: (ingredientId: string) => Promise<void>,
          ) => {
            await onPlaceholderCreated?.('video-1');
            return {
              externalId: 'ext-1',
              ingredientId: 'video-1',
              status: 'processing',
            };
          },
        ),
      };
      const adapterArgs = new Array(47).fill(undefined);
      adapterArgs[0] = { cdnUrl: 'https://cdn.example.com' };
      adapterArgs[1] = loggerService;
      adapterArgs[3] = avatarVideoGenerationService;
      adapterArgs[46] = {
        createBeforeProviderSubmission: vi
          .fn()
          .mockResolvedValue({ continuationId: 'continuation-1' }),
        markProviderSubmitted: vi.fn().mockResolvedValue(undefined),
      };
      const avatarService = new WorkflowEngineAdapterService(...adapterArgs);

      const workflow = convertActionGraph(avatarService, {
        id: 'wf-1',
        brandId: 'brand-1',
        edges: [],
        nodes: [
          {
            data: {
              config: { aspectRatio: '16:9', useIdentityDefaults: true },
              label: 'Avatar',
            },
            id: 'avatar',
            type: 'aiAvatarVideo',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      workflow.lockedNodeIds = ['script'];
      workflow.nodes.unshift({
        cachedOutput: 'hello world',
        config: {},
        id: 'script',
        inputs: [],
        isLocked: true,
        label: 'Script',
        type: 'workflowInput',
      });
      workflow.edges.push({
        id: 'script-avatar',
        source: 'script',
        target: 'avatar',
        targetHandle: 'script',
      });

      await avatarService.executeWorkflow(workflow, {
        executionId: 'execution-1',
      });

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
        expect.any(Function),
      );
    });

    it('executes captions, music source, and sound overlay nodes without fallback', async () => {
      const brandId = testId('brand');
      const organizationId = testId('org');
      const userId = testId('user');
      const avatarId = testId('avatar');
      const musicId = testId('music');
      const captionedId = testId('captioned');
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
        findOne: vi.fn().mockResolvedValue({ id: musicId }),
      };
      const sharedService = {
        createMediaDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: { id: captionedId },
          metadataData: { id: 'meta-1' },
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
          cdnUrl: 'https://cdn.example.com',
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

      const captionsWorkflow = convertActionGraph(executionService, {
        id: 'wf-caption',
        brandId,
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
            type: 'aiAvatarVideo',
          },
          {
            data: { config: {}, label: 'Captions' },
            id: 'captions',
            type: 'effect-captions',
          },
        ],
        organizationId,
        userId,
      });
      captionsWorkflow.lockedNodeIds = ['avatar'];
      captionsWorkflow.nodes[0].isLocked = true;

      const captionsResult =
        await executionService.executeWorkflow(captionsWorkflow);

      expectCompleted(captionsResult);
      expect(whisperService.generateCaptions).toHaveBeenCalledWith(avatarId);
      expect(captionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientId: avatarId,
          organizationId,
          userId,
        }),
      );

      const musicWorkflow = convertActionGraph(executionService, {
        id: 'wf-music',
        brandId,
        edges: [],
        nodes: [
          {
            data: { config: {}, label: 'Music' },
            id: 'music',
            type: 'musicSource',
          },
        ],
        organizationId,
        userId,
      });

      const musicResult = await executionService.executeWorkflow(musicWorkflow);

      expectCompleted(musicResult);
      expect(musicsService.findOne).toHaveBeenCalled();

      const overlayWorkflow = convertActionGraph(executionService, {
        id: 'wf-overlay',
        brandId,
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
        organizationId,
        userId,
      });
      overlayWorkflow.lockedNodeIds = ['captioned', 'music'];
      overlayWorkflow.nodes[0].isLocked = true;
      overlayWorkflow.nodes[1].isLocked = true;

      const overlayResult =
        await executionService.executeWorkflow(overlayWorkflow);

      expectCompleted(overlayResult);
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
        createMediaDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: {
            id: 'ingredient-1',
          },
          metadataData: {
            id: 'metadata-1',
          },
        }),
      };
      const replicateService = {
        runModel: vi.fn().mockResolvedValue('prediction-1'),
      };

      const adapterArgs = new Array(47).fill(undefined);
      adapterArgs[0] = { cdnUrl: 'https://cdn.example.com' };
      adapterArgs[1] = loggerService;
      adapterArgs[7] = ingredientsService;
      adapterArgs[8] = metadataService;
      adapterArgs[13] = sharedService;
      adapterArgs[19] = replicateService;
      adapterArgs[20] = promptBuilderService;
      // Image generation submits to a provider, so it needs the durable
      // continuation the callback finalizes against.
      adapterArgs[46] = {
        createBeforeProviderSubmission: vi
          .fn()
          .mockResolvedValue({ continuationId: 'continuation-1' }),
        markProviderSubmitted: vi.fn().mockResolvedValue(undefined),
      };
      const imageWorkflowService = new WorkflowEngineAdapterService(
        ...adapterArgs,
      );

      const template = GENERATION_WORKFLOW_TEMPLATES['virtual-staging-rescue'];

      const workflowDoc = {
        id: 'wf-real-estate',
        brandId: testId('brand'),
        edges: template.edges,
        inputVariables: template.inputVariables,
        nodes: template.nodes,
        organizationId: testId('org'),
        userId: testId('user'),
      };

      const executableWorkflow = convertActionGraph(
        imageWorkflowService,
        workflowDoc,
      );
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

      const result = await imageWorkflowService.executeWorkflow(
        hydratedWorkflow,
        { executionId: 'execution-1' },
      );

      // Image generation submits to Replicate and suspends until the provider
      // callback finalizes the continuation, so the run stays `running`.
      expect(
        Array.from(result.nodeResults.entries())
          .filter(([, nodeResult]) => nodeResult.error)
          .map(([nodeId, nodeResult]) => `${nodeId}: ${nodeResult.error}`),
      ).toEqual([]);
      expect(result.status).toBe('running');
      expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
      // The staging prompt template interpolates the runtime inputs, and the
      // source photo rides the reference-image handle into the same call.
      expect(replicateService.runModel).toHaveBeenCalledWith(
        'qwen/qwen-image',
        expect.objectContaining({
          image: 'https://example.com/source-room.jpg',
          prompt: expect.stringContaining('bedroom'),
          strength: 0.32,
        }),
        undefined,
        'continuation-1',
      );
    });

    it('fails image generation workflows when brandId is missing', async () => {
      const imageWorkflowService = new WorkflowEngineAdapterService(
        {
          cdnUrl: 'https://cdn.example.com',
        } as never,
        loggerService as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {} as never,
        {} as never,
        undefined,
        undefined,
        undefined,
        undefined,
        { createMediaDocumentsInternal: vi.fn() } as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { runModel: vi.fn() } as never,
        {
          buildPrompt: vi.fn().mockResolvedValue({
            input: { prompt: 'resolved prompt' },
          }),
        } as never,
        undefined,
      );

      const workflow = convertActionGraph(imageWorkflowService, {
        id: 'wf-missing-brand',
        edges: [],
        nodes: [
          {
            data: {
              config: {
                model: 'qwen/qwen-image',
                prompt: 'make an image',
              },
              label: 'Image',
            },
            id: 'image',
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      const result = await imageWorkflowService.executeWorkflow(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('imageGen requires a brandId in node config');
      expect(result.nodeResults.get('image')?.error).toBe(
        'imageGen requires a brandId in node config',
      );
    });
  });

  describe('node type to executor mapping', () => {
    it('keeps brandAsset in its action envelope', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: { assetType: 'logo', brandId: 'brand-1' } },
            id: 'n1',
            type: 'brandAsset',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0]).toMatchObject({
        config: {
          actionId: 'brandAsset',
          parameters: { assetType: 'logo', brandId: 'brand-1' },
        },
        type: 'genfeedAction',
      });
    });

    it('resolves the postReply action executor', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {}, label: 'Post Reply' },
            id: 'n1',
            type: 'postReply',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0]).toMatchObject({
        config: { actionId: 'postReply', parameters: {} },
        type: 'genfeedAction',
      });
    });

    it('resolves the sendDm action executor', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {}, label: 'Send DM' },
            id: 'n1',
            type: 'sendDm',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0]).toMatchObject({
        config: { actionId: 'sendDm', parameters: {} },
        type: 'genfeedAction',
      });
    });

    it('should map trigger nodes to corresponding executors', () => {
      const workflowDoc = {
        id: 'wf-1',
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
          {
            data: { config: {} },
            id: 'n5',
            type: 'trigger-comment',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].type).toBe('mentionTrigger');
      expect(result.nodes[1].type).toBe('newFollowerTrigger');
      expect(result.nodes[2].type).toBe('newLikeTrigger');
      expect(result.nodes[3].type).toBe('newRepostTrigger');
      expect(result.nodes[4].type).toBe('commentTrigger');
    });

    it('should map control nodes', () => {
      const workflowDoc = {
        id: 'wf-1',
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
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].type).toBe('condition');
      expect(result.nodes[1].type).toBe('delay');
    });

    it('preserves action envelopes and maps engine-native conditions', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'ai-enhance',
          },
          {
            data: { config: {} },
            id: 'n2',
            type: 'control-branch',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0]).toMatchObject({
        config: { actionId: 'ai-enhance', parameters: {} },
        type: 'genfeedAction',
      });
      expect(result.nodes[1].type).toBe('condition');
    });

    it('should map input-video to the dedicated input-video executor', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'input-video',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].type).toBe('input-video');
    });

    it('fails closed for unknown product node types', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'customType',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      expect(() => convertActionGraph(service, workflowDoc)).toThrow(
        /unsupported product node type customType/,
      );
    });
  });

  describe('node configuration handling', () => {
    it('should handle node.inputs array', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            inputs: ['input1', 'input2'],
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].inputs).toEqual(['input1', 'input2']);
    });

    it('should handle node.cachedOutput', () => {
      const cachedOutput = { result: 'cached' };
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            cachedOutput,
            data: { config: {} },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].cachedOutput).toEqual(cachedOutput);
    });

    it('should extract label from node.data.label', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {}, label: 'Custom Label' },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].label).toBe('Custom Label');
    });

    it('should fallback to node type when label is missing', () => {
      const workflowDoc = {
        id: 'wf-1',
        nodes: [
          {
            data: { config: {} },
            id: 'n1',
            type: 'imageGen',
          },
        ],
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.nodes[0].label).toBe('imageGen');
    });
  });

  describe('brand asset execution', () => {
    it('resolves logo, banner, and references through the brand asset executor', async () => {
      // Brand kit assets are `Asset` rows, not Brand columns, so the executor
      // reads them through `resolveBrandKitAssets` — which already hands back
      // absolute URLs. Nothing composes a CDN path any more.
      const brandsService = {
        resolveBrandKitAssets: vi.fn().mockResolvedValue({
          banner: {
            id: 'banner-1',
            mimeType: 'image/png',
            role: 'banner',
            url: 'https://cdn.example.com/banners/banner-1',
          },
          logo: {
            id: 'logo-1',
            mimeType: 'image/png',
            role: 'logo',
            url: 'https://cdn.example.com/logos/logo-1',
          },
          references: [
            {
              id: 'ref-1',
              mimeType: 'image/png',
              role: 'reference',
              url: 'https://cdn.example.com/references/ref-1',
            },
            {
              id: 'ref-2',
              mimeType: 'image/png',
              role: 'reference',
              url: 'https://cdn.example.com/references/ref-2',
            },
          ],
        }),
      };

      const brandAssetService = new WorkflowEngineAdapterService(
        {
          cdnUrl: 'https://cdn.example.com',
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
        const workflow = convertActionGraph(brandAssetService, {
          id: `wf-${assetType}`,
          nodes: [
            {
              data: {
                config: { assetType, brandId: testId('brand') },
                label: 'Brand Asset',
              },
              id: `brand-${assetType}`,
              type: 'brandAsset',
            },
          ],
          organizationId: testId('org'),
          userId: testId('user'),
        });

        const result = await brandAssetService.executeWorkflow(workflow);
        return result.nodeResults.get(`brand-${assetType}`)?.output;
      };

      await expect(runNode('logo')).resolves.toBe(
        'https://cdn.example.com/logos/logo-1',
      );
      await expect(runNode('banner')).resolves.toBe(
        'https://cdn.example.com/banners/banner-1',
      );
      await expect(runNode('references')).resolves.toEqual([
        'https://cdn.example.com/references/ref-1',
        'https://cdn.example.com/references/ref-2',
      ]);
    });
  });

  describe('edges handling', () => {
    it('should preserve sourceHandle and targetHandle', () => {
      const workflowDoc = {
        id: 'wf-1',
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
        organizationId: 'org-1',
        userId: 'user-1',
      };

      const result = convertActionGraph(service, workflowDoc);

      expect(result.edges[0]).toEqual({
        id: 'e1',
        source: 'n1',
        sourceHandle: 'output-1',
        target: 'n2',
        targetHandle: 'input-2',
      });
    });
  });

  describe('applyScheduledDigestCharge', () => {
    const CACHE_INDEX = 25; // 0-based position of cacheService
    const CREDITS_INDEX = 27; // 0-based position of creditsUtilsService

    const makeChargeAdapter = (
      cacheService: unknown,
      creditsUtilsService: unknown,
    ) => {
      const args = new Array(28).fill(undefined);
      args[0] = { cdnUrl: 'https://cdn.example.com' };
      args[1] = loggerService;
      args[CACHE_INDEX] = cacheService;
      args[CREDITS_INDEX] = creditsUtilsService;
      return new WorkflowEngineAdapterService(...args);
    };

    const readySummaries = (sent = true) => [
      {
        nodeType: 'trendDigest',
        output: {
          creditCost: 5,
          orgId: 'org-1',
          ownerUserId: 'user-1',
          skipped: false,
        },
      },
      { nodeType: 'sendEmail', output: { sent } },
    ];

    it('deducts exactly once on a confirmed send', async () => {
      const acquireLock = vi.fn().mockResolvedValue(true);
      const deduct = vi.fn().mockResolvedValue(undefined);
      const adapter = makeChargeAdapter(
        { acquireLock },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', readySummaries());

      expect(acquireLock).toHaveBeenCalledTimes(1);
      expect(acquireLock.mock.calls[0][0]).toMatch(
        /^workflow-digest-charged:wf-1:\d{4}-\d{2}-\d{2}$/,
      );
      expect(deduct).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        5,
        'Daily trends digest',
        'trend-scan',
      );
    });

    it('does not charge when the digest was skipped', async () => {
      const deduct = vi.fn();
      const adapter = makeChargeAdapter(
        { acquireLock: vi.fn().mockResolvedValue(true) },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', [
        {
          nodeType: 'trendDigest',
          output: { reason: 'no-trends', skipped: true },
        },
        { nodeType: 'sendEmail', output: { sent: false } },
      ]);

      expect(deduct).not.toHaveBeenCalled();
    });

    it('does not charge when the email was not sent', async () => {
      const deduct = vi.fn();
      const adapter = makeChargeAdapter(
        { acquireLock: vi.fn().mockResolvedValue(true) },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', readySummaries(false));

      expect(deduct).not.toHaveBeenCalled();
    });

    it('does not double-charge when the daily marker is already held', async () => {
      const deduct = vi.fn();
      const adapter = makeChargeAdapter(
        { acquireLock: vi.fn().mockResolvedValue(false) },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', readySummaries());

      expect(deduct).not.toHaveBeenCalled();
    });

    it('warns and skips (no charge, no lock) when the owner userId is missing after delivery', async () => {
      const acquireLock = vi.fn().mockResolvedValue(true);
      const deduct = vi.fn();
      const adapter = makeChargeAdapter(
        { acquireLock },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', [
        {
          nodeType: 'trendDigest',
          output: { creditCost: 5, orgId: 'org-1', skipped: false },
        },
        { nodeType: 'sendEmail', output: { sent: true } },
      ]);

      expect(deduct).not.toHaveBeenCalled();
      expect(acquireLock).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('charge skipped'),
        expect.objectContaining({ orgId: 'org-1', ownerUserId: null }),
      );
    });

    it('releases the marker so a transient deduction failure can retry', async () => {
      const acquireLock = vi.fn().mockResolvedValue(true);
      const releaseLock = vi.fn().mockResolvedValue(true);
      const deduct = vi
        .fn()
        .mockRejectedValue(new Error('transient credits failure'));
      const adapter = makeChargeAdapter(
        { acquireLock, releaseLock },
        { deductCreditsFromOrganization: deduct },
      );

      await adapter.applyScheduledDigestCharge('wf-1', readySummaries());

      expect(deduct).toHaveBeenCalledTimes(1);
      expect(releaseLock).toHaveBeenCalledTimes(1);
      expect(releaseLock.mock.calls[0][0]).toMatch(
        /^workflow-digest-charged:wf-1:\d{4}-\d{2}-\d{2}$/,
      );
    });
  });

  describe('buildDigestTrends platform filter', () => {
    const makeTrends = () => ({
      getViralVideos: vi.fn().mockResolvedValue([
        {
          platform: 'youtube',
          title: 'YT vid',
          url: 'u1',
          views: 100,
          viralScore: 90,
        },
        {
          platform: 'tiktok',
          title: 'TT vid',
          url: 'u2',
          views: 100,
          viralScore: 80,
        },
      ]),
      getTrendingHashtags: vi.fn().mockResolvedValue([]),
      getTrendingSounds: vi.fn().mockResolvedValue([]),
    });

    it('keeps only entries on the configured platforms', async () => {
      const result = await service.buildDigestTrends(makeTrends(), 10, 0, [
        'youtube',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].platform).toBe('youtube');
    });

    it('treats an empty platform list as no constraint', async () => {
      const result = await service.buildDigestTrends(makeTrends(), 10, 0, []);

      expect(result).toHaveLength(2);
    });
  });
});
