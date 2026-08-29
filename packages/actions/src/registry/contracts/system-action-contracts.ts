import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const ANNOUNCEMENT_REQUEST = closedObjectSchema(
  {
    authorId: STRING_SCHEMA,
    body: STRING_SCHEMA,
    channels: arraySchema(enumSchema(['discord', 'twitter'] as const)),
    discordChannelId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    tweetText: STRING_SCHEMA,
  },
  ['authorId', 'body', 'channels', 'organizationId'],
);
const JSON_OBJECT_SCHEMA = {
  additionalProperties: JSON_DOCUMENT_SCHEMA,
  type: 'object',
} as const;
const SKILL_EXECUTION_CONTRACT: ActionContractSchemas = {
  inputSchema: closedObjectSchema(
    {
      context: closedObjectSchema(
        {
          brandId: STRING_SCHEMA,
          brandVoice: STRING_SCHEMA,
          memory: JSON_OBJECT_SCHEMA,
          organizationId: STRING_SCHEMA,
          platforms: arraySchema(STRING_SCHEMA),
        },
        ['brandId', 'brandVoice', 'organizationId', 'platforms'],
      ),
      params: JSON_OBJECT_SCHEMA,
    },
    ['context', 'params'],
  ),
  outputSchema: closedObjectSchema(
    {
      confidence: NUMBER_SCHEMA,
      content: STRING_SCHEMA,
      mediaUrls: arraySchema(STRING_SCHEMA),
      metadata: JSON_OBJECT_SCHEMA,
      platforms: arraySchema(STRING_SCHEMA),
      skillSlug: STRING_SCHEMA,
      type: STRING_SCHEMA,
    },
    ['content', 'metadata', 'platforms', 'skillSlug', 'type'],
  ),
};
const DELIVERY_PROPERTIES = {
  attempted: BOOLEAN_SCHEMA,
  delivered: BOOLEAN_SCHEMA,
  error: STRING_SCHEMA,
} as const;
const DISCORD_DELIVERY = closedObjectSchema(DELIVERY_PROPERTIES, [
  'attempted',
  'delivered',
]);
const TWITTER_DELIVERY = closedObjectSchema(
  {
    ...DELIVERY_PROPERTIES,
    tweetId: STRING_SCHEMA,
    tweetUrl: STRING_SCHEMA,
  },
  ['attempted', 'delivered'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'admin.announcement.persist': {
    inputSchema: closedObjectSchema(
      {
        discord: DISCORD_DELIVERY,
        request: ANNOUNCEMENT_REQUEST,
        twitter: TWITTER_DELIVERY,
      },
      ['discord', 'request', 'twitter'],
    ),
    outputSchema: closedObjectSchema({ announcementId: STRING_SCHEMA }, [
      'announcementId',
    ]),
  },
  'admin.announcement.publish-discord': {
    inputSchema: closedObjectSchema({ request: ANNOUNCEMENT_REQUEST }, [
      'request',
    ]),
    outputSchema: DISCORD_DELIVERY,
  },
  'admin.announcement.publish-twitter': {
    inputSchema: closedObjectSchema({ request: ANNOUNCEMENT_REQUEST }, [
      'request',
    ]),
    outputSchema: TWITTER_DELIVERY,
  },
  'skill.content-geo-optimizer.execute': SKILL_EXECUTION_CONTRACT,
  'skill.content-writing.execute': SKILL_EXECUTION_CONTRACT,
  'skill.image-generation.execute': SKILL_EXECUTION_CONTRACT,
  'skill.trend-discovery.execute': SKILL_EXECUTION_CONTRACT,
  'skill.trend-remix.execute': SKILL_EXECUTION_CONTRACT,
  'voice.generate.execute': {
    inputSchema: closedObjectSchema(
      {
        ingredientId: STRING_SCHEMA,
        organizationId: STRING_SCHEMA,
        text: STRING_SCHEMA,
        userId: STRING_SCHEMA,
        voiceId: STRING_SCHEMA,
      },
      ['ingredientId', 'organizationId', 'text', 'userId', 'voiceId'],
    ),
    outputSchema: closedObjectSchema(
      {
        cdnUrl: STRING_SCHEMA,
        duration: NUMBER_SCHEMA,
        id: STRING_SCHEMA,
        s3Key: STRING_SCHEMA,
        status: enumSchema([
          'ARCHIVED',
          'DRAFT',
          'FAILED',
          'GENERATED',
          'PROCESSING',
          'REJECTED',
          'UPLOADED',
          'VALIDATED',
        ] as const),
      },
      ['id', 'status'],
    ),
  },
};

export function getSystemActionContract(
  actionId: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[actionId];
}
