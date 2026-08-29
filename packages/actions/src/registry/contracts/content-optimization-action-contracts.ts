import type { ActionJsonSchema } from '../../interfaces/action-definition.interface.js';
import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const TRUE_SCHEMA = { const: true, type: 'boolean' } as const;
const FALSE_SCHEMA = { const: false, type: 'boolean' } as const;
const PERFORMANCE_ITEM = closedObjectSchema(
  {
    comments: NUMBER_SCHEMA,
    description: STRING_SCHEMA,
    engagementRate: NUMBER_SCHEMA,
    likes: NUMBER_SCHEMA,
    platform: STRING_SCHEMA,
    postId: STRING_SCHEMA,
    publishDate: STRING_SCHEMA,
    saves: NUMBER_SCHEMA,
    shares: NUMBER_SCHEMA,
    title: STRING_SCHEMA,
    views: NUMBER_SCHEMA,
  },
  [
    'comments',
    'description',
    'engagementRate',
    'likes',
    'platform',
    'postId',
    'saves',
    'shares',
    'title',
    'views',
  ],
);
const WEEKLY_SUMMARY = closedObjectSchema(
  {
    avgEngagementByContentType: arraySchema(
      closedObjectSchema(
        {
          avgEngagementRate: NUMBER_SCHEMA,
          category: STRING_SCHEMA,
          totalPosts: NUMBER_SCHEMA,
        },
        ['avgEngagementRate', 'category', 'totalPosts'],
      ),
    ),
    avgEngagementByPlatform: arraySchema(
      closedObjectSchema(
        {
          avgEngagementRate: NUMBER_SCHEMA,
          platform: STRING_SCHEMA,
          totalPosts: NUMBER_SCHEMA,
        },
        ['avgEngagementRate', 'platform', 'totalPosts'],
      ),
    ),
    bestPostingTimes: arraySchema(
      closedObjectSchema(
        {
          avgEngagementRate: NUMBER_SCHEMA,
          hour: NUMBER_SCHEMA,
          postCount: NUMBER_SCHEMA,
        },
        ['avgEngagementRate', 'hour', 'postCount'],
      ),
    ),
    topHooks: arraySchema(STRING_SCHEMA),
    topPerformers: arraySchema(PERFORMANCE_ITEM),
    weekOverWeekTrend: closedObjectSchema(
      {
        currentEngagement: NUMBER_SCHEMA,
        direction: enumSchema(['down', 'stable', 'up'] as const),
        percentageChange: NUMBER_SCHEMA,
        previousEngagement: NUMBER_SCHEMA,
      },
      [
        'currentEngagement',
        'direction',
        'percentageChange',
        'previousEngagement',
      ],
    ),
    worstPerformers: arraySchema(PERFORMANCE_ITEM),
  },
  [
    'avgEngagementByContentType',
    'avgEngagementByPlatform',
    'bestPostingTimes',
    'topHooks',
    'topPerformers',
    'weekOverWeekTrend',
    'worstPerformers',
  ],
);
const PATTERN_INSIGHT = closedObjectSchema(
  {
    avgEngagementRate: NUMBER_SCHEMA,
    avgPerformanceScore: NUMBER_SCHEMA,
    frequency: NUMBER_SCHEMA,
    pattern: STRING_SCHEMA,
  },
  ['avgEngagementRate', 'avgPerformanceScore', 'frequency', 'pattern'],
);
const CYCLE = closedObjectSchema(
  {
    cycleStats: closedObjectSchema(
      {
        avgEngagementRate: NUMBER_SCHEMA,
        avgPerformanceScore: NUMBER_SCHEMA,
        bottomEngagementRate: NUMBER_SCHEMA,
        cycleNumber: NUMBER_SCHEMA,
        dateRange: closedObjectSchema(
          { end: STRING_SCHEMA, start: STRING_SCHEMA },
          ['end', 'start'],
        ),
        topEngagementRate: NUMBER_SCHEMA,
        totalContent: NUMBER_SCHEMA,
      },
      [
        'avgEngagementRate',
        'avgPerformanceScore',
        'bottomEngagementRate',
        'cycleNumber',
        'dateRange',
        'topEngagementRate',
        'totalContent',
      ],
    ),
    nextBatchSuggestions: arraySchema(
      closedObjectSchema(
        {
          confidence: NUMBER_SCHEMA,
          prompt: STRING_SCHEMA,
          suggestedHook: STRING_SCHEMA,
          suggestedPlatform: STRING_SCHEMA,
          suggestedPostTime: STRING_SCHEMA,
        },
        [
          'confidence',
          'prompt',
          'suggestedHook',
          'suggestedPlatform',
          'suggestedPostTime',
        ],
      ),
    ),
    recommendations: arraySchema(
      closedObjectSchema(
        {
          basedOn: NUMBER_SCHEMA,
          category: enumSchema([
            'contentType',
            'hook',
            'platform',
            'style',
            'timing',
          ] as const),
          confidence: NUMBER_SCHEMA,
          recommendation: STRING_SCHEMA,
        },
        ['basedOn', 'category', 'confidence', 'recommendation'],
      ),
    ),
    topPatterns: closedObjectSchema(
      {
        contentTypes: arraySchema(
          closedObjectSchema(
            {
              avgEngagementRate: NUMBER_SCHEMA,
              contentType: STRING_SCHEMA,
              count: NUMBER_SCHEMA,
            },
            ['avgEngagementRate', 'contentType', 'count'],
          ),
        ),
        hooks: arraySchema(PATTERN_INSIGHT),
        platforms: arraySchema(
          closedObjectSchema(
            {
              avgEngagementRate: NUMBER_SCHEMA,
              count: NUMBER_SCHEMA,
              platform: STRING_SCHEMA,
            },
            ['avgEngagementRate', 'count', 'platform'],
          ),
        ),
        postingTimes: arraySchema(
          closedObjectSchema(
            {
              avgEngagementRate: NUMBER_SCHEMA,
              count: NUMBER_SCHEMA,
              hour: NUMBER_SCHEMA,
            },
            ['avgEngagementRate', 'count', 'hour'],
          ),
        ),
        sentimentStyles: arraySchema(PATTERN_INSIGHT),
      },
      ['contentTypes', 'hooks', 'platforms', 'postingTimes', 'sentimentStyles'],
    ),
  },
  ['cycleStats', 'nextBatchSuggestions', 'recommendations', 'topPatterns'],
);
const ANALYZE_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    options: closedObjectSchema({
      endDate: STRING_SCHEMA,
      startDate: STRING_SCHEMA,
      topN: NUMBER_SCHEMA,
    }),
    organizationId: STRING_SCHEMA,
  },
  ['brandId', 'organizationId'],
);
const BRAND_REQUEST = closedObjectSchema(
  { brandId: STRING_SCHEMA, organizationId: STRING_SCHEMA },
  ['brandId', 'organizationId'],
);
const ANALYSIS = closedObjectSchema(
  {
    insights: arraySchema(STRING_SCHEMA),
    optimizationCycle: CYCLE,
    summary: WEEKLY_SUMMARY,
  },
  ['insights', 'optimizationCycle', 'summary'],
);
const PROMPT_CONTEXT = closedObjectSchema(
  {
    performanceContext: STRING_SCHEMA,
    topPerformers: arraySchema(PERFORMANCE_ITEM),
    worstPerformers: arraySchema(PERFORMANCE_ITEM),
  },
  ['performanceContext', 'topPerformers', 'worstPerformers'],
);
const PROMPT_RESULT = closedObjectSchema(
  {
    confidenceScore: NUMBER_SCHEMA,
    optimizedPrompt: STRING_SCHEMA,
    reasoning: STRING_SCHEMA,
    suggestions: arraySchema(STRING_SCHEMA),
  },
  ['confidenceScore', 'optimizedPrompt', 'reasoning', 'suggestions'],
);
const AB_OUTCOME = closedObjectSchema(
  {
    groupId: STRING_SCHEMA,
    status: enumSchema(['insufficient_evidence', 'resolved'] as const),
    suggestionId: STRING_SCHEMA,
    winnerPostId: STRING_SCHEMA,
    winnerVariantId: STRING_SCHEMA,
  },
  ['groupId', 'status', 'suggestionId'],
);
const SUGGESTION_PAYLOAD: ActionJsonSchema = {
  oneOf: [
    closedObjectSchema({ hook: STRING_SCHEMA }, ['hook']),
    closedObjectSchema({ preferredFormat: STRING_SCHEMA }, ['preferredFormat']),
    closedObjectSchema({ preferredTime: STRING_SCHEMA }, ['preferredTime']),
  ],
};
const SUGGESTION = closedObjectSchema(
  {
    category: enumSchema(['format', 'hook', 'timing'] as const),
    confidence: NUMBER_SCHEMA,
    dataPoints: NUMBER_SCHEMA,
    id: STRING_SCHEMA,
    payload: SUGGESTION_PAYLOAD,
    suggestion: STRING_SCHEMA,
  },
  ['category', 'confidence', 'dataPoints', 'id', 'payload', 'suggestion'],
);
const RECOMMENDATIONS = closedObjectSchema(
  {
    abTestSuggestions: arraySchema(
      closedObjectSchema(
        {
          hypothesis: STRING_SCHEMA,
          variable: STRING_SCHEMA,
          variantA: STRING_SCHEMA,
          variantB: STRING_SCHEMA,
        },
        ['hypothesis', 'variable', 'variantA', 'variantB'],
      ),
    ),
    contentTypes: arraySchema(
      closedObjectSchema(
        {
          avgEngagement: NUMBER_SCHEMA,
          recommendation: STRING_SCHEMA,
          type: STRING_SCHEMA,
        },
        ['avgEngagement', 'recommendation', 'type'],
      ),
    ),
    general: arraySchema(
      closedObjectSchema(
        {
          basedOnDataPoints: NUMBER_SCHEMA,
          category: STRING_SCHEMA,
          priority: enumSchema(['high', 'low', 'medium'] as const),
          recommendation: STRING_SCHEMA,
        },
        ['basedOnDataPoints', 'category', 'priority', 'recommendation'],
      ),
    ),
    pipelineConfigs: arraySchema(
      closedObjectSchema({ reason: STRING_SCHEMA, suggestion: STRING_SCHEMA }, [
        'reason',
        'suggestion',
      ]),
    ),
    postingSchedule: arraySchema(
      closedObjectSchema(
        {
          bestDays: arraySchema(STRING_SCHEMA),
          bestHours: arraySchema(NUMBER_SCHEMA),
          platform: STRING_SCHEMA,
        },
        ['bestHours', 'platform'],
      ),
    ),
    validatedAbTests: arraySchema(AB_OUTCOME),
  },
  [
    'abTestSuggestions',
    'contentTypes',
    'general',
    'pipelineConfigs',
    'postingSchedule',
    'validatedAbTests',
  ],
);
const AB_SUGGESTION = closedObjectSchema(
  {
    hypothesis: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    suggestionId: STRING_SCHEMA,
    variable: STRING_SCHEMA,
    variantA: STRING_SCHEMA,
    variantB: STRING_SCHEMA,
  },
  ['hypothesis', 'platform', 'variable', 'variantA', 'variantB'],
);
const AB_EXECUTION_REQUEST = closedObjectSchema(
  {
    params: closedObjectSchema(
      {
        brandId: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
        suggestion: AB_SUGGESTION,
        userId: STRING_SCHEMA,
      },
      ['brandId', 'organizationId', 'suggestion', 'userId'],
    ),
  },
  ['params'],
);
const AB_ARM = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    description: STRING_SCHEMA,
    format: enumSchema(['standard'] as const),
    groupId: STRING_SCHEMA,
    ingredients: { items: JSON_DOCUMENT_SCHEMA, maxItems: 0, type: 'array' },
    label: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    source: enumSchema(['ab-test-suggestion'] as const),
    sourceActionId: STRING_SCHEMA,
    sourceWorkflowId: STRING_SCHEMA,
    sourceWorkflowName: enumSchema(['ab-test-suggestion'] as const),
    suggestionId: STRING_SCHEMA,
    targetExecutionState: enumSchema(['draft'] as const),
    userId: STRING_SCHEMA,
    variantId: STRING_SCHEMA,
    visibility: enumSchema(['public'] as const),
  },
  [
    'brandId',
    'description',
    'format',
    'groupId',
    'ingredients',
    'label',
    'organizationId',
    'platform',
    'source',
    'sourceActionId',
    'sourceWorkflowId',
    'sourceWorkflowName',
    'suggestionId',
    'targetExecutionState',
    'userId',
    'variantId',
    'visibility',
  ],
);
const AB_PLAN = closedObjectSchema(
  {
    groupId: STRING_SCHEMA,
    items: arraySchema(AB_ARM),
    suggestionId: STRING_SCHEMA,
  },
  ['groupId', 'items', 'suggestionId'],
);
const AB_RESOLUTION_ITEM = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    groupId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    status: enumSchema(['insufficient_evidence', 'resolved'] as const),
    suggestionId: STRING_SCHEMA,
    winnerPostId: STRING_SCHEMA,
    winnerVariantId: STRING_SCHEMA,
  },
  ['brandId', 'groupId', 'organizationId', 'status', 'suggestionId'],
);
const forEachResults = (result: ActionJsonSchema) =>
  closedObjectSchema(
    {
      count: INTEGER_SCHEMA,
      results: arraySchema(
        closedObjectSchema(
          { index: INTEGER_SCHEMA, provenance: JSON_DOCUMENT_SCHEMA, result },
          ['index', 'provenance', 'result'],
        ),
      ),
    },
    ['count', 'results'],
  );

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'content.optimization.ab-test.arm.create': {
    inputSchema: closedObjectSchema({ item: AB_ARM }, ['item']),
    outputSchema: closedObjectSchema({ postId: STRING_SCHEMA }, ['postId']),
  },
  'content.optimization.ab-test.execution.finalize': {
    inputSchema: closedObjectSchema(
      {
        arms: forEachResults(
          closedObjectSchema({ postId: STRING_SCHEMA }, ['postId']),
        ),
        plan: AB_PLAN,
      },
      ['arms', 'plan'],
    ),
    outputSchema: closedObjectSchema(
      {
        armCount: INTEGER_SCHEMA,
        groupId: STRING_SCHEMA,
        postIds: arraySchema(STRING_SCHEMA),
        suggestionId: STRING_SCHEMA,
      },
      ['armCount', 'groupId', 'postIds', 'suggestionId'],
    ),
  },
  'content.optimization.ab-test.execution.plan': {
    inputSchema: closedObjectSchema({ request: AB_EXECUTION_REQUEST }, [
      'request',
    ]),
    outputSchema: AB_PLAN,
  },
  'content.optimization.ab-test.outcome.persist': {
    inputSchema: closedObjectSchema({ item: AB_RESOLUTION_ITEM }, ['item']),
    outputSchema: AB_OUTCOME,
  },
  'content.optimization.ab-test.resolution.finalize': {
    inputSchema: closedObjectSchema({ outcomes: forEachResults(AB_OUTCOME) }, [
      'outcomes',
    ]),
    outputSchema: arraySchema(AB_OUTCOME),
  },
  'content.optimization.ab-test.resolution.plan': {
    inputSchema: closedObjectSchema({ request: BRAND_REQUEST }, ['request']),
    outputSchema: closedObjectSchema(
      { items: arraySchema(AB_RESOLUTION_ITEM) },
      ['items'],
    ),
  },
  'content.optimization.ab-test.validated.load': {
    inputSchema: closedObjectSchema({ request: BRAND_REQUEST }, ['request']),
    outputSchema: arraySchema(AB_OUTCOME),
  },
  'content.optimization.analysis.derive': {
    inputSchema: closedObjectSchema(
      { cycle: CYCLE, request: ANALYZE_REQUEST, summary: WEEKLY_SUMMARY },
      ['cycle', 'request', 'summary'],
    ),
    outputSchema: ANALYSIS,
  },
  'content.optimization.cycle.run': {
    inputSchema: closedObjectSchema({ request: ANALYZE_REQUEST }, ['request']),
    outputSchema: CYCLE,
  },
  'content.optimization.prompt.load-context': {
    inputSchema: closedObjectSchema({ request: BRAND_REQUEST }, ['request']),
    outputSchema: PROMPT_CONTEXT,
  },
  'content.optimization.prompt.optimize': {
    inputSchema: closedObjectSchema(
      {
        performance: PROMPT_CONTEXT,
        request: closedObjectSchema(
          {
            brandId: STRING_SCHEMA,
            organizationId: STRING_SCHEMA,
            originalPrompt: STRING_SCHEMA,
          },
          ['brandId', 'organizationId', 'originalPrompt'],
        ),
      },
      ['performance', 'request'],
    ),
    outputSchema: PROMPT_RESULT,
  },
  'content.optimization.recommendations.derive': {
    inputSchema: closedObjectSchema(
      {
        cycle: CYCLE,
        request: BRAND_REQUEST,
        summary: WEEKLY_SUMMARY,
        validatedAbTests: arraySchema(AB_OUTCOME),
      },
      ['cycle', 'request', 'summary', 'validatedAbTests'],
    ),
    outputSchema: RECOMMENDATIONS,
  },
  'content.optimization.suggestion.apply': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            brandId: STRING_SCHEMA,
            organizationId: STRING_SCHEMA,
            suggestionId: STRING_SCHEMA,
          },
          ['brandId', 'organizationId', 'suggestionId'],
        ),
        suggestions: arraySchema(SUGGESTION),
      },
      ['request', 'suggestions'],
    ),
    outputSchema: {
      oneOf: [
        closedObjectSchema(
          {
            applied: TRUE_SCHEMA,
            status: enumSchema(['applied'] as const),
            suggestionId: STRING_SCHEMA,
          },
          ['applied', 'status', 'suggestionId'],
        ),
        closedObjectSchema(
          {
            applied: FALSE_SCHEMA,
            reason: STRING_SCHEMA,
            status: enumSchema([
              'below_threshold',
              'not_auto_applicable',
              'not_found',
            ] as const),
            suggestionId: STRING_SCHEMA,
          },
          ['applied', 'reason', 'status', 'suggestionId'],
        ),
      ],
    },
  },
  'content.optimization.suggestions.generate': {
    inputSchema: closedObjectSchema({ request: BRAND_REQUEST }, ['request']),
    outputSchema: arraySchema(SUGGESTION),
  },
  'content.optimization.summary.load': {
    inputSchema: closedObjectSchema({ request: ANALYZE_REQUEST }, ['request']),
    outputSchema: WEEKLY_SUMMARY,
  },
  'content.optimization.winner.requeue': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            brandId: STRING_SCHEMA,
            organizationId: STRING_SCHEMA,
            winner: closedObjectSchema(
              {
                avgEngagementRate: NUMBER_SCHEMA,
                contentRunId: STRING_SCHEMA,
                format: STRING_SCHEMA,
                hashtags: arraySchema(STRING_SCHEMA),
                hook: STRING_SCHEMA,
                keywords: arraySchema(STRING_SCHEMA),
                platform: STRING_SCHEMA,
                variantId: STRING_SCHEMA,
              },
              ['variantId'],
            ),
          },
          ['organizationId', 'winner'],
        ),
      },
      ['request'],
    ),
    outputSchema: {
      oneOf: [
        closedObjectSchema(
          {
            reason: enumSchema([
              'no_signal',
              'winner_trend_enrichment_disabled',
            ] as const),
            requeued: FALSE_SCHEMA,
          },
          ['reason', 'requeued'],
        ),
        closedObjectSchema(
          {
            addedKeywords: arraySchema(STRING_SCHEMA),
            addedPlatforms: arraySchema(STRING_SCHEMA),
            requeued: TRUE_SCHEMA,
            trendPreferencesId: STRING_SCHEMA,
          },
          ['addedKeywords', 'addedPlatforms', 'requeued', 'trendPreferencesId'],
        ),
      ],
    },
  },
};

export function getContentOptimizationActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
