import { buildArticleHeaderPromptWorkflowDefinition } from '@api/collections/articles/services/article-header-prompt-workflow-definition';
import {
  articleGenerationChildWorkflow,
  articleReviewWorkflow,
  buildArticleGenerationWorkflowDefinition,
} from '@api/collections/articles/services/article-workflow-definitions';
import {
  buildBrandRemixGenerateWorkflowDefinitions,
  buildBrandRemixMetaPausedDraftWorkflowDefinition,
  buildBrandRemixReviewWorkflowDefinition,
  buildBrandRemixXPausedDraftWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import {
  AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS,
  AGENT_CAMPAIGN_WORKFLOW_IDS,
} from '@api/services/agent-campaign/agent-campaign-workflow-definition';
import {
  AI_INFLUENCER_WORKFLOW_DEFINITIONS,
  AI_INFLUENCER_WORKFLOW_IDS,
} from '@api/services/ai-influencer/ai-influencer-workflow-definition';
import { buildBatchGenerationWorkflowDefinition } from '@api/services/batch-generation/batch-generation-workflow-definition';
import {
  AB_TEST_WORKFLOW_DEFINITIONS,
  AB_TEST_WORKFLOW_IDS,
} from '@api/services/content-optimization/ab-test-workflow-definition';
import {
  CONTENT_OPTIMIZATION_WORKFLOW_DEFINITIONS,
  CONTENT_OPTIMIZATION_WORKFLOW_IDS,
} from '@api/services/content-optimization/content-optimization-workflow-definition';
import { buildSocialTimelineActionWorkflow } from '@api/services/social-timeline/social-timeline-workflow-definition';
import { describe, expect, it } from 'vitest';

describe('code-owned product workflow module inventory', () => {
  it.each([
    buildArticleGenerationWorkflowDefinition(),
    articleGenerationChildWorkflow(),
    articleReviewWorkflow(),
    buildArticleHeaderPromptWorkflowDefinition(),
    ...buildBrandRemixGenerateWorkflowDefinitions(),
    buildBrandRemixReviewWorkflowDefinition(),
  ])(
    '$canonicalId preserves credit-only Playground generation and review',
    (graph) => {
      expect(graph.organizationModule).toBe('playground');
    },
  );

  it.each([
    buildBrandRemixMetaPausedDraftWorkflowDefinition(),
    buildBrandRemixXPausedDraftWorkflowDefinition(),
  ])('$canonicalId gates external ad creation through Publishing', (graph) => {
    expect(graph.organizationModule).toBe('publishing');
  });

  it('keeps native Following provider actions behind Discovery', () => {
    const graph = buildSocialTimelineActionWorkflow();
    expect(graph.organizationModule).toBe('discovery');
    expect(graph.moduleCompletionNodeIds).toBeUndefined();
  });

  it('allows only settlement to finish a Batch whose module was disabled after generation', () => {
    const graph = buildBatchGenerationWorkflowDefinition();
    expect(graph.organizationModule).toBe('batch');
    expect(graph.moduleCompletionNodeIds).toEqual(['settle-credits']);
    expect(
      graph.definition.nodes.find((node) => node.id === 'settle-credits')?.data
        .config.actionId,
    ).toBe('batch.generation.settle');
    expect(graph.moduleCompletionNodeIds).not.toContain('process-batch');
  });

  it.each(AI_INFLUENCER_WORKFLOW_DEFINITIONS)(
    '$canonicalId admits its own product effect independently of the admin caller',
    (graph) => {
      const expected =
        graph.canonicalId === AI_INFLUENCER_WORKFLOW_IDS.DAILY_POSTS
          ? undefined
          : graph.canonicalId === AI_INFLUENCER_WORKFLOW_IDS.DAILY_POST
            ? 'automation'
            : graph.canonicalId === AI_INFLUENCER_WORKFLOW_IDS.PUBLISH_PLATFORM
              ? 'publishing'
              : 'playground';
      expect(graph.organizationModule).toBe(expected);
    },
  );

  it.each(AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS)(
    '$canonicalId separates tenant Automation admission from global dispatch sweeps',
    (graph) => {
      const isSweep =
        graph.canonicalId ===
          AGENT_CAMPAIGN_WORKFLOW_IDS.RUN_DUE_ORCHESTRATIONS ||
        graph.canonicalId ===
          AGENT_CAMPAIGN_WORKFLOW_IDS.RUN_TRIGGER_EVALUATIONS;
      expect(graph.organizationModule).toBe(isSweep ? undefined : 'automation');
    },
  );

  it.each(CONTENT_OPTIMIZATION_WORKFLOW_DEFINITIONS)(
    '$canonicalId owns analytics, prompt generation or publishing according to its effect',
    (graph) => {
      const expected =
        graph.canonicalId === CONTENT_OPTIMIZATION_WORKFLOW_IDS.OPTIMIZE_PROMPT
          ? 'playground'
          : [
                CONTENT_OPTIMIZATION_WORKFLOW_IDS.APPLY_SUGGESTION,
                CONTENT_OPTIMIZATION_WORKFLOW_IDS.REQUEUE_WINNER,
              ].some((id) => id === graph.canonicalId)
            ? 'publishing'
            : 'analytics';
      expect(graph.organizationModule).toBe(expected);
    },
  );

  it.each(AB_TEST_WORKFLOW_DEFINITIONS)(
    '$canonicalId gates new variation arms and metrics work independently',
    (graph) => {
      const createsArms =
        graph.canonicalId === AB_TEST_WORKFLOW_IDS.EXECUTE ||
        graph.canonicalId === AB_TEST_WORKFLOW_IDS.EXECUTE_ARM;
      expect(graph.organizationModule).toBe(
        createsArms ? 'publishing' : 'analytics',
      );
    },
  );
});
