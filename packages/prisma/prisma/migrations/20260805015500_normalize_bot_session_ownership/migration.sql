UPDATE "bots" AS bot
SET "brandId" = brand."id"
FROM "brands" AS brand
WHERE bot."brandId" = brand."mongoId";

UPDATE "bots" AS bot
SET "brandId" = NULL
WHERE bot."brandId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "brands" AS brand
    WHERE brand."id" = bot."brandId"
  );

ALTER TABLE "bots"
ADD CONSTRAINT "bots_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "livestream_bot_sessions"
ADD COLUMN "botId" TEXT,
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "brandId" TEXT,
ADD COLUMN "userId" TEXT;

UPDATE "livestream_bot_sessions" AS session
SET "botId" = bot."id"
FROM "bots" AS bot
WHERE session."data"->>'botId' IN (bot."id", bot."mongoId")
   OR session."data"->>'bot' IN (bot."id", bot."mongoId");

UPDATE "livestream_bot_sessions" AS session
SET "organizationId" = organization."id"
FROM "organizations" AS organization
WHERE session."data"->>'organizationId' IN (
  organization."id",
  organization."mongoId"
)
   OR session."data"->>'organization' IN (
     organization."id",
     organization."mongoId"
   );

UPDATE "livestream_bot_sessions" AS session
SET "brandId" = brand."id"
FROM "brands" AS brand
WHERE session."data"->>'brandId' IN (brand."id", brand."mongoId")
   OR session."data"->>'brand' IN (brand."id", brand."mongoId");

UPDATE "livestream_bot_sessions" AS session
SET "userId" = "user"."id"
FROM "users" AS "user"
WHERE session."data"->>'userId' IN ("user"."id", "user"."mongoId")
   OR session."data"->>'user' IN ("user"."id", "user"."mongoId");

UPDATE "livestream_bot_sessions"
SET "data" = "data" - ARRAY[
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
