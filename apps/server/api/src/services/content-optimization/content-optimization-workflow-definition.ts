import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { AB_TEST_ACTION_IDS } from '@api/services/content-optimization/ab-test-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CONTENT_OPTIMIZATION_WORKFLOW_IDS = {
  ANALYZE: 'content.optimization.analyze',
  APPLY_SUGGESTION: 'content.optimization.apply-suggestion',
  OPTIMIZE_PROMPT: 'content.optimization.optimize-prompt',
  RECOMMEND: 'content.optimization.recommend',
  REQUEUE_WINNER: 'content.optimization.requeue-winner',
  SUGGEST: 'content.optimization.suggest',
} as const;

export const CONTENT_OPTIMIZATION_ACTION_IDS = {
  APPLY_SUGGESTION: 'content.optimization.suggestion.apply',
  DERIVE_ANALYSIS: 'content.optimization.analysis.derive',
  DERIVE_RECOMMENDATIONS: 'content.optimization.recommendations.derive',
  GENERATE_SUGGESTIONS: 'content.optimization.suggestions.generate',
  LOAD_PROMPT_CONTEXT: 'content.optimization.prompt.load-context',
  LOAD_SUMMARY: 'content.optimization.summary.load',
  OPTIMIZE_PROMPT: 'content.optimization.prompt.optimize',
  REQUEUE_WINNER: 'content.optimization.winner.requeue',
  RUN_CYCLE: 'content.optimization.cycle.run',
} as const;

function requestVariable() {
  return {
    key: 'request',
    label: 'Content optimization request',
    required: true,
    type: 'json' as const,
  };
}

function analysisNodes(resultActionId: string, resultNodeId: string) {
  return {
    edges: [
      {
        id: 'summary-to-result',
        source: 'load-summary',
        target: resultNodeId,
        targetHandle: 'summary',
      },
      {
        id: 'cycle-to-result',
        source: 'run-cycle',
        target: resultNodeId,
        targetHandle: 'cycle',
      },
    ],
    nodes: [
      createGenfeedActionNode({
        actionId: CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_SUMMARY,
        id: 'load-summary',
        inputVariableKeys: ['request'],
        position: { x: -140, y: 0 },
      }),
      createGenfeedActionNode({
        actionId: CONTENT_OPTIMIZATION_ACTION_IDS.RUN_CYCLE,
        id: 'run-cycle',
        inputVariableKeys: ['request'],
        position: { x: 140, y: 0 },
      }),
      createGenfeedActionNode({
        actionId: resultActionId,
        id: resultNodeId,
        inputVariableKeys: ['request'],
        position: { x: 0, y: 240 },
      }),
    ],
  };
}

export function buildContentAnalysisWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const graph = analysisNodes(
    CONTENT_OPTIMIZATION_ACTION_IDS.DERIVE_ANALYSIS,
    'derive-analysis',
  );
  return {
    canonicalId: CONTENT_OPTIMIZATION_WORKFLOW_IDS.ANALYZE,
    definition: {
      edges: graph.edges,
      inputVariables: [requestVariable()],
      nodes: graph.nodes,
    },
    description:
      'Loads performance evidence, runs the optimization cycle, and derives one analysis.',
    label: 'Analyze Content Performance',
    resultNodeId: 'derive-analysis',
    version: 1,
  };
}

export function buildPromptOptimizationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CONTENT_OPTIMIZATION_WORKFLOW_IDS.OPTIMIZE_PROMPT,
    definition: {
      edges: [
        {
          id: 'context-to-optimize',
          source: 'load-context',
          target: 'optimize-prompt',
          targetHandle: 'performance',
        },
      ],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId: CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_PROMPT_CONTEXT,
          id: 'load-context',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: CONTENT_OPTIMIZATION_ACTION_IDS.OPTIMIZE_PROMPT,
          id: 'optimize-prompt',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 220 },
        }),
      ],
    },
    description:
      'Loads historical performance context and optimizes one content prompt.',
    label: 'Optimize Content Prompt',
    resultNodeId: 'optimize-prompt',
    version: 1,
  };
}

export function buildContentRecommendationsWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const graph = analysisNodes(
    CONTENT_OPTIMIZATION_ACTION_IDS.DERIVE_RECOMMENDATIONS,
    'derive-recommendations',
  );
  return {
    canonicalId: CONTENT_OPTIMIZATION_WORKFLOW_IDS.RECOMMEND,
    definition: {
      edges: [
        ...graph.edges,
        {
          id: 'validated-to-recommendations',
          source: 'load-validated-ab-tests',
          target: 'derive-recommendations',
          targetHandle: 'validatedAbTests',
        },
      ],
      inputVariables: [requestVariable()],
      nodes: [
        ...graph.nodes,
        createGenfeedActionNode({
          actionId: AB_TEST_ACTION_IDS.LOAD_VALIDATED,
          id: 'load-validated-ab-tests',
          inputVariableKeys: ['request'],
          position: { x: 360, y: 0 },
        }),
      ],
    },
    description:
      'Loads performance evidence and derives actionable content recommendations.',
    label: 'Recommend Content Optimizations',
    resultNodeId: 'derive-recommendations',
    version: 1,
  };
}

export function buildContentSuggestionsWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionDefinition(
    CONTENT_OPTIMIZATION_WORKFLOW_IDS.SUGGEST,
    CONTENT_OPTIMIZATION_ACTION_IDS.GENERATE_SUGGESTIONS,
    'generate-suggestions',
    'Generate Content Suggestions',
  );
}

export function buildApplySuggestionWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CONTENT_OPTIMIZATION_WORKFLOW_IDS.APPLY_SUGGESTION,
    definition: {
      edges: [
        {
          id: 'suggestions-to-apply',
          source: 'generate-suggestions',
          target: 'apply-suggestion',
          targetHandle: 'suggestions',
        },
      ],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId: CONTENT_OPTIMIZATION_ACTION_IDS.GENERATE_SUGGESTIONS,
          id: 'generate-suggestions',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: CONTENT_OPTIMIZATION_ACTION_IDS.APPLY_SUGGESTION,
          id: 'apply-suggestion',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 220 },
        }),
      ],
    },
    description:
      'Generates current evidence-backed suggestions and applies one eligible suggestion.',
    label: 'Apply Content Suggestion',
    resultNodeId: 'apply-suggestion',
    version: 1,
  };
}

export function buildRequeueWinnerWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return singleActionDefinition(
    CONTENT_OPTIMIZATION_WORKFLOW_IDS.REQUEUE_WINNER,
    CONTENT_OPTIMIZATION_ACTION_IDS.REQUEUE_WINNER,
    'requeue-winner',
    'Requeue Winning Content Signal',
  );
}

function singleActionDefinition(
  canonicalId: string,
  actionId: string,
  nodeId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [requestVariable()],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: nodeId,
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: label,
    label,
    resultNodeId: nodeId,
    version: 1,
  };
}

export const CONTENT_OPTIMIZATION_WORKFLOW_DEFINITIONS = [
  buildContentAnalysisWorkflowDefinition(),
  buildPromptOptimizationWorkflowDefinition(),
  buildContentRecommendationsWorkflowDefinition(),
  buildContentSuggestionsWorkflowDefinition(),
  buildApplySuggestionWorkflowDefinition(),
  buildRequeueWinnerWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];
