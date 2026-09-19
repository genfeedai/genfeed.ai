-- CreateTable
CREATE TABLE "mcp_oauth_refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_refresh_tokens_tokenHash_key" ON "mcp_oauth_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_oauth_refresh_tokens_userId_organizationId_idx" ON "mcp_oauth_refresh_tokens"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "mcp_oauth_refresh_tokens_apiKeyId_idx" ON "mcp_oauth_refresh_tokens"("apiKeyId");

-- CreateIndex
CREATE INDEX "mcp_oauth_refresh_tokens_clientId_idx" ON "mcp_oauth_refresh_tokens"("clientId");

-- CreateIndex
CREATE INDEX "mcp_oauth_refresh_tokens_expiresAt_idx" ON "mcp_oauth_refresh_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
