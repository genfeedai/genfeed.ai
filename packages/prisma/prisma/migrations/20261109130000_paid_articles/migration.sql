-- Paid articles (#9718): an access level and unlock price per article, and
-- the readers who unlocked one.

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "accessLevel" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "unlockPriceCredits" INTEGER;

-- CreateTable
CREATE TABLE "article_unlocks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "payerOrganizationId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "transferId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_unlocks_organizationId_isDeleted_idx" ON "article_unlocks"("organizationId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "article_unlocks_articleId_payerUserId_key" ON "article_unlocks"("articleId", "payerUserId");

-- AddForeignKey
ALTER TABLE "article_unlocks" ADD CONSTRAINT "article_unlocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_unlocks" ADD CONSTRAINT "article_unlocks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_unlocks" ADD CONSTRAINT "article_unlocks_payerOrganizationId_fkey" FOREIGN KEY ("payerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_unlocks" ADD CONSTRAINT "article_unlocks_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
