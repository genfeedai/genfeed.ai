import { WorkflowContentExecutorRegistrarService } from '@api/collections/workflows/services/workflow-content-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type {
  WorkflowPostGenerationInput,
  WorkflowPostGenerationResult,
} from '@api/collections/workflows/services/workflow-post-generation.types';
import { Platform } from '@genfeedai/contracts';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function createHelper(): WorkflowEngineExecutorHelperService {
  return {
    buildPostLabel: (description: string) => description.slice(0, 60),
    getOptionalNumberConfig: (
      _config: Record<string, unknown>,
      _key: string,
      fallback: number,
    ) => fallback,
    readConfigString: (
      config: Record<string, unknown> | undefined,
      key: string,
    ) => {
      const value = config?.[key];
      return typeof value === 'string' ? value : undefined;
    },
    wrapEngineExecutor:
      (executor: INodeExecutor) =>
      async (...args: Parameters<NodeExecutor>) =>
        (
          await executor.execute({
            context: args[2],
            inputs: args[1],
            node: args[0],
          })
        ).data,
  } as unknown as WorkflowEngineExecutorHelperService;
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: 'cred-1',
    description: 'Draft body',
    holdReason: null,
    id: 'post-1',
    isHeldForReview: false,
    label: 'Draft body',
    platform: Platform.TWITTER,
    receiptId: 'receipt-1',
    status: 'draft',
    ...overrides,
  };
}

function runPostGenNode(
  config: Record<string, unknown>,
  generate: ReturnType<typeof vi.fn>,
) {
  const engine = new WorkflowEngine();

  new WorkflowContentExecutorRegistrarService(
    createHelper(),
    undefined,
    undefined,
    undefined,
    undefined,
    { generate } as never,
  ).register(engine);

  return engine.getExecutor('genfeedAction')?.(
    createExecutableActionNode({
      actionId: 'postGen',
      id: 'post-gen',
      label: 'Generate post',
      parameters: {
        brandId: 'brand-1',
        prompt: 'Write a launch post',
        ...config,
      },
    }),
    new Map(),
    {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
      workflowVersionId: 'version-1',
    },
  );
}

function runTalkingHeadScriptNode(openRouterService: {
  chatCompletion: ReturnType<typeof vi.fn>;
}) {
  const engine = new WorkflowEngine();

  new WorkflowContentExecutorRegistrarService(
    createHelper(),
    undefined,
    openRouterService as never,
  ).register(engine);

  return engine.getExecutor('genfeedAction')?.(
    createExecutableActionNode({
      actionId: 'talkingHeadScript',
      id: 'script-1',
      label: 'Talking-head Script',
      parameters: {
        clipCount: 5,
        durationSeconds: 30,
        language: 'en',
        productContext: 'A content operating system for founder-led brands',
        wordsPerSecond: 3.5,
      },
    }),
    new Map<string, unknown>([
      ['brandVoice', 'Direct and practical'],
      ['harnessContext', { bannedPhrases: ['game-changing'] }],
    ]),
    {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
      workflowVersionId: 'version-1',
    },
  );
}

describe('WorkflowContentExecutorRegistrarService', () => {
  it('registers talking-head scripts with a forced structured-output contract', async () => {
    const structuredArguments = JSON.stringify({
      segments: [
        {
          clipIndex: 0,
          purpose: 'hook',
          text: 'Your content should compound while you sleep',
        },
        {
          clipIndex: 1,
          purpose: 'body',
          text: 'Most teams rebuild the same process every single week',
        },
        {
          clipIndex: 2,
          purpose: 'body',
          text: 'Genfeed turns your real voice into repeatable content workflows',
        },
        {
          clipIndex: 3,
          purpose: 'body',
          text: 'Plan create review and publish without losing the thread',
        },
        {
          clipIndex: 4,
          purpose: 'cta',
          text: 'Build your first content workflow today',
        },
      ],
    });
    const openRouterService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: structuredArguments,
                    name: 'submit_talking_head_script',
                  },
                  id: 'call-1',
                  type: 'function',
                },
              ],
            },
          },
        ],
      }),
    };

    const result = (await runTalkingHeadScriptNode(openRouterService)) as {
      script: { segments: unknown[]; totalTargetWordCount: number };
    };

    expect(result.script.segments).toHaveLength(5);
    expect(result.script.totalTargetWordCount).toBe(105);
    expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: {
          function: { name: 'submit_talking_head_script' },
          type: 'function',
        },
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({
              name: 'submit_talking_head_script',
              parameters: expect.objectContaining({
                additionalProperties: false,
                properties: {
                  segments: expect.objectContaining({
                    maxItems: 5,
                    minItems: 5,
                  }),
                },
              }),
            }),
          }),
        ],
      }),
    );
    const call = openRouterService.chatCompletion.mock.calls[0]?.[0];
    const userMessage = call.messages.find(
      (message: { role: string }) => message.role === 'user',
    );
    expect(userMessage?.content).toContain('Direct and practical');
    expect(userMessage?.content).toContain('game-changing');
    expect(userMessage?.content).toContain('"targetWordCount": 21');
  });

  it('registers the talking-head executor even when OpenRouter is unavailable', () => {
    const engine = new WorkflowEngine();
    new WorkflowContentExecutorRegistrarService(createHelper()).register(
      engine,
    );

    expect(engine.getRegisteredActionIds()).toContain('talkingHeadScript');
  });

  it('hands the node to the branded generation service as one named account', async () => {
    const generate = vi.fn().mockResolvedValue({
      drafts: [draft()],
      failures: [],
      groupId: 'group-1',
    } satisfies WorkflowPostGenerationResult);

    const result = (await runPostGenNode(
      { brandLabel: 'Acme', credentialId: 'cred-1', timezone: 'Europe/Rome' },
      generate,
    )) as Record<string, unknown>;

    const call = generate.mock.calls[0]?.[0] as WorkflowPostGenerationInput;
    expect(call).toMatchObject({
      brandId: 'brand-1',
      brandLabel: 'Acme',
      credentialId: 'cred-1',
      maxTokens: 500,
      nodeId: 'post-gen',
      prompt: 'Write a launch post',
      timezone: 'Europe/Rome',
    });
    expect(call.platform).toBeUndefined();
    expect(call.buildLabel('Hello world')).toBe('Hello world');
    expect(result).toMatchObject({
      description: 'Draft body',
      failures: [],
      groupId: 'group-1',
      holdReason: null,
      id: 'post-1',
      isHeldForReview: false,
      platform: Platform.TWITTER,
      post: { id: 'post-1', label: 'Draft body', status: 'draft' },
      postIds: ['post-1'],
      receiptIds: ['receipt-1'],
    });
  });

  it('reports one primary post and every receipt when a platform fans out to several accounts', async () => {
    const generate = vi.fn().mockResolvedValue({
      drafts: [
        draft(),
        draft({
          credentialId: 'cred-2',
          description: 'Draft body, rephrased',
          id: 'post-2',
          receiptId: 'receipt-2',
        }),
      ],
      failures: [],
      groupId: 'group-1',
    } satisfies WorkflowPostGenerationResult);

    const result = (await runPostGenNode(
      { platform: Platform.TWITTER },
      generate,
    )) as { id: string; postIds: string[]; receiptIds: string[] };

    const call = generate.mock.calls[0]?.[0] as WorkflowPostGenerationInput;
    expect(call.platform).toBe(Platform.TWITTER);
    expect(result.id).toBe('post-1');
    expect(result.postIds).toEqual(['post-1', 'post-2']);
    expect(result.receiptIds).toEqual(['receipt-1', 'receipt-2']);
  });

  it('surfaces a held draft and the accounts that stopped without failing the node', async () => {
    const generate = vi.fn().mockResolvedValue({
      drafts: [
        draft({ holdReason: 'provisional_brand', isHeldForReview: true }),
      ],
      failures: [
        {
          credentialId: 'cred-2',
          reasonCode: 'provider_output_empty',
          receiptId: 'receipt-2',
        },
      ],
      groupId: 'group-1',
    } satisfies WorkflowPostGenerationResult);

    const result = (await runPostGenNode(
      { platform: Platform.TWITTER },
      generate,
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      failures: [
        { credentialId: 'cred-2', reasonCode: 'provider_output_empty' },
      ],
      holdReason: 'provisional_brand',
      isHeldForReview: true,
    });
  });

  it('fails with the stable reason and receipt id when no account saved a draft', async () => {
    const generate = vi.fn().mockResolvedValue({
      drafts: [],
      failures: [
        {
          credentialId: 'cred-1',
          reasonCode: 'no_approved_revision',
          receiptId: 'receipt-9',
        },
      ],
      groupId: 'group-1',
    } satisfies WorkflowPostGenerationResult);

    await expect(
      runPostGenNode({ credentialId: 'cred-1' }, generate),
    ).rejects.toThrow('no_approved_revision (receipt receipt-9)');
  });

  it('fails when the node names neither an account nor a platform', async () => {
    const generate = vi.fn();

    await expect(runPostGenNode({}, generate)).rejects.toThrow(
      'postGen requires credentialId or platform',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not register postGen without the branded generation service', () => {
    const engine = new WorkflowEngine();
    new WorkflowContentExecutorRegistrarService(createHelper()).register(
      engine,
    );

    expect(engine.getRegisteredActionIds()).not.toContain('postGen');
  });
});
