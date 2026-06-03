-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "category" TEXT,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "models" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "creditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "trigger" TEXT;

-- AlterTable
ALTER TABLE "agent_strategies" ADD COLUMN     "agentType" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "agent_campaigns" ADD COLUMN     "status" TEXT DEFAULT 'draft';

-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN     "trigger" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "assigneeAgentId" TEXT,
ADD COLUMN     "assigneeUserId" TEXT,
ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "reviewState" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "category" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "reply_bot_configs" ADD COLUMN     "actionType" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "monitored_accounts" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "outreach_campaigns" ADD COLUMN     "campaignType" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "platform" TEXT;

-- AlterTable
ALTER TABLE "elements_blacklists" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "elements_scenes" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "elements_sounds" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "presets" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "level" TEXT,
ADD COLUMN     "status" TEXT;

