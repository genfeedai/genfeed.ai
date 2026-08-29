import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  closedObjectSchema,
  INTEGER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders.js';

const SOURCE_REF = closedObjectSchema(
  {
    label: STRING_SCHEMA,
    note: STRING_SCHEMA,
    sourceType: STRING_SCHEMA,
    url: STRING_SCHEMA,
  },
  ['label', 'sourceType'],
);
const TOPICS_DTO = closedObjectSchema({
  count: INTEGER_SCHEMA,
  instructions: STRING_SCHEMA,
});
const DRAFT_DTO = closedObjectSchema(
  {
    angle: STRING_SCHEMA,
    contextNewsletterIds: arraySchema(STRING_SCHEMA),
    instructions: STRING_SCHEMA,
    newsletterId: STRING_SCHEMA,
    sourceRefs: arraySchema(SOURCE_REF),
    topic: STRING_SCHEMA,
  },
  ['topic'],
);
const TENANT = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['brandId', 'organizationId', 'userId'],
);
const NEWSLETTER_CONTEXT_SNAPSHOT = closedObjectSchema(
  {
    content: nullableSchema(STRING_SCHEMA),
    id: STRING_SCHEMA,
    label: STRING_SCHEMA,
    summary: nullableSchema(STRING_SCHEMA),
    topic: nullableSchema(STRING_SCHEMA),
  },
  ['content', 'id', 'label', 'summary', 'topic'],
);
const BRAND_VOICE = nullableSchema(
  closedObjectSchema({
    audience: STRING_SCHEMA,
    doNotSoundLike: arraySchema(STRING_SCHEMA),
    hashtags: arraySchema(STRING_SCHEMA),
    messagingPillars: arraySchema(STRING_SCHEMA),
    sampleOutput: STRING_SCHEMA,
    taglines: arraySchema(STRING_SCHEMA),
    tone: STRING_SCHEMA,
    values: arraySchema(STRING_SCHEMA),
    voice: STRING_SCHEMA,
  }),
);
const TOPIC = closedObjectSchema(
  { angle: STRING_SCHEMA, reason: STRING_SCHEMA, title: STRING_SCHEMA },
  ['angle', 'reason', 'title'],
);
const TOPIC_CONTEXT = closedObjectSchema(
  {
    brandVoice: BRAND_VOICE,
    count: INTEGER_SCHEMA,
    ctx: TENANT,
    dto: TOPICS_DTO,
    recent: arraySchema(NEWSLETTER_CONTEXT_SNAPSHOT),
  },
  ['brandVoice', 'count', 'ctx', 'dto', 'recent'],
);
const DRAFT_CONTEXT_PROPERTIES = {
  contextNewsletters: arraySchema(NEWSLETTER_CONTEXT_SNAPSHOT),
  ctx: TENANT,
  dto: DRAFT_DTO,
  prompt: STRING_SCHEMA,
} as const;
const DRAFT_CONTEXT = closedObjectSchema(DRAFT_CONTEXT_PROPERTIES, [
  'contextNewsletters',
  'ctx',
  'dto',
  'prompt',
]);
const GENERATED_DRAFT = closedObjectSchema(
  { ...DRAFT_CONTEXT_PROPERTIES, generatedContent: STRING_SCHEMA },
  ['contextNewsletters', 'ctx', 'dto', 'generatedContent', 'prompt'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'newsletter.generate-draft': {
    inputSchema: closedObjectSchema({ state: DRAFT_CONTEXT }, ['state']),
    outputSchema: GENERATED_DRAFT,
  },
  'newsletter.generate-topics': {
    inputSchema: closedObjectSchema({ state: TOPIC_CONTEXT }, ['state']),
    outputSchema: arraySchema(TOPIC),
  },
  'newsletter.load-draft-context': {
    inputSchema: closedObjectSchema(
      { brandId: STRING_SCHEMA, dto: DRAFT_DTO },
      ['brandId', 'dto'],
    ),
    outputSchema: DRAFT_CONTEXT,
  },
  'newsletter.load-topic-context': {
    inputSchema: closedObjectSchema(
      { brandId: STRING_SCHEMA, dto: TOPICS_DTO },
      ['brandId', 'dto'],
    ),
    outputSchema: TOPIC_CONTEXT,
  },
  'newsletter.persist-draft': {
    inputSchema: closedObjectSchema({ state: GENERATED_DRAFT }, ['state']),
    outputSchema: closedObjectSchema({ newsletterId: STRING_SCHEMA }, [
      'newsletterId',
    ]),
  },
};

export function getNewsletterActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}
