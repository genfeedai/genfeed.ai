UPDATE "reply_bot_configs"
SET
  "type" = COALESCE("type", "config"->>'type'),
  "actionType" = COALESCE("actionType", "config"->>'actionType'),
  "isActive" = CASE
    WHEN "config"->>'isActive' IN ('true', 'false')
    THEN ("config"->>'isActive')::boolean
    ELSE "isActive"
  END,
  "status" = COALESCE("config"->>'status', "status"),
  "config" = jsonb_strip_nulls(
    (COALESCE("config", '{}'::jsonb)
      - 'type'
      - 'actionType'
      - 'isActive'
      - 'credential'
      - 'label'
      - 'customInstructions')
    || jsonb_build_object(
      'credentialId', COALESCE("config"->'credentialId', "config"->'credential'),
      'name', COALESCE("config"->'name', "config"->'label'),
      'replyInstructions', COALESCE(
        "config"->'replyInstructions',
        "config"->'customInstructions'
      )
    )
  );

UPDATE "monitored_accounts" AS monitored
SET "botConfigId" = source."configId"
FROM (
  SELECT
    config."id" AS "configId",
    config."organizationId",
    account."accountId"
  FROM "reply_bot_configs" AS config
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(config."config"->'monitoredAccounts') = 'array'
      THEN config."config"->'monitoredAccounts'
      ELSE '[]'::jsonb
    END
  ) AS account("accountId")
) AS source
WHERE monitored."id" = source."accountId"
  AND monitored."organizationId" = source."organizationId";

UPDATE "reply_bot_configs"
SET "config" = COALESCE("config", '{}'::jsonb) - 'monitoredAccounts'
WHERE "config" ? 'monitoredAccounts';

UPDATE "monitored_accounts" AS monitored
SET "botConfigId" = candidate."id"
FROM "reply_bot_configs" AS candidate
WHERE monitored."botConfigId" IS NULL
  AND candidate."id" = COALESCE(
    monitored."config"->>'botConfigId',
    monitored."config"->>'replyBotConfig'
  );

UPDATE "monitored_accounts" AS monitored
SET "credentialId" = candidate."id"
FROM "credentials" AS candidate
WHERE monitored."credentialId" IS NULL
  AND candidate."id" = COALESCE(
    monitored."config"->>'credentialId',
    monitored."config"->>'credential'
  );

UPDATE "monitored_accounts"
SET "config" = jsonb_strip_nulls(
  (COALESCE("config", '{}'::jsonb)
    - 'twitterUserId'
    - 'twitterUsername'
    - 'twitterDisplayName'
    - 'twitterAvatarUrl'
    - 'platformUserId'
    - 'botConfigId'
    - 'replyBotConfig'
    - 'credentialId'
    - 'credential')
  || jsonb_build_object(
    'externalId', COALESCE(
      "config"->'externalId',
      "config"->'platformUserId',
      "config"->'twitterUserId'
    ),
    'username', COALESCE("config"->'username', "config"->'twitterUsername'),
    'displayName', COALESCE(
      "config"->'displayName',
      "config"->'twitterDisplayName'
    ),
    'avatarUrl', COALESCE("config"->'avatarUrl', "config"->'twitterAvatarUrl')
  )
);

UPDATE "watchlists"
SET
  "handle" = COALESCE("handle", "config"->>'handle'),
  "platform" = COALESCE("platform", "config"->>'platform'),
  "config" = jsonb_strip_nulls(
    (COALESCE("config", '{}'::jsonb)
      - 'brand'
      - 'brandId'
      - 'organization'
      - 'organizationId'
      - 'user'
      - 'userId'
      - 'handle'
      - 'platform'
      - 'name')
    || jsonb_build_object(
      'label', COALESCE("config"->'label', "config"->'name')
    )
  );

UPDATE "outreach_campaigns"
SET
  "platform" = COALESCE("platform", "config"->>'platform'),
  "campaignType" = COALESCE("campaignType", "config"->>'campaignType'),
  "isActive" = CASE
    WHEN "config"->>'isActive' IN ('true', 'false')
    THEN ("config"->>'isActive')::boolean
    ELSE "isActive"
  END,
  "config" = COALESCE("config", '{}'::jsonb)
    - 'platform'
    - 'campaignType'
    - 'isActive'
    - 'status';

UPDATE "presets"
SET "config" = jsonb_strip_nulls(
  (COALESCE("config", '{}'::jsonb) - 'ingredient')
  || jsonb_build_object(
    'ingredientId', COALESCE("config"->'ingredientId', "config"->'ingredient')
  )
)
WHERE "config" ? 'ingredient';
