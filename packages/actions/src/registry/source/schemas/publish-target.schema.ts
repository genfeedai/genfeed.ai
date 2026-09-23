import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  JSON_OBJECT_SCHEMA,
  NUMBER_SCHEMA,
  STRING_SCHEMA,
} from '../../contracts/schema-builders';

export const PUBLISH_TARGET_SCHEMA = closedObjectSchema(
  {
    attachments: arraySchema(
      closedObjectSchema(
        {
          body: STRING_SCHEMA,
          kind: enumSchema(['signature', 'comment', 'thread']),
          order: NUMBER_SCHEMA,
          platform: STRING_SCHEMA,
        },
        ['body'],
      ),
    ),
    caption: STRING_SCHEMA,
    credentialId: STRING_SCHEMA,
    platform: STRING_SCHEMA,
    scheduledAt: STRING_SCHEMA,
    scheduledDate: STRING_SCHEMA,
    settings: JSON_OBJECT_SCHEMA,
    signatureIds: arraySchema(STRING_SCHEMA),
    timezone: STRING_SCHEMA,
    visibility: enumSchema(['public', 'private', 'unlisted']),
  },
  ['credentialId', 'platform'],
);
