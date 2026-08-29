import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const ARTICLE_DRAFT = closedObjectSchema(
  {
    content: STRING_SCHEMA,
    label: STRING_SCHEMA,
    slug: STRING_SCHEMA,
    summary: STRING_SCHEMA,
    tags: arraySchema(STRING_SCHEMA),
  },
  ['content', 'label', 'slug', 'summary'],
);
const ARTICLE_DRAFT_FIELDS = closedObjectSchema(
  { content: STRING_SCHEMA, label: STRING_SCHEMA, summary: STRING_SCHEMA },
  ['content', 'label', 'summary'],
);
const ARTICLE_REVIEW = closedObjectSchema(
  {
    issues: arraySchema(JSON_DOCUMENT_SCHEMA),
    revisionInstructions: STRING_SCHEMA,
    score: NUMBER_SCHEMA,
    strengths: arraySchema(STRING_SCHEMA),
    summary: STRING_SCHEMA,
  },
  ['issues', 'revisionInstructions', 'score', 'strengths', 'summary'],
);
const ARTICLE_CONTEXT = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    category: STRING_SCHEMA,
    generateDto: JSON_DOCUMENT_SCHEMA,
    generationType: STRING_SCHEMA,
    harnessContext: JSON_DOCUMENT_SCHEMA,
    maxCount: INTEGER_SCHEMA,
    modelConfig: JSON_DOCUMENT_SCHEMA,
    organizationId: STRING_SCHEMA,
    parseFailureLabel: STRING_SCHEMA,
    prompt: STRING_SCHEMA,
    systemPromptTemplate: STRING_SCHEMA,
    textPromptTemplate: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  [
    'brandId',
    'category',
    'generateDto',
    'generationType',
    'harnessContext',
    'modelConfig',
    'organizationId',
    'parseFailureLabel',
    'prompt',
    'systemPromptTemplate',
    'textPromptTemplate',
    'userId',
  ],
);
const ARTICLE_WORK_ITEM = closedObjectSchema(
  { context: ARTICLE_CONTEXT, draft: ARTICLE_DRAFT },
  ['context', 'draft'],
);
const ARTICLE_REVIEW_STATE = closedObjectSchema(
  {
    billedCredits: NUMBER_SCHEMA,
    context: ARTICLE_CONTEXT,
    draft: ARTICLE_DRAFT,
    review: ARTICLE_REVIEW,
  },
  ['billedCredits', 'context', 'draft', 'review'],
);
const ARTICLE_REVISION_STATE = closedObjectSchema(
  {
    billedCredits: NUMBER_SCHEMA,
    context: ARTICLE_CONTEXT,
    draft: ARTICLE_DRAFT,
    review: ARTICLE_REVIEW,
    updated: ARTICLE_DRAFT_FIELDS,
  },
  ['billedCredits', 'context', 'draft', 'review', 'updated'],
);
const ARTICLE_RESULT = closedObjectSchema(
  { article: JSON_DOCUMENT_SCHEMA, billedCredits: NUMBER_SCHEMA },
  ['article', 'billedCredits'],
);
const ARTICLE_GENERATION_RESULT = closedObjectSchema(
  { articles: arraySchema(JSON_DOCUMENT_SCHEMA), billedCredits: NUMBER_SCHEMA },
  ['articles', 'billedCredits'],
);
const ARTICLE_FINAL_STATE = closedObjectSchema(
  {
    articles: arraySchema(JSON_DOCUMENT_SCHEMA),
    billedCredits: NUMBER_SCHEMA,
    context: ARTICLE_CONTEXT,
    headerPromptItems: arraySchema(
      closedObjectSchema({ articleId: STRING_SCHEMA }, ['articleId']),
    ),
  },
  ['articles', 'billedCredits', 'context', 'headerPromptItems'],
);
const EXISTING_REVIEW_CONTEXT = closedObjectSchema(
  {
    article: JSON_DOCUMENT_SCHEMA,
    focus: STRING_SCHEMA,
    harnessContext: JSON_DOCUMENT_SCHEMA,
    modelConfig: JSON_DOCUMENT_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['article', 'harnessContext', 'modelConfig', 'organizationId'],
);
const HEADER_STATE = closedObjectSchema(
  {
    article: JSON_DOCUMENT_SCHEMA,
    articleId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    prompt: STRING_SCHEMA,
  },
  ['article', 'articleId', 'organizationId'],
);
const HEADER_PROMPT_STATE = closedObjectSchema(
  {
    article: JSON_DOCUMENT_SCHEMA,
    articleId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    prompt: STRING_SCHEMA,
  },
  ['article', 'articleId', 'organizationId', 'prompt'],
);

const GENERATED_CONTENT = closedObjectSchema(
  {
    body: STRING_SCHEMA,
    content: STRING_SCHEMA,
    cta: STRING_SCHEMA,
    hashtags: arraySchema(STRING_SCHEMA),
    hook: STRING_SCHEMA,
    patternId: STRING_SCHEMA,
    patternUsed: STRING_SCHEMA,
  },
  ['content', 'hashtags', 'patternUsed'],
);
const CONTENT_CONTEXT_PROPERTIES = {
  dto: JSON_DOCUMENT_SCHEMA,
  organizationId: STRING_SCHEMA,
  playbookInsights: JSON_DOCUMENT_SCHEMA,
  systemPrompt: STRING_SCHEMA,
} as const;
const CONTENT_CONTEXT = closedObjectSchema(CONTENT_CONTEXT_PROPERTIES, [
  'dto',
  'organizationId',
]);
const CONTENT_ITEM_PROPERTIES = {
  ...CONTENT_CONTEXT_PROPERTIES,
  pattern: JSON_DOCUMENT_SCHEMA,
  trackUsage: BOOLEAN_SCHEMA,
} as const;
const CONTENT_ITEM = closedObjectSchema(CONTENT_ITEM_PROPERTIES, [
  'dto',
  'organizationId',
  'pattern',
  'trackUsage',
]);
const GENERATED_PATTERN_STATE = closedObjectSchema(
  { ...CONTENT_ITEM_PROPERTIES, generated: GENERATED_CONTENT },
  ['dto', 'generated', 'organizationId', 'pattern', 'trackUsage'],
);
const CONTENT_PLAN = closedObjectSchema(
  { hasPatterns: BOOLEAN_SCHEMA, items: arraySchema(CONTENT_ITEM) },
  ['hasPatterns', 'items'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'article.generation.finalize': {
    inputSchema: closedObjectSchema(
      { drafts: JSON_DOCUMENT_SCHEMA, generation: JSON_DOCUMENT_SCHEMA },
      ['drafts', 'generation'],
    ),
    outputSchema: ARTICLE_FINAL_STATE,
  },
  'article.generation.generate-drafts': {
    inputSchema: closedObjectSchema({ state: ARTICLE_CONTEXT }, ['state']),
    outputSchema: closedObjectSchema(
      {
        billedCredits: NUMBER_SCHEMA,
        context: ARTICLE_CONTEXT,
        items: arraySchema(ARTICLE_WORK_ITEM),
      },
      ['billedCredits', 'context', 'items'],
    ),
  },
  'article.generation.invalidate-cache': {
    inputSchema: closedObjectSchema(
      {
        headerFailure: JSON_DOCUMENT_SCHEMA,
        headerPrompts: JSON_DOCUMENT_SCHEMA,
        state: ARTICLE_FINAL_STATE,
      },
      ['state'],
    ),
    outputSchema: ARTICLE_GENERATION_RESULT,
  },
  'article.generation.load-context': {
    inputSchema: closedObjectSchema(
      { brandId: STRING_SCHEMA, dto: JSON_DOCUMENT_SCHEMA },
      ['brandId', 'dto'],
    ),
    outputSchema: ARTICLE_CONTEXT,
  },
  'article.generation.persist-draft': {
    inputSchema: closedObjectSchema({ state: ARTICLE_REVISION_STATE }, [
      'state',
    ]),
    outputSchema: ARTICLE_RESULT,
  },
  'article.generation.review-draft': {
    inputSchema: closedObjectSchema({ item: ARTICLE_WORK_ITEM }, ['item']),
    outputSchema: ARTICLE_REVIEW_STATE,
  },
  'article.generation.revise-draft': {
    inputSchema: closedObjectSchema({ state: ARTICLE_REVIEW_STATE }, ['state']),
    outputSchema: ARTICLE_REVISION_STATE,
  },
  'article.header-prompt.generate': {
    inputSchema: closedObjectSchema({ state: HEADER_STATE }, ['state']),
    outputSchema: HEADER_PROMPT_STATE,
  },
  'article.header-prompt.load': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema({ articleId: STRING_SCHEMA }, [
          'articleId',
        ]),
      },
      ['request'],
    ),
    outputSchema: HEADER_STATE,
  },
  'article.header-prompt.persist': {
    inputSchema: closedObjectSchema({ state: HEADER_PROMPT_STATE }, ['state']),
    outputSchema: STRING_SCHEMA,
  },
  'article.review': {
    inputSchema: closedObjectSchema({ state: EXISTING_REVIEW_CONTEXT }, [
      'state',
    ]),
    outputSchema: closedObjectSchema(
      { billedCredits: NUMBER_SCHEMA, review: ARTICLE_REVIEW },
      ['billedCredits', 'review'],
    ),
  },
  'article.review.load-context': {
    inputSchema: closedObjectSchema(
      { articleId: STRING_SCHEMA, focus: STRING_SCHEMA },
      ['articleId'],
    ),
    outputSchema: EXISTING_REVIEW_CONTEXT,
  },
  'content-intelligence.finalize': {
    inputSchema: closedObjectSchema(
      {
        dto: JSON_DOCUMENT_SCHEMA,
        freeformResults: arraySchema(GENERATED_CONTENT),
        patternResults: JSON_DOCUMENT_SCHEMA,
      },
      ['dto'],
    ),
    outputSchema: arraySchema(GENERATED_CONTENT),
  },
  'content-intelligence.generate': {
    inputSchema: closedObjectSchema({ item: CONTENT_ITEM }, ['item']),
    outputSchema: GENERATED_PATTERN_STATE,
  },
  'content-intelligence.generate-freeform': {
    inputSchema: closedObjectSchema(
      {
        condition: BOOLEAN_SCHEMA,
        dto: JSON_DOCUMENT_SCHEMA,
        state: CONTENT_CONTEXT,
      },
      ['dto', 'state'],
    ),
    outputSchema: arraySchema(GENERATED_CONTENT),
  },
  'content-intelligence.generate-linkedin-pattern': {
    inputSchema: closedObjectSchema({ item: CONTENT_ITEM }, ['item']),
    outputSchema: GENERATED_PATTERN_STATE,
  },
  'content-intelligence.load-context': {
    inputSchema: closedObjectSchema({ dto: JSON_DOCUMENT_SCHEMA }, ['dto']),
    outputSchema: CONTENT_CONTEXT,
  },
  'content-intelligence.load-patterns': {
    inputSchema: closedObjectSchema({ dto: JSON_DOCUMENT_SCHEMA }, ['dto']),
    outputSchema: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  'content-intelligence.plan': {
    inputSchema: closedObjectSchema(
      {
        context: CONTENT_CONTEXT,
        dto: JSON_DOCUMENT_SCHEMA,
        patterns: arraySchema(JSON_DOCUMENT_SCHEMA),
      },
      ['context', 'dto', 'patterns'],
    ),
    outputSchema: CONTENT_PLAN,
  },
  'content-intelligence.track-pattern': {
    inputSchema: closedObjectSchema({ state: GENERATED_PATTERN_STATE }, [
      'state',
    ]),
    outputSchema: GENERATED_CONTENT,
  },
};

export function getEditorialActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
