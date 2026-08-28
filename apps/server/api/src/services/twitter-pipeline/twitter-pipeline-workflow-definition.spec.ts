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
