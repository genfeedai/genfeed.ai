-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUris" TEXT[],
    "grantTypes" TEXT[] DEFAULT ARRAY['authorization_code']::TEXT[],
    "responseTypes" TEXT[] DEFAULT ARRAY['code']::TEXT[],
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_auth_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "stateHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_auth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- CreateIndex
CREATE INDEX "oauth_clients_createdAt_idx" ON "oauth_clients"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_auth_codes_codeHash_key" ON "mcp_oauth_auth_codes"("codeHash");

-- CreateIndex
CREATE INDEX "mcp_oauth_auth_codes_expiresAt_idx" ON "mcp_oauth_auth_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "mcp_oauth_auth_codes_userId_organizationId_idx" ON "mcp_oauth_auth_codes"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "mcp_oauth_auth_codes_clientId_idx" ON "mcp_oauth_auth_codes"("clientId");

-- AddForeignKey
ALTER TABLE "mcp_oauth_auth_codes" ADD CONSTRAINT "mcp_oauth_auth_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
