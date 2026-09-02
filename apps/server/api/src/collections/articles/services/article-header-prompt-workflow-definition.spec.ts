import {
  ARTICLE_HEADER_PROMPT_ACTION_IDS,
  ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
  buildArticleHeaderPromptWorkflowDefinition,
} from '@api/collections/articles/services/article-header-prompt-workflow-definition';
import { buildArticleGenerationWorkflowDefinition } from '@api/collections/articles/services/articles.service';

describe('article header prompt workflow definitions', () => {
  it('separates loading, generation, and persistence', () => {
    const definition = buildArticleHeaderPromptWorkflowDefinition();

    expect(definition.canonicalId).toBe(ARTICLE_HEADER_PROMPT_WORKFLOW_ID);
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      ARTICLE_HEADER_PROMPT_ACTION_IDS.LOAD,
      ARTICLE_HEADER_PROMPT_ACTION_IDS.GENERATE,
      ARTICLE_HEADER_PROMPT_ACTION_IDS.PERSIST,
    ]);
  });

  it('reuses the header workflow conditionally from article generation', () => {
    const definition = buildArticleGenerationWorkflowDefinition();
    const headerFanOut = definition.definition.nodes.find(
      (node) => node.id === 'generate-header-prompts',
    );

    expect(headerFanOut?.data.config.actionId).toBe('workflow.for-each');
    expect(headerFanOut?.data.config.parameters).toMatchObject({
      childWorkflowId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
      maxConcurrency: 1,
      mode: 'await',
    });
    expect(definition.definition.edges).toContainEqual(
      expect.objectContaining({
        source: 'finalize-generation',
        sourceHandle: 'headerPromptItems',
        target: 'generate-header-prompts',
      }),
    );
  });
});
