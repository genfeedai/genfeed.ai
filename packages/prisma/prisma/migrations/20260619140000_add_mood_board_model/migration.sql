-- CreateTable
CREATE TABLE "mood_boards" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mood_boards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mood_boards_brandId_key" ON "mood_boards"("brandId");

-- CreateIndex
CREATE INDEX "mood_boards_organizationId_isDeleted_idx" ON "mood_boards"("organizationId", "isDeleted");

-- AddForeignKey
ALTER TABLE "mood_boards" ADD CONSTRAINT "mood_boards_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_boards" ADD CONSTRAINT "mood_boards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
