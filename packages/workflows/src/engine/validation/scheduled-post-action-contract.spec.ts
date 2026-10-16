import { getScheduledPostActionContract } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  type ActionContractProvenance,
  compileActionContract,
} from './action-contract';

const PROVENANCE: ActionContractProvenance = {
  nodeId: 'scheduled-post',
  runId: 'run-7054',
  workflowId: 'scheduled-post.publish',
  workflowVersionId: 'v1',
};

const SCHEDULED_POST_ACTION_IDS = [
  'scheduled-post.claim',
  'scheduled-post.deliver',
  'scheduled-post.finalize',
  'scheduled-post.fail',
] as const;

const SUPPORTED_SOURCES = [
  'manual_retry',
  'publish_now',
  'scheduled_sweep',
  'tiktok_app',
] as const;

const PUBLISH_RESULT = {
  executionState: 'draft',
  externalId: 'inbox-item',
  platform: 'tiktok',
  success: true,
  url: 'https://www.tiktok.com/inbox/item',
};

const CLAIM = {
  executionStartedAt: null,
  isAlreadyPublished: false,
  publishedResult: PUBLISH_RESULT,
};

type ScheduledPostActionId = (typeof SCHEDULED_POST_ACTION_IDS)[number];

function compileScheduledPostContract(actionId: ScheduledPostActionId) {
  const contract = getScheduledPostActionContract(actionId);
  if (!contract) {
    throw new Error(`missing scheduled-post contract: ${actionId}`);
  }
  return compileActionContract(actionId, {
    inputSchema: contract.inputSchema as ActionContractJsonSchema,
    outputSchema: contract.outputSchema as ActionContractJsonSchema,
  });
}

function request(source: string) {
  return {
    organizationId: 'org_1',
    postId: 'post_1',
    source,
  };
}

function inputFor(actionId: ScheduledPostActionId, source: string) {
  if (
    actionId === 'scheduled-post.claim' ||
    actionId === 'scheduled-post.fail'
  ) {
    return { request: request(source) };
  }
  if (actionId === 'scheduled-post.deliver') {
    return { claim: CLAIM, request: request(source) };
  }
  return {
    claim: CLAIM,
    delivery: PUBLISH_RESULT,
    request: request(source),
  };
}

describe('scheduled-post action source contract', () => {
  it.each(SCHEDULED_POST_ACTION_IDS)(
    'accepts every supported source on %s',
    (actionId) => {
      const contract = compileScheduledPostContract(actionId);
      for (const source of SUPPORTED_SOURCES) {
        expect(() =>
          contract.validateInput(inputFor(actionId, source), PROVENANCE),
        ).not.toThrow();
      }
    },
  );

  it.each(SCHEDULED_POST_ACTION_IDS)(
    'rejects an unknown source on %s',
    (actionId) => {
      const contract = compileScheduledPostContract(actionId);
      expect(() =>
        contract.validateInput(
          inputFor(actionId, 'unknown_source'),
          PROVENANCE,
        ),
      ).toThrow('$.request.source');
    },
  );
});
