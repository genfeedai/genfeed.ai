import { describe, expect, it } from 'vitest';
import {
  buildTwitterDraftWorkflowDefinition,
  buildTwitterPublishWorkflowDefinition,
  buildTwitterSearchWorkflowDefinition,
  TWITTER_PIPELINE_ACTION_IDS,
} from './twitter-pipeline-workflow-definition';

function actionIds(
  definition: ReturnType<typeof buildTwitterDraftWorkflowDefinition>,
): string[] {
  return definition.definition.nodes.map((node) =>
    String(node.data.config.actionId),
  );
}

describe('twitter pipeline workflow definitions', () => {
  it.each([
    {
      graph: buildTwitterSearchWorkflowDefinition(),
      moduleId: 'discovery',
      completion: undefined,
    },
    {
      graph: buildTwitterDraftWorkflowDefinition(),
      moduleId: 'discovery',
      completion: ['parse-drafts'],
    },
    {
      graph: buildTwitterPublishWorkflowDefinition(),
      moduleId: 'publishing',
      completion: undefined,
    },
  ])(
    '$graph.canonicalId owns $moduleId and only exempts a pure draft projection',
    ({ graph, moduleId, completion }) => {
      expect(graph.organizationModule).toBe(moduleId);
      expect(graph.moduleCompletionNodeIds).toEqual(completion);
      if (completion) {
        expect(
          graph.definition.nodes.find((node) => node.id === completion[0])?.data
            .config.actionId,
        ).toBe(TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE);
        expect(
          graph.definition.edges.some((edge) => edge.source === completion[0]),
        ).toBe(false);
      }
    },
  );
  it('keeps provider search as one atomic action workflow', () => {
    expect(actionIds(buildTwitterSearchWorkflowDefinition())).toEqual([
      TWITTER_PIPELINE_ACTION_IDS.SEARCH_RECENT,
    ]);
  });

  it('separates prompt construction, generation, and parsing', () => {
    expect(actionIds(buildTwitterDraftWorkflowDefinition())).toEqual([
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_BUILD_PROMPT,
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_GENERATE,
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
    ]);
  });

  it('separates credential resolution from provider delivery', () => {
    expect(actionIds(buildTwitterPublishWorkflowDefinition())).toEqual([
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_RESOLVE_CREDENTIAL,
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_SEND,
    ]);
  });
});
