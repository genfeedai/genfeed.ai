CREATE TABLE "source_post_native_actions" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "brandId" TEXT NOT NULL,
 "postId" TEXT NOT NULL,
 "credentialId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "externalId" TEXT,
 "message" TEXT,
 "isDeleted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "source_post_native_actions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "source_post_native_actions_post_scope_fkey" FOREIGN KEY ("postId", "organizationId", "brandId") REFERENCES "source_posts" ("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "source_post_native_actions_credential_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "source_post_native_actions_user_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "source_post_native_actions_scope_key" ON "source_post_native_actions" ("organizationId", "brandId", "idempotencyKey");
CREATE INDEX "source_post_native_actions_scope_post_idx" ON "source_post_native_actions" ("organizationId", "brandId", "postId", "isDeleted");
