-- CreateTable
CREATE TABLE "user_signup_attributions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referrerDomain" TEXT,
    "landingPath" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signup_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_signup_attributions_userId_key" ON "user_signup_attributions"("userId");

-- CreateIndex
CREATE INDEX "user_signup_attributions_utmSource_createdAt_idx" ON "user_signup_attributions"("utmSource", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_signup_attributions_referrerDomain_createdAt_idx" ON "user_signup_attributions"("referrerDomain", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_signup_attributions" ADD CONSTRAINT "user_signup_attributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
