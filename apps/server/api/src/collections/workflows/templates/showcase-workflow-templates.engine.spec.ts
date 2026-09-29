import type { WorkflowInputVariable } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import {
  executeAwaitedForEach,
  parseForEachOptions,
} from '@api/collections/workflows/system-workflow-for-each.util';
import {
  DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
  dailyPublishingAccountDefinition,
} from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import {
  SHOWCASE_WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '@api/collections/workflows/templates/workflow-templates';
import {
  buildActionExecutionInput,
  type ExecutableNode,
  type ExecutableWorkflow,
  type ExecutionRunResult,
  type NodeExecutor,
  PromptConstructorExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

/**
 * Runs every showcase template (#5510) through the real workflow engine: the
 * real converter builds the executable graph, the real engine gathers inputs
 * and validates every action's published input and output contract, and each
 * action is a stub returning the output shape its registered executor returns
 * (see the `workflow-*-executor-registrar.service.ts` files). Only I/O is
 * faked, so a mis-wired handle — an edge naming an output key the source
 * never produces — leaves its target without that input and fails here.
 */

const BRAND_ID = testId('brand');
const ORGANIZATION_ID = testId('org');
const USER_ID = testId('user');
const MEDIA_BASE_URL = 'https://api.genfeed.test';

type ShowcaseGraph = {
  edges?: WorkflowTemplate['edges'];
  id: string;
  inputVariables?: WorkflowTemplate['inputVariables'];
  nodes?: WorkflowTemplate['nodes'];
};

type GraphRun = {
  executable: ExecutableWorkflow;
  graphId: string;
  inputsByNode: Map<string, Map<string, unknown>>;
  result: ExecutionRunResult;
};

type StubExecutor = (
  node: ExecutableNode,
  inputs: Map<string, unknown>,
) => unknown;

let sequence = 0;
function nextId(label: string): string {
  sequence += 1;
  return testId(label, sequence);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readId(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const id = readRecord(value).id;
  if (typeof id !== 'string') {
    throw new Error(`Expected an id, received ${JSON.stringify(value)}`);
  }
  return id;
}

const promptConstructor = new PromptConstructorExecutor();

/** Output shapes of the real registered executors, keyed by action id. */
const ACTION_STUBS: Record<string, StubExecutor> = {
  // workflow-media-processing-executor-registrar: registerAvatarVideoExecutor
  aiAvatarVideo: () => {
    const video = {
      externalId: 'heygen-video',
      id: nextId('avatarvideo'),
      status: 'processing',
    };
    return { ...video, video };
  },
  // workflow-content-executor-registrar: registerAttachPostIngredientExecutor
  // (resolves to the attached post and ingredient ids)
  attachPostIngredient: (_node, inputs) => ({
    ingredientId: readId(inputs.get('ingredientId')),
    postId: readId(inputs.get('postId')),
  }),
  // workflow-media-processing-executor-registrar: registerCaptionsExecutor
  'effect-captions': () => {
    const id = nextId('captionedvideo');
    return {
      id,
      status: 'generated',
      videoUrl: `${MEDIA_BASE_URL}/videos/${id}`,
    };
  },
  // workflow-media-generation-executor-registrar: imageGen resolver
  imageGen: () => {
    const id = nextId('image');
    return {
      generationBriefEvidence: {},
      generationSource: 'workflow',
      id,
      imageUrl: `${MEDIA_BASE_URL}/images/${id}`,
      model: 'test-image-model',
      provider: 'replicate',
      status: 'processing',
    };
  },
  // workflow-content-executor-registrar: registerLlmExecutor
  llm: () => ({
    content: 'Generated draft',
    model: 'test-text-model',
    text: 'Generated draft',
  }),
  // workflow-media-processing-executor-registrar: library branch
  musicSource: () => {
    const id = nextId('music');
    return {
      musicIngredientId: id,
      musicUrl: `${MEDIA_BASE_URL}/musics/${id}`,
      sourceType: 'library',
    };
  },
  // workflow-content-executor-registrar: registerNewsletterExecutor
  newsletterGen: () => {
    const id = nextId('newsletter');
    const newsletter = {
      id,
      label: 'Weekly newsletter',
      status: 'draft',
      topic: 'Weekly thesis',
    };
    return { id, newsletter, status: 'draft', topic: newsletter.topic };
  },
  // workflow-content-executor-registrar: executePostGen
  postGen: () => {
    const id = nextId('post');
    return {
      description: 'Generated X post',
      groupId: nextId('postgroup'),
      id,
      platform: 'twitter',
      post: { id, label: 'Generated X post', status: 'draft' },
      postIds: [id],
      status: 'draft',
    };
  },
  // workflow-media-processing-executor-registrar: registerSoundOverlayExecutor
  soundOverlay: () => {
    const id = nextId('overlayvideo');
    return {
      id,
      status: 'generated',
      videoUrl: `${MEDIA_BASE_URL}/videos/${id}`,
    };
  },
  // workflow-content-executor-registrar: registerSourceCorpusExecutor
  sourceCorpus: () => ({
    content: 'Collected source posts',
    corpus: 'Collected source posts',
    count: 1,
    markdown: 'Collected source posts',
    posts: [{ id: nextId('sourcepost') }],
    text: 'Collected source posts',
  }),
  // workflow-content-executor-registrar: registerWorkflowOutputCollector
  'workflow.collect-output': (node, inputs) =>
    buildActionExecutionInput(node.config, inputs),

  // daily-publishing.service: actions registered on the same engine through
  // SystemWorkflowRunnerService.registerAction.
  'daily-publishing.resolve': (node, inputs) => {
    const request = buildActionExecutionInput(node.config, inputs);
    return {
      accounts: [
        {
          accountLabel: '@founder',
          credentialId: nextId('credential'),
          platform: 'twitter',
          slotKey: 'daily:twitter',
        },
        {
          accountLabel: 'Company',
          credentialId: nextId('credential'),
          platform: 'linkedin',
          slotKey: 'daily:linkedin',
        },
      ],
      request,
    };
  },
  'daily-publishing.refresh': (_node, inputs) => {
    const plan = readRecord(inputs.get('state'));
    const accounts = Array.isArray(plan.accounts) ? plan.accounts : [];
    return {
      items: accounts.map((account) => ({
        ...readRecord(account),
        request: plan.request,
        sources: [{ id: nextId('source'), kind: 'topic', text: 'Topic' }],
      })),
    };
  },
  // The slot arrives through the node's `item` input variable (config).
  'daily-publishing.collect-analytics': (node, inputs) =>
    readRecord(buildActionExecutionInput(node.config, inputs).item),
  'daily-publishing.select': (_node, inputs) => {
    const state = readRecord(inputs.get('state'));
    return { ...state, source: (state.sources as unknown[])[0] };
  },
  'daily-publishing.generate': (_node, inputs) => ({
    ...readRecord(inputs.get('state')),
    postId: nextId('dailypost'),
  }),
  'daily-publishing.evaluate': (_node, inputs) => ({
    ...readRecord(inputs.get('state')),
    score: 9,
  }),
  'daily-publishing.schedule': (_node, inputs) => ({
    ...readRecord(inputs.get('state')),
    outcome: 'scheduled',
  }),
};

function sampleInputValue(
  variable: NonNullable<WorkflowTemplate['inputVariables']>[number],
): unknown {
  if (variable.key === 'brandId') {
    return BRAND_ID;
  }
  if (variable.defaultValue !== undefined && variable.defaultValue !== '') {
    return variable.defaultValue;
  }
  switch (variable.type) {
    case 'image':
      return `${MEDIA_BASE_URL}/images/${nextId('inputimage')}`;
    case 'audio':
      return `${MEDIA_BASE_URL}/audios/${nextId('inputaudio')}`;
    case 'json':
      return [];
    case 'boolean':
      return false;
    case 'number':
      return 1;
    default:
      return `Sample ${variable.label}`;
  }
}

function sampleInputValues(graph: ShowcaseGraph): Record<string, unknown> {
  return Object.fromEntries(
    (graph.inputVariables ?? []).map((variable) => [
      variable.key,
      sampleInputValue(variable),
    ]),
  );
}

async function runGraph(
  graph: ShowcaseGraph,
  inputValues: Record<string, unknown>,
  childRuns: GraphRun[],
): Promise<GraphRun> {
  const converter = new WorkflowEngineConverterService();
  const inputVariables: WorkflowInputVariable[] = (
    graph.inputVariables ?? []
  ).map((variable) => ({ ...variable, required: variable.required ?? false }));
  const document = {
    brandId: BRAND_ID,
    edges: graph.edges ?? [],
    id: graph.id,
    inputVariables,
    nodes: graph.nodes ?? [],
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    versionId: 'showcase-version',
  };
  const executable = converter.applyRuntimeInputValues(
    document,
    converter.convertToExecutableWorkflow(document),
    inputValues,
  );

  const inputsByNode = new Map<string, Map<string, unknown>>();
  const record =
    (executor: NodeExecutor): NodeExecutor =>
    (node, inputs, context) => {
      inputsByNode.set(node.id, new Map(inputs));
      return executor(node, inputs, context);
    };

  const engine = new WorkflowEngine({ maxConcurrency: 1 });
  const actionIds = new Set(
    executable.nodes
      .map((node) => node.config.actionId)
      .filter((actionId): actionId is string => typeof actionId === 'string'),
  );
  for (const actionId of actionIds) {
    if (actionId === 'promptConstructor') {
      engine.registerExecutor(
        actionId,
        record(async (node, inputs, context) => {
          const output = await promptConstructor.execute({
            context,
            inputs,
            node,
          });
          return output.data;
        }),
      );
      continue;
    }
    if (actionId === 'workflow.for-each') {
      engine.registerExecutor(
        actionId,
        record(async (node, inputs, context) => {
          const options = parseForEachOptions(
            buildActionExecutionInput(node.config, inputs),
          );
          if (
            options.childWorkflowId !== DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID
          ) {
            throw new Error(`No child workflow for ${options.childWorkflowId}`);
          }
          const accountDefinition = dailyPublishingAccountDefinition();
          return executeAwaitedForEach({
            ...options,
            childContexts: options.items.map(() => ({
              organizationId: context.organizationId,
              userId: context.userId,
            })),
            executeItem: async (index) => {
              const child = await runGraph(
                {
                  ...accountDefinition.definition,
                  id: accountDefinition.canonicalId,
                },
                { [options.itemInputKey]: options.items[index] },
                childRuns,
              );
              childRuns.push(child);
              if (child.result.status !== 'completed') {
                throw new Error(describeFailure(child));
              }
              return {
                provenance: {
                  executionId: `${graph.id}:child:${index}`,
                  workflowId: accountDefinition.canonicalId,
                  workflowLabel: accountDefinition.label,
                },
                result: child.result.nodeResults.get(
                  accountDefinition.resultNodeId,
                )?.output,
              };
            },
          });
        }),
      );
      continue;
    }
    const stub = ACTION_STUBS[actionId];
    if (!stub) {
      throw new Error(`No real-shape stub for action ${actionId}`);
    }
    engine.registerExecutor(
      actionId,
      record(async (node, inputs) => stub(node, inputs)),
    );
  }

  const result = await engine.execute(executable, { maxRetries: 0 });
  return { executable, graphId: graph.id, inputsByNode, result };
}

/** The template run plus every child workflow run it fanned out to. */
async function runTemplate(template: WorkflowTemplate): Promise<GraphRun[]> {
  const childRuns: GraphRun[] = [];
  const run = await runGraph(template, sampleInputValues(template), childRuns);
  return [run, ...childRuns];
}

function describeFailure(run: GraphRun): string {
  const nodeErrors = [...run.result.nodeResults.entries()]
    .filter(([, nodeResult]) => nodeResult.error)
    .map(([nodeId, nodeResult]) => `${nodeId}: ${nodeResult.error}`);
  return `${run.graphId}: ${nodeErrors.join(' | ') || run.result.error || ''}`;
}

/** Edges whose target ran without receiving the edge's input handle. */
function findUnresolvedEdges(run: GraphRun): string[] {
  return run.executable.edges
    .filter(
      (edge) =>
        !run.inputsByNode
          .get(edge.target)
          ?.has(edge.targetHandle ?? edge.source),
    )
    .map((edge) => edge.id);
}

/** Terminal nodes (no outgoing edge) that ran without any input. */
function findStarvedTerminalNodes(run: GraphRun): string[] {
  const sourceIds = new Set(run.executable.edges.map((edge) => edge.source));
  const targetIds = new Set(run.executable.edges.map((edge) => edge.target));
  return run.executable.nodes
    .filter((node) => !sourceIds.has(node.id) && targetIds.has(node.id))
    .filter((node) => (run.inputsByNode.get(node.id)?.size ?? 0) === 0)
    .map((node) => node.id);
}

function requireTemplate(templateId: string): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template ${templateId}`);
  }
  return template;
}

function withEdgeSourceHandle(
  template: WorkflowTemplate,
  edgeId: string,
  sourceHandle: string,
): WorkflowTemplate {
  expect(template.edges?.some((edge) => edge.id === edgeId)).toBe(true);
  return {
    ...template,
    edges: template.edges?.map((edge) =>
      edge.id === edgeId ? { ...edge, sourceHandle } : edge,
    ),
  };
}

describe('showcase workflow templates on the real engine', () => {
  it.each([...SHOWCASE_WORKFLOW_TEMPLATE_IDS])(
    '%s completes and every edge delivers its handle',
    async (templateId) => {
      const runs = await runTemplate(requireTemplate(templateId));

      for (const run of runs) {
        expect(run.result.status, describeFailure(run)).toBe('completed');
        expect(findUnresolvedEdges(run), run.graphId).toEqual([]);
        expect(findStarvedTerminalNodes(run), run.graphId).toEqual([]);
      }
    },
  );

  it('runs the daily publishing child workflow once per account', async () => {
    const runs = await runTemplate(
      requireTemplate('daily-brand-social-publishing'),
    );

    const childRuns = runs.filter(
      (run) => run.graphId === DAILY_PUBLISHING_ACCOUNT_WORKFLOW_ID,
    );
    expect(childRuns).toHaveLength(2);
    for (const child of childRuns) {
      expect(child.result.nodeResults.get('schedule')?.output).toMatchObject({
        outcome: 'scheduled',
      });
    }
  });

  it('delivers the generated media URL to each collected output', async () => {
    const [illustration] = await runTemplate(
      requireTemplate('founder-editorial-illustration'),
    );
    const [landscape] = await runTemplate(
      requireTemplate('avatar-ugc-x-landscape-heygen'),
    );

    expect(
      illustration?.inputsByNode
        .get('workflow-output-founder-illustration')
        ?.get('value'),
    ).toEqual(expect.stringMatching(`^${MEDIA_BASE_URL}/images/`));
    const captionedVideoUrl = readRecord(
      landscape?.result.nodeResults.get('effect-captions')?.output,
    ).videoUrl;
    expect(captionedVideoUrl).toEqual(
      expect.stringMatching(`^${MEDIA_BASE_URL}/videos/`),
    );
    expect(landscape?.inputsByNode.get('sound-overlay')?.get('videoUrl')).toBe(
      captionedVideoUrl,
    );
  });

  describe('negative controls: a handle the source output does not carry', () => {
    it('fails an image edge that names `image` on the imageGen output', async () => {
      const [run] = await runTemplate(
        withEdgeSourceHandle(
          requireTemplate('founder-editorial-illustration'),
          'edge-founder-illustration-output',
          'image',
        ),
      );

      expect(run && findUnresolvedEdges(run)).toEqual([
        'edge-founder-illustration-output',
      ]);
      expect(run && findStarvedTerminalNodes(run)).toEqual([
        'workflow-output-founder-illustration',
      ]);
    });
  });
});
