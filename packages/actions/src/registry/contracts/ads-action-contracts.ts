import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const REQUEST = closedObjectSchema(
  {
    adAccountId: STRING_SCHEMA,
    adSetId: STRING_SCHEMA,
    bodyCopies: arraySchema(STRING_SCHEMA),
    brandId: STRING_SCHEMA,
    callToAction: STRING_SCHEMA,
    campaignId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    creativeSource: enumSchema([
      'ai-generated',
      'content-library',
      'manual-upload',
    ] as const),
    headlines: arraySchema(STRING_SCHEMA),
    images: arraySchema(STRING_SCHEMA),
    jobId: STRING_SCHEMA,
    linkUrl: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    videos: arraySchema(STRING_SCHEMA),
  },
  [
    'adAccountId',
    'adSetId',
    'bodyCopies',
    'campaignId',
    'credentialId',
    'creativeSource',
    'headlines',
    'images',
    'jobId',
    'linkUrl',
    'organizationId',
    'videos',
  ],
);
const MEDIA_ITEM = closedObjectSchema(
  {
    jobId: STRING_SCHEMA,
    mediaType: enumSchema(['image', 'video'] as const),
    organizationId: STRING_SCHEMA,
    request: REQUEST,
    sourceUrl: STRING_SCHEMA,
  },
  ['jobId', 'mediaType', 'organizationId', 'request', 'sourceUrl'],
);
const UPLOADED_MEDIA = closedObjectSchema(
  {
    jobId: STRING_SCHEMA,
    mediaRef: STRING_SCHEMA,
    mediaType: enumSchema(['image', 'video'] as const),
    organizationId: STRING_SCHEMA,
    request: REQUEST,
    sourceUrl: STRING_SCHEMA,
  },
  ['jobId', 'mediaRef', 'mediaType', 'organizationId', 'request', 'sourceUrl'],
);
const PERMUTATION = closedObjectSchema(
  {
    body: STRING_SCHEMA,
    headline: STRING_SCHEMA,
    index: INTEGER_SCHEMA,
    mediaRef: STRING_SCHEMA,
    mediaType: enumSchema(['image', 'video'] as const),
    request: REQUEST,
  },
  ['body', 'headline', 'index', 'mediaRef', 'mediaType', 'request'],
);
const CREATION_OUTCOME = closedObjectSchema(
  {
    index: INTEGER_SCHEMA,
    status: enumSchema(['completed', 'failed'] as const),
  },
  ['index', 'status'],
);
const forEachResults = (result: ActionJsonSchema) =>
  closedObjectSchema(
    {
      count: INTEGER_SCHEMA,
      results: arraySchema(
        closedObjectSchema(
          {
            index: INTEGER_SCHEMA,
            provenance: JSON_DOCUMENT_SCHEMA,
            result,
          },
          ['index', 'provenance', 'result'],
        ),
      ),
    },
    ['count', 'results'],
  );

const CREDENTIAL_REFERENCE = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    externalHandle: STRING_SCHEMA,
  },
  ['brandId', 'credentialId'],
);
const PROVIDER_ROWS = (provider: 'google' | 'meta' | 'tiktok') =>
  closedObjectSchema(
    {
      provider: enumSchema([provider] as const),
      rows: arraySchema(JSON_DOCUMENT_SCHEMA),
    },
    ['provider', 'rows'],
  );
const PERFORMANCE_RECORD = closedObjectSchema(
  {
    bodyText: STRING_SCHEMA,
    campaignName: STRING_SCHEMA,
    campaignObjective: STRING_SCHEMA,
    campaignStatus: STRING_SCHEMA,
    clicks: NUMBER_SCHEMA,
    conversions: NUMBER_SCHEMA,
    cpa: NUMBER_SCHEMA,
    cpc: NUMBER_SCHEMA,
    cpm: NUMBER_SCHEMA,
    ctaText: STRING_SCHEMA,
    ctr: NUMBER_SCHEMA,
    currency: STRING_SCHEMA,
    dataConfidence: NUMBER_SCHEMA,
    date: STRING_SCHEMA,
    externalAccountId: STRING_SCHEMA,
    externalAdId: STRING_SCHEMA,
    externalAdSetId: STRING_SCHEMA,
    externalCampaignId: STRING_SCHEMA,
    granularity: enumSchema(['account', 'ad', 'adset', 'campaign'] as const),
    headlineText: STRING_SCHEMA,
    impressions: NUMBER_SCHEMA,
    platform: enumSchema(['google-ads', 'meta', 'tiktok'] as const),
    revenue: NUMBER_SCHEMA,
    roas: NUMBER_SCHEMA,
    spend: NUMBER_SCHEMA,
  },
  [
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'currency',
    'dataConfidence',
    'date',
    'externalAccountId',
    'granularity',
    'impressions',
    'platform',
    'spend',
  ],
);
const PERFORMANCE_ENVELOPE = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    records: arraySchema(PERFORMANCE_RECORD),
  },
  ['brandId', 'credentialId', 'organizationId', 'records'],
);
const NORMALIZED_PERFORMANCE = closedObjectSchema(
  { performance: arraySchema(PERFORMANCE_ENVELOPE) },
  ['performance'],
);
const OPTIMIZATION_CONFIG = closedObjectSchema(
  {
    analysisWindow: NUMBER_SCHEMA,
    maxBudgetIncreasePct: NUMBER_SCHEMA,
    maxCpm: NUMBER_SCHEMA,
    maxDailyBudgetPerCampaign: NUMBER_SCHEMA,
    maxTotalDailySpend: NUMBER_SCHEMA,
    minCtr: NUMBER_SCHEMA,
    minImpressions: NUMBER_SCHEMA,
    minRoas: NUMBER_SCHEMA,
    minSpend: NUMBER_SCHEMA,
  },
  [
    'analysisWindow',
    'maxBudgetIncreasePct',
    'maxCpm',
    'maxDailyBudgetPerCampaign',
    'maxTotalDailySpend',
    'minCtr',
    'minImpressions',
    'minRoas',
    'minSpend',
  ],
);
const OPTIMIZATION_STATE = closedObjectSchema(
  {
    config: OPTIMIZATION_CONFIG,
    runId: STRING_SCHEMA,
    startedAt: STRING_SCHEMA,
  },
  ['config', 'runId', 'startedAt'],
);
const RECOMMENDATION = closedObjectSchema(
  {
    entityId: STRING_SCHEMA,
    entityName: STRING_SCHEMA,
    entityType: enumSchema(['ad'] as const),
    expiresAt: STRING_SCHEMA,
    metrics: closedObjectSchema(
      {
        clicks: NUMBER_SCHEMA,
        cpm: NUMBER_SCHEMA,
        ctr: NUMBER_SCHEMA,
        impressions: NUMBER_SCHEMA,
        roas: NUMBER_SCHEMA,
        spend: NUMBER_SCHEMA,
      },
      ['clicks', 'cpm', 'ctr', 'impressions', 'roas', 'spend'],
    ),
    organizationId: STRING_SCHEMA,
    reason: STRING_SCHEMA,
    recommendationType: enumSchema([
      'budget_increase',
      'pause',
      'promote',
    ] as const),
    runDate: STRING_SCHEMA,
    runId: STRING_SCHEMA,
    status: enumSchema(['pending'] as const),
    suggestedAction: closedObjectSchema(
      { budgetIncreasePct: NUMBER_SCHEMA, maxDailyBudget: NUMBER_SCHEMA },
      ['budgetIncreasePct', 'maxDailyBudget'],
    ),
  },
  [
    'entityId',
    'entityName',
    'entityType',
    'expiresAt',
    'metrics',
    'organizationId',
    'reason',
    'recommendationType',
    'runDate',
    'runId',
    'status',
  ],
);
const ANALYSIS = closedObjectSchema(
  {
    adsAnalyzed: INTEGER_SCHEMA,
    recommendations: arraySchema(RECOMMENDATION),
    runId: STRING_SCHEMA,
  },
  ['adsAnalyzed', 'recommendations', 'runId'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'ads.bulk-upload.build-media-items': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: closedObjectSchema({ items: arraySchema(MEDIA_ITEM) }, [
      'items',
    ]),
  },
  'ads.bulk-upload.build-permutations': {
    inputSchema: closedObjectSchema(
      { request: REQUEST, uploads: forEachResults(UPLOADED_MEDIA) },
      ['request', 'uploads'],
    ),
    outputSchema: closedObjectSchema({ items: arraySchema(PERMUTATION) }, [
      'items',
    ]),
  },
  'ads.bulk-upload.claim': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: REQUEST,
  },
  'ads.bulk-upload.create-ad': {
    inputSchema: closedObjectSchema({ item: PERMUTATION }, ['item']),
    outputSchema: CREATION_OUTCOME,
  },
  'ads.bulk-upload.fail': {
    inputSchema: closedObjectSchema(
      { failure: JSON_DOCUMENT_SCHEMA, request: REQUEST },
      ['failure', 'request'],
    ),
    outputSchema: closedObjectSchema(
      { jobId: STRING_SCHEMA, status: enumSchema(['failed'] as const) },
      ['jobId', 'status'],
    ),
  },
  'ads.bulk-upload.finalize': {
    inputSchema: closedObjectSchema(
      { outcomes: forEachResults(CREATION_OUTCOME), request: REQUEST },
      ['outcomes', 'request'],
    ),
    outputSchema: closedObjectSchema(
      {
        completed: INTEGER_SCHEMA,
        failed: INTEGER_SCHEMA,
        jobId: STRING_SCHEMA,
        status: enumSchema(['completed', 'failed', 'partial'] as const),
      },
      ['completed', 'failed', 'jobId', 'status'],
    ),
  },
  'ads.bulk-upload.upload-media': {
    inputSchema: closedObjectSchema({ item: MEDIA_ITEM }, ['item']),
    outputSchema: UPLOADED_MEDIA,
  },
  'ads.credentials.discover': {
    inputSchema: closedObjectSchema(
      { platform: enumSchema(['facebook', 'google_ads', 'tiktok'] as const) },
      ['platform'],
    ),
    outputSchema: closedObjectSchema(
      { credentials: arraySchema(CREDENTIAL_REFERENCE) },
      ['credentials'],
    ),
  },
  'ads.google.performance.fetch': {
    inputSchema: closedObjectSchema({ item: CREDENTIAL_REFERENCE }, ['item']),
    outputSchema: PROVIDER_ROWS('google'),
  },
  'ads.google.performance.normalize': {
    inputSchema: closedObjectSchema({ providerData: PROVIDER_ROWS('google') }, [
      'providerData',
    ]),
    outputSchema: NORMALIZED_PERFORMANCE,
  },
  'ads.meta.performance.fetch': {
    inputSchema: closedObjectSchema({ item: CREDENTIAL_REFERENCE }, ['item']),
    outputSchema: PROVIDER_ROWS('meta'),
  },
  'ads.meta.performance.normalize': {
    inputSchema: closedObjectSchema({ providerData: PROVIDER_ROWS('meta') }, [
      'providerData',
    ]),
    outputSchema: NORMALIZED_PERFORMANCE,
  },
  'ads.optimization.analyze': {
    inputSchema: closedObjectSchema({ optimization: OPTIMIZATION_STATE }, [
      'optimization',
    ]),
    outputSchema: ANALYSIS,
  },
  'ads.optimization.finalize': {
    inputSchema: closedObjectSchema(
      {
        analysis: ANALYSIS,
        optimization: OPTIMIZATION_STATE,
        persistence: closedObjectSchema(
          { recommendationsGenerated: INTEGER_SCHEMA },
          ['recommendationsGenerated'],
        ),
      },
      ['analysis', 'optimization', 'persistence'],
    ),
    outputSchema: closedObjectSchema(
      {
        adsAnalyzed: INTEGER_SCHEMA,
        recommendationsGenerated: INTEGER_SCHEMA,
        runId: STRING_SCHEMA,
        status: enumSchema(['completed'] as const),
      },
      ['adsAnalyzed', 'recommendationsGenerated', 'runId', 'status'],
    ),
  },
  'ads.optimization.load-config': {
    inputSchema: closedObjectSchema({}),
    outputSchema: OPTIMIZATION_STATE,
  },
  'ads.optimization.persist-recommendations': {
    inputSchema: closedObjectSchema({ analysis: ANALYSIS }, ['analysis']),
    outputSchema: closedObjectSchema(
      { recommendationsGenerated: INTEGER_SCHEMA },
      ['recommendationsGenerated'],
    ),
  },
  'ads.performance.persist': {
    inputSchema: closedObjectSchema({ performance: NORMALIZED_PERFORMANCE }, [
      'performance',
    ]),
    outputSchema: closedObjectSchema({ persisted: INTEGER_SCHEMA }, [
      'persisted',
    ]),
  },
  'ads.tiktok.performance.fetch': {
    inputSchema: closedObjectSchema({ item: CREDENTIAL_REFERENCE }, ['item']),
    outputSchema: PROVIDER_ROWS('tiktok'),
  },
  'ads.tiktok.performance.normalize': {
    inputSchema: closedObjectSchema({ providerData: PROVIDER_ROWS('tiktok') }, [
      'providerData',
    ]),
    outputSchema: NORMALIZED_PERFORMANCE,
  },
};

export function getAdsActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
