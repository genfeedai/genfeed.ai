CREATE TABLE "data_backfills" (
    "id" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report" JSONB NOT NULL,
    CONSTRAINT "data_backfills_pkey" PRIMARY KEY ("id")
);
