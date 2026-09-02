import { describe, expect, it } from 'vitest';
import {
  AUTHOR_REPLY_ACTION_IDS,
  buildAuthorReplyDraftWorkflowDefinition,
  buildAuthorReplySendWorkflowDefinition,
} from './author-reply-workflow-definition';

function actionIds(
  definition: ReturnType<typeof buildAuthorReplyDraftWorkflowDefinition>,
): string[] {
  return definition.definition.nodes.map((node) =>
    String(node.data.config.actionId),
  );
}

describe('author reply workflow definitions', () => {
  it('drafts through intent, generation, and typed finalization actions', () => {
    expect(actionIds(buildAuthorReplyDraftWorkflowDefinition())).toEqual([
      AUTHOR_REPLY_ACTION_IDS.RESOLVE_INTENT,
      AUTHOR_REPLY_ACTION_IDS.GENERATE_DRAFT,
      AUTHOR_REPLY_ACTION_IDS.FINALIZE_DRAFT,
    ]);
  });

  it('sends through account resolution, provider delivery, and durable finalization', () => {
    expect(actionIds(buildAuthorReplySendWorkflowDefinition())).toEqual([
      AUTHOR_REPLY_ACTION_IDS.RESOLVE_INTENT,
      AUTHOR_REPLY_ACTION_IDS.RESOLVE_CREDENTIAL,
      AUTHOR_REPLY_ACTION_IDS.GENERATE_DRAFT,
      AUTHOR_REPLY_ACTION_IDS.SEND,
      AUTHOR_REPLY_ACTION_IDS.FINALIZE_SEND,
    ]);
  });
});
