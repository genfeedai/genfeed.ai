-- CreateTable
CREATE TABLE "mcp_enterprise_auth_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trustedIssuer" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_enterprise_auth_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_enterprise_auth_assertions" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "jtiHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_enterprise_auth_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_enterprise_auth_configs_organizationId_key" ON "mcp_enterprise_auth_configs"("organizationId");

-- CreateIndex
CREATE INDEX "mcp_enterprise_auth_configs_trustedIssuer_isEnabled_idx" ON "mcp_enterprise_auth_configs"("trustedIssuer", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_enterprise_auth_assertions_issuer_jtiHash_key" ON "mcp_enterprise_auth_assertions"("issuer", "jtiHash");

-- CreateIndex
CREATE INDEX "mcp_enterprise_auth_assertions_expiresAt_idx" ON "mcp_enterprise_auth_assertions"("expiresAt");
