-- Tenant-scoped posting sets and signatures for reusable scheduler defaults (#3197).
-- Credential ids stay inside JSON targets so a later-deleted credential degrades
-- validation instead of breaking the row through a foreign key.

BEGIN;

CREATE TABLE "posting_sets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "targets" JSONB NOT NULL DEFAULT '[]',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "posting_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "posting_sets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "posting_sets_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "posting_sets_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "posting_sets_organizationId_isDeleted_createdAt_idx"
  ON "posting_sets"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posting_sets_organizationId_brandId_isDeleted_createdAt_idx"
  ON "posting_sets"("organizationId", "brandId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posting_sets_userId_isDeleted_createdAt_idx"
  ON "posting_sets"("userId", "isDeleted", "createdAt" DESC);

CREATE TABLE "posting_signatures" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "label" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "placement" TEXT NOT NULL DEFAULT 'append',
  "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "posting_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "posting_signatures_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "posting_signatures_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "posting_signatures_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "posting_signatures_organizationId_isDeleted_createdAt_idx"
  ON "posting_signatures"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posting_signatures_organizationId_brandId_isDeleted_createdAt_idx"
  ON "posting_signatures"("organizationId", "brandId", "isDeleted", "createdAt" DESC);
CREATE INDEX "posting_signatures_userId_isDeleted_createdAt_idx"
  ON "posting_signatures"("userId", "isDeleted", "createdAt" DESC);

COMMIT;
