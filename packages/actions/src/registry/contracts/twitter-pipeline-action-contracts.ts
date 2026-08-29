import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const TWEET = closedObjectSchema(
  {
    authorName: STRING_SCHEMA,
    authorUsername: STRING_SCHEMA,
    createdAt: STRING_SCHEMA,
    engagement: NUMBER_SCHEMA,
    id: STRING_SCHEMA,
    likes: NUMBER_SCHEMA,
    quotes: NUMBER_SCHEMA,
    replies: NUMBER_SCHEMA,
    retweets: NUMBER_SCHEMA,
    text: STRING_SCHEMA,
  },
  [
    'authorName',
    'authorUsername',
    'createdAt',
    'engagement',
    'id',
    'likes',
    'quotes',
    'replies',
    'retweets',
    'text',
  ],
);
const VOICE = closedObjectSchema(
  {
    description: STRING_SCHEMA,
    handle: STRING_SCHEMA,
    searchQuery: STRING_SCHEMA,
  },
  ['description', 'handle', 'searchQuery'],
);
const DRAFT_REQUEST = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    searchResults: arraySchema(TWEET),
    voiceConfig: VOICE,
  },
  ['organizationId', 'searchResults', 'voiceConfig'],
);
const DRAFT_CONTEXT = closedObjectSchema(
  { prompt: STRING_SCHEMA, searchResults: arraySchema(TWEET) },
  ['prompt', 'searchResults'],
);
const GENERATION = closedObjectSchema({ rawContent: STRING_SCHEMA }, [
  'rawContent',
]);
const OPPORTUNITY = closedObjectSchema(
  {
    engagement: closedObjectSchema(
      { likes: NUMBER_SCHEMA, retweets: NUMBER_SCHEMA },
      ['likes', 'retweets'],
    ),
    reason: STRING_SCHEMA,
    suggestedText: STRING_SCHEMA,
    targetAuthor: STRING_SCHEMA,
    targetTweet: STRING_SCHEMA,
    targetTweetId: STRING_SCHEMA,
    type: enumSchema(['original', 'quote', 'reply', 'repost'] as const),
    verified: BOOLEAN_SCHEMA,
  },
  ['reason', 'suggestedText', 'type', 'verified'],
);
const PUBLISH_REQUEST = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    targetTweetId: STRING_SCHEMA,
    text: STRING_SCHEMA,
    type: enumSchema(['original', 'quote', 'reply', 'repost'] as const),
  },
  ['brandId', 'organizationId', 'text', 'type'],
);
const PUBLISH_RESULT = closedObjectSchema(
  {
    error: STRING_SCHEMA,
    success: BOOLEAN_SCHEMA,
    tweetId: STRING_SCHEMA,
    tweetUrl: STRING_SCHEMA,
  },
  ['success'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'twitter.pipeline.draft.build-prompt': {
    inputSchema: closedObjectSchema({ request: DRAFT_REQUEST }, ['request']),
    outputSchema: DRAFT_CONTEXT,
  },
  'twitter.pipeline.draft.generate': {
    inputSchema: closedObjectSchema(
      { draftContext: DRAFT_CONTEXT, request: DRAFT_REQUEST },
      ['draftContext', 'request'],
    ),
    outputSchema: GENERATION,
  },
  'twitter.pipeline.draft.parse': {
    inputSchema: closedObjectSchema(
      {
        draftContext: DRAFT_CONTEXT,
        generation: GENERATION,
        request: DRAFT_REQUEST,
      },
      ['draftContext', 'generation', 'request'],
    ),
    outputSchema: arraySchema(OPPORTUNITY),
  },
  'twitter.pipeline.publish.resolve-credential': {
    inputSchema: closedObjectSchema({ request: PUBLISH_REQUEST }, ['request']),
    outputSchema: closedObjectSchema({ credentialId: STRING_SCHEMA }, [
      'credentialId',
    ]),
  },
  'twitter.pipeline.publish.send': {
    inputSchema: closedObjectSchema(
      {
        credential: closedObjectSchema({ credentialId: STRING_SCHEMA }, [
          'credentialId',
        ]),
        request: PUBLISH_REQUEST,
      },
      ['credential', 'request'],
    ),
    outputSchema: PUBLISH_RESULT,
  },
  'twitter.pipeline.search-recent': {
    inputSchema: closedObjectSchema(
      {
        request: closedObjectSchema(
          {
            brandId: STRING_SCHEMA,
            maxResults: NUMBER_SCHEMA,
            organizationId: STRING_SCHEMA,
            query: STRING_SCHEMA,
          },
          ['brandId', 'maxResults', 'organizationId', 'query'],
        ),
      },
      ['request'],
    ),
    outputSchema: arraySchema(TWEET),
  },
};

export function getTwitterPipelineActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
