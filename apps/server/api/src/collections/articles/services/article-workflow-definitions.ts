import { ARTICLE_HEADER_PROMPT_WORKFLOW_ID } from '@api/collections/articles/services/article-header-prompt-workflow-definition';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const ARTICLE_GENERATION_TOOL_ID = 'create_article';
export const ARTICLE_REVIEW_ACTION_ID = 'article.review';
export const ARTICLE_FINALIZE_GENERATION_ACTION_ID =
  'article.generation.finalize';
export const ARTICLE_GENERATE_DRAFTS_ACTION_ID =
  'article.generation.generate-drafts';
export const ARTICLE_INVALIDATE_GENERATION_ACTION_ID =
  'article.generation.invalidate-cache';
export const ARTICLE_LOAD_GENERATION_ACTION_ID =
  'article.generation.load-context';
export const ARTICLE_PERSIST_DRAFT_ACTION_ID =
  'article.generation.persist-draft';
export const ARTICLE_REVISE_DRAFT_ACTION_ID = 'article.generation.revise-draft';
export const ARTICLE_REVIEW_DRAFT_ACTION_ID = 'article.generation.review-draft';
export const ARTICLE_LOAD_REVIEW_ACTION_ID = 'article.review.load-context';
export const ARTICLE_GENERATION_WORKFLOW_ID = 'article.generation';
export const ARTICLE_GENERATION_CHILD_WORKFLOW_ID = 'article.generation.one';
export const ARTICLE_REVIEW_WORKFLOW_ID = 'article.review.workflow';

export function buildArticleGenerationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_GENERATION_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-generate',
          source: 'load-context',
          target: 'generate-drafts',
          targetHandle: 'state',
        },
        {
          id: 'generate-items',
          source: 'generate-drafts',
          sourceHandle: 'items',
          target: 'process-drafts',
          targetHandle: 'items',
        },
        {
          id: 'generate-finalize',
          source: 'generate-drafts',
          target: 'finalize-generation',
          targetHandle: 'generation',
        },
        {
          id: 'drafts-finalize',
          source: 'process-drafts',
          target: 'finalize-generation',
          targetHandle: 'drafts',
        },
        {
          id: 'finalize-header',
          source: 'finalize-generation',
          sourceHandle: 'headerPromptItems',
          target: 'generate-header-prompts',
          targetHandle: 'items',
        },
        {
          id: 'finalize-invalidate',
          source: 'finalize-generation',
          target: 'invalidate-cache',
          targetHandle: 'state',
        },
        {
          id: 'header-invalidate',
          source: 'generate-header-prompts',
          target: 'invalidate-cache',
          targetHandle: 'headerPrompts',
        },
        {
          id: 'header-failure-invalidate',
          source: 'generate-header-prompts',
          sourceHandle: 'failure',
          target: 'invalidate-cache',
          targetHandle: 'headerFailure',
        },
      ],
      inputVariables: [
        { key: 'dto', label: 'Article request', required: true, type: 'json' },
        { key: 'brandId', label: 'Brand', required: true, type: 'string' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_LOAD_GENERATION_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['dto', 'brandId'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_GENERATE_DRAFTS_ACTION_ID,
          id: 'generate-drafts',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'process-drafts',
          parameters: {
            childWorkflowId: ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
            itemInputKey: 'item',
            maxConcurrency: 3,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_FINALIZE_GENERATION_ACTION_ID,
          id: 'finalize-generation',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-header-prompts',
          parameters: {
            childWorkflowId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
            itemInputKey: 'request',
            maxConcurrency: 1,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_INVALIDATE_GENERATION_ACTION_ID,
          id: 'invalidate-cache',
        }),
      ],
    },
    description:
      'Loads generation context, generates drafts, and processes each article through review, revision, and persistence.',
    label: 'Article Generation',
    resultNodeId: 'invalidate-cache',
    version: 1,
  };
}

export function articleGenerationChildWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'review-revise',
          source: 'review-draft',
          target: 'revise-draft',
          targetHandle: 'state',
        },
        {
          id: 'revise-persist',
          source: 'revise-draft',
          target: 'persist-draft',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'item', label: 'Article draft', required: true, type: 'json' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_REVIEW_DRAFT_ACTION_ID,
          id: 'review-draft',
          inputVariableKeys: ['item'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_REVISE_DRAFT_ACTION_ID,
          id: 'revise-draft',
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_PERSIST_DRAFT_ACTION_ID,
          id: 'persist-draft',
        }),
      ],
    },
    description: 'Reviews, revises, and persists one generated article draft.',
    label: 'Generate One Article',
    resultNodeId: 'persist-draft',
    version: 1,
  };
}

export function articleReviewWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_REVIEW_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-review',
          source: 'load-context',
          target: 'review-article',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'articleId', label: 'Article', required: true, type: 'string' },
        {
          key: 'focus',
          label: 'Review focus',
          required: false,
          type: 'string',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_LOAD_REVIEW_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['articleId', 'focus'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_REVIEW_ACTION_ID,
          id: 'review-article',
        }),
      ],
    },
    description: 'Loads article context and generates a structured review.',
    label: 'Article Review',
    resultNodeId: 'review-article',
    version: 1,
  };
}
