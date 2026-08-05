BEGIN;

-- Optional scalar references use NULL, never an empty string.
UPDATE "bots"
SET "brandId" = NULL
WHERE "brandId" = '';

-- Existing bot brand references must resolve inside the bot organization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "bots" AS bot
    WHERE NULLIF(bot."brandId", '') IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "brands" AS candidate
        WHERE candidate."organizationId" = bot."organizationId"
          AND NULLIF(bot."brandId", '')
            IN (candidate."id", candidate."mongoId")
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'bots contains unresolved or cross-organization brand references';
  END IF;
END $$;

WITH resolved_brands AS (
  SELECT bot."id" AS "botId", MIN(candidate."id") AS "brandId"
  FROM "bots" AS bot
  JOIN "brands" AS candidate
    ON candidate."organizationId" = bot."organizationId"
   AND NULLIF(bot."brandId", '') IN (candidate."id", candidate."mongoId")
  GROUP BY bot."id"
  HAVING COUNT(*) = 1
)
UPDATE "bots" AS bot
SET "brandId" = resolved."brandId"
FROM resolved_brands AS resolved
WHERE bot."id" = resolved."botId";

ALTER TABLE "bots"
ADD CONSTRAINT "bots_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "livestream_bot_sessions"
ADD COLUMN "botId" TEXT,
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "brandId" TEXT,
ADD COLUMN "userId" TEXT;

-- botId and bot may both be present, but they must identify one bot.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'botId', ''),
      NULLIF(session."data"->>'bot', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "bots" AS candidate
        WHERE (
          NULLIF(session."data"->>'botId', '') IS NULL
          OR NULLIF(session."data"->>'botId', '')
            IN (candidate."id", candidate."mongoId")
        )
          AND (
            NULLIF(session."data"->>'bot', '') IS NULL
            OR NULLIF(session."data"->>'bot', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions contains unresolved or conflicting bot references';
  END IF;
END $$;

-- Ownership aliases without a bot cannot be normalized safely because the bot
-- is the canonical owner tuple for a session.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'botId', ''),
      NULLIF(session."data"->>'bot', '')
    ) IS NULL
      AND COALESCE(
        NULLIF(session."data"->>'brandId', ''),
        NULLIF(session."data"->>'brand', ''),
        NULLIF(session."data"->>'organizationId', ''),
        NULLIF(session."data"->>'organization', ''),
        NULLIF(session."data"->>'userId', ''),
        NULLIF(session."data"->>'user', '')
      ) IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions contains ownership references without a bot';
  END IF;
END $$;

WITH resolved_bots AS (
  SELECT session."id" AS "sessionId", MIN(candidate."id") AS "botId"
  FROM "livestream_bot_sessions" AS session
  JOIN "bots" AS candidate
    ON (
      NULLIF(session."data"->>'botId', '') IS NULL
      OR NULLIF(session."data"->>'botId', '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(session."data"->>'bot', '') IS NULL
      OR NULLIF(session."data"->>'bot', '')
        IN (candidate."id", candidate."mongoId")
    )
  WHERE COALESCE(
    NULLIF(session."data"->>'botId', ''),
    NULLIF(session."data"->>'bot', '')
  ) IS NOT NULL
  GROUP BY session."id"
  HAVING COUNT(*) = 1
)
UPDATE "livestream_bot_sessions" AS session
SET "botId" = resolved."botId"
FROM resolved_bots AS resolved
WHERE session."id" = resolved."sessionId";

-- Derive the complete ownership tuple from the canonical bot.
UPDATE "livestream_bot_sessions" AS session
SET "organizationId" = bot."organizationId",
    "brandId" = bot."brandId",
    "userId" = bot."userId"
FROM "bots" AS bot
WHERE session."botId" = bot."id";

-- No supplied bot alias may be removed unless it produced a canonical bot and
-- the complete ownership tuple was derived from that row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'botId', ''),
      NULLIF(session."data"->>'bot', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "bots" AS bot
        WHERE bot."id" = session."botId"
          AND bot."organizationId" = session."organizationId"
          AND bot."brandId" IS NOT DISTINCT FROM session."brandId"
          AND bot."userId" = session."userId"
      )
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions bot ownership was not fully canonicalized';
  END IF;
END $$;

-- Any direct ownership aliases must agree with the bot-derived tuple.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'organizationId', ''),
      NULLIF(session."data"->>'organization', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "organizations" AS candidate
        WHERE candidate."id" = session."organizationId"
          AND (
            NULLIF(session."data"->>'organizationId', '') IS NULL
            OR NULLIF(session."data"->>'organizationId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(session."data"->>'organization', '') IS NULL
            OR NULLIF(session."data"->>'organization', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions contains organization ownership that conflicts with its bot';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'brandId', ''),
      NULLIF(session."data"->>'brand', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "brands" AS candidate
        WHERE candidate."id" = session."brandId"
          AND candidate."organizationId" = session."organizationId"
          AND (
            NULLIF(session."data"->>'brandId', '') IS NULL
            OR NULLIF(session."data"->>'brandId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(session."data"->>'brand', '') IS NULL
            OR NULLIF(session."data"->>'brand', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions contains brand ownership that conflicts with its bot';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "livestream_bot_sessions" AS session
    WHERE COALESCE(
      NULLIF(session."data"->>'userId', ''),
      NULLIF(session."data"->>'user', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "users" AS candidate
        WHERE candidate."id" = session."userId"
          AND (
            NULLIF(session."data"->>'userId', '') IS NULL
            OR NULLIF(session."data"->>'userId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(session."data"->>'user', '') IS NULL
            OR NULLIF(session."data"->>'user', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'livestream_bot_sessions contains user ownership that conflicts with its bot';
  END IF;
END $$;

-- Cleanup runs only after every supplied alias has been reconciled.
UPDATE "livestream_bot_sessions"
SET "data" = COALESCE("data", '{}'::jsonb) - ARRAY[
  'bot',
  'botId',
  'brand',
  'brandId',
  'organization',
  'organizationId',
  'user',
  'userId'
]
WHERE "data" ?| ARRAY[
  'bot',
  'botId',
  'brand',
  'brandId',
  'organization',
  'organizationId',
  'user',
  'userId'
];

ALTER TABLE "livestream_bot_sessions"
ADD CONSTRAINT "livestream_bot_sessions_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "bots"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "livestream_bot_sessions_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "livestream_bot_sessions_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "livestream_bot_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "livestream_bot_sessions_organizationId_isDeleted_idx"
ON "livestream_bot_sessions"("organizationId", "isDeleted");

CREATE INDEX "livestream_bot_sessions_organizationId_botId_isDeleted_idx"
ON "livestream_bot_sessions"("organizationId", "botId", "isDeleted");

COMMIT;
