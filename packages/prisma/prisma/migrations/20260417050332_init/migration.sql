-- CreateEnum
CREATE TYPE "AppSource" AS ENUM ('GENFEED', 'GETSHAREABLE');

-- CreateEnum
CREATE TYPE "OrganizationCategory" AS ENUM ('CREATOR', 'BUSINESS', 'AGENCY');

-- CreateEnum
CREATE TYPE "AssetScope" AS ENUM ('USER', 'BRAND', 'ORGANIZATION', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FontFamily" AS ENUM ('MONTSERRAT_BLACK', 'MONTSERRAT_BOLD', 'MONTSERRAT_REGULAR');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('IMAGE', 'VIDEO', 'MUSIC', 'GIF', 'AVATAR', 'AUDIO', 'IMAGE_EDIT', 'VIDEO_EDIT', 'VOICE', 'INGREDIENT', 'TEXT', 'SOURCE');

-- CreateEnum
CREATE TYPE "IngredientStatus" AS ENUM ('DRAFT', 'PROCESSING', 'UPLOADED', 'GENERATED', 'VALIDATED', 'FAILED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransformationCategory" AS ENUM ('UPSCALED', 'RESIZED', 'ENHANCED', 'EXTENDED', 'INTERPOLATED', 'STABILIZED', 'BACKGROUND_REMOVED', 'STYLE_TRANSFERRED', 'FACE_SWAPPED', 'LIP_SYNCED', 'ANIMATED', 'IMAGE_TO_VIDEO', 'CLIPPED', 'MERGED', 'EDITED', 'REVERSED', 'MIRRORED', 'CAPTIONED', 'VALIDATED', 'REFRAMED');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('SFW', 'SUGGESTIVE', 'NSFW');

-- CreateEnum
CREATE TYPE "DarkroomReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "DarkroomAssetLabel" AS ENUM ('HERO', 'FILLER', 'BTS', 'PROMO', 'LIFESTYLE', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "MetadataExtension" AS ENUM ('JPEG', 'JPG', 'PNG', 'GIF', 'WEBP', 'MP4', 'WEBM', 'MOV', 'AVI', 'MP3', 'WAV');

-- CreateEnum
CREATE TYPE "PromptCategory" AS ENUM ('BRAND_DESCRIPTION', 'STORYBOARD_SCRIPT_DESCRIPTION', 'PRESET_DESCRIPTION_TEXT', 'PRESET_DESCRIPTION_IMAGE', 'PRESET_DESCRIPTION_VIDEO', 'PRESET_DESCRIPTION_MUSIC', 'POST_CONTENT_TWITTER', 'POST_CONTENT_YOUTUBE', 'POST_CONTENT_TIKTOK', 'POST_CONTENT_INSTAGRAM', 'POST_TITLE_TWITTER', 'POST_TITLE_YOUTUBE', 'POST_TITLE_TIKTOK', 'POST_TITLE_INSTAGRAM', 'MODELS_PROMPT_IMAGE', 'MODELS_PROMPT_VIDEO', 'MODELS_PROMPT_MUSIC', 'MODELS_PROMPT_TRAINING', 'ARTICLE');

-- CreateEnum
CREATE TYPE "PromptStatus" AS ENUM ('DRAFT', 'PROCESSING', 'GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "BookmarkCategory" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWEET', 'URL', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "BookmarkPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'TWITTER', 'WEB', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "BookmarkIntent" AS ENUM ('VIDEO', 'IMAGE', 'REPLY', 'REFERENCE', 'INSPIRATION');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED', 'DRAFT', 'SCHEDULED', 'PROCESSING', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('ARTICLE', 'VIDEO', 'POST', 'REEL', 'STORY', 'IMAGE', 'TEXT');

-- CreateEnum
CREATE TYPE "PostEntityModel" AS ENUM ('INGREDIENT', 'ARTICLE');

-- CreateEnum
CREATE TYPE "CredentialPlatform" AS ENUM ('YOUTUBE', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'GOOGLE_ADS', 'TWITTER', 'LINKEDIN', 'PINTEREST', 'REDDIT', 'DISCORD', 'TELEGRAM', 'TWITCH', 'MEDIUM', 'THREADS', 'FANVUE', 'SLACK', 'WORDPRESS', 'SNAPCHAT', 'WHATSAPP', 'MASTODON', 'GHOST', 'SHOPIFY', 'BEEHIIV');

-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('ORGANIZATION', 'CREDENTIAL', 'INGREDIENT', 'PROMPT', 'ARTICLE');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('LOGO', 'BANNER', 'REFERENCE');

-- CreateEnum
CREATE TYPE "AssetParent" AS ENUM ('ORGANIZATION', 'INGREDIENT', 'BRAND', 'ARTICLE');

-- CreateEnum
CREATE TYPE "VoiceProvider" AS ENUM ('HEYGEN', 'ELEVENLABS', 'HEDRA', 'GENFEED_AI');

-- CreateEnum
CREATE TYPE "VoiceCloneStatus" AS ENUM ('PENDING', 'CLONING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ApiKeyCategory" AS ENUM ('GENFEEDAI', 'ELEVENLABS', 'HEDRA', 'HEYGEN', 'OPUS_PRO');

-- CreateEnum
CREATE TYPE "IntegrationPlatform" AS ENUM ('TELEGRAM', 'SLACK', 'DISCORD');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "ReferenceImageCategory" AS ENUM ('FACE', 'PRODUCT', 'STYLE', 'LOGO');

-- CreateEnum
CREATE TYPE "AgentAutonomyMode" AS ENUM ('SUPERVISED', 'AUTO_PUBLISH');

-- CreateEnum
CREATE TYPE "AgentReplyStyle" AS ENUM ('CONCISE', 'DETAILED', 'FRIENDLY', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "ByokBillingStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LinkCategory" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'OTHER', 'TIKTOK', 'TWITTER', 'WEBSITE', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "OnboardingType" AS ENUM ('CREATOR', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "QualityStatus" AS ENUM ('UNRATED', 'GOOD', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_CHANGES');

-- CreateEnum
CREATE TYPE "GenerationPriority" AS ENUM ('QUALITY', 'SPEED', 'COST', 'BALANCED');

-- CreateEnum
CREATE TYPE "TrendNotificationFrequency" AS ENUM ('REALTIME', 'HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "AgentQualityTier" AS ENUM ('BUDGET', 'BALANCED', 'HIGH_QUALITY');

-- CreateEnum
CREATE TYPE "AgentGoalProfile" AS ENUM ('REACH_TRAFFIC');

-- CreateEnum
CREATE TYPE "TrainingStage" AS ENUM ('PENDING', 'UPLOADING', 'TRAINING', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PersonaStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CronJobStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CronRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampaignTargetStatus" AS ENUM ('PENDING', 'CONTACTED', 'RESPONDED', 'CONVERTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIALING', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "ContentDraftStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "handle" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isInvited" BOOLEAN NOT NULL DEFAULT false,
    "isOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStartedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingType" "OnboardingType",
    "onboardingStepsCompleted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appSource" "AppSource" NOT NULL DEFAULT 'GENFEED',
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "prefix" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "category" "OrganizationCategory" NOT NULL DEFAULT 'BUSINESS',
    "accountType" "OrganizationCategory",
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isProactiveOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "proactiveWelcomeDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT NOT NULL,
    "voiceIngredientId" TEXT,
    "musicIngredientId" TEXT,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "text" TEXT,
    "fontFamily" "FontFamily" NOT NULL DEFAULT 'MONTSERRAT_BLACK',
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "secondaryColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "backgroundColor" TEXT NOT NULL DEFAULT 'transparent',
    "referenceImages" JSONB NOT NULL DEFAULT '[]',
    "isSelected" BOOLEAN NOT NULL,
    "scope" "AssetScope" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isDarkroomEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultVideoModel" TEXT,
    "defaultImageModel" TEXT,
    "defaultImageToVideoModel" TEXT,
    "defaultMusicModel" TEXT,
    "agentConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "lastUsedBrandId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "primaryColor" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "isMenuCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "isSidebarProgressVisible" BOOLEAN NOT NULL DEFAULT true,
    "isSidebarProgressCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "isAdvancedMode" BOOLEAN NOT NULL DEFAULT true,
    "isTrendNotificationsInApp" BOOLEAN NOT NULL DEFAULT true,
    "isTrendNotificationsTelegram" BOOLEAN NOT NULL DEFAULT false,
    "isTrendNotificationsEmail" BOOLEAN NOT NULL DEFAULT false,
    "isWorkflowNotificationsEmail" BOOLEAN NOT NULL DEFAULT false,
    "isVideoNotificationsEmail" BOOLEAN NOT NULL DEFAULT false,
    "trendNotificationsTelegramChatId" TEXT,
    "trendNotificationsEmailAddress" TEXT,
    "trendNotificationsFrequency" "TrendNotificationFrequency" NOT NULL DEFAULT 'DAILY',
    "trendNotificationsMinViralScore" INTEGER NOT NULL DEFAULT 70,
    "contentPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favoriteModelKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultAgentModel" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat',
    "isAgentAssetsPanelOpen" BOOLEAN NOT NULL DEFAULT false,
    "generationPriority" "GenerationPriority" NOT NULL DEFAULT 'QUALITY',
    "dashboardPreferences" JSONB NOT NULL DEFAULT '{"scopes":{}}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "isWhitelabelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isVoiceControlEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isNotificationsDiscordEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isNotificationsEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDarkroomNsfwVisible" BOOLEAN NOT NULL DEFAULT false,
    "isWatermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isVerifyScriptEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isVerifyIngredientEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isVerifyVideoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isGenerateVideosEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isGenerateArticlesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isGenerateImagesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isGenerateMusicEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isAutoEvaluateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "seatsLimit" INTEGER NOT NULL DEFAULT 3,
    "brandsLimit" INTEGER NOT NULL DEFAULT 5,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isWebhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webhookEndpoint" TEXT,
    "webhookSecret" TEXT,
    "quotaYoutube" INTEGER NOT NULL DEFAULT 5,
    "quotaTiktok" INTEGER NOT NULL DEFAULT 1,
    "quotaTwitter" INTEGER NOT NULL DEFAULT 5,
    "quotaInstagram" INTEGER NOT NULL DEFAULT 5,
    "enabledModelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subscriptionTier" TEXT,
    "isByokEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hasEverHadCredits" BOOLEAN NOT NULL DEFAULT false,
    "onboardingJourneyMissions" JSONB NOT NULL DEFAULT '[]',
    "onboardingJourneyCompletedAt" TIMESTAMP(3),
    "isAdvancedMode" BOOLEAN NOT NULL DEFAULT false,
    "agentReplyStyle" "AgentReplyStyle" NOT NULL DEFAULT 'CONCISE',
    "byokOpenrouterApiKey" TEXT,
    "byokBillingRollover" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "byokBillingStatus" "ByokBillingStatus" NOT NULL DEFAULT 'ACTIVE',
    "byokFreeThresholdOverride" DOUBLE PRECISION,
    "defaultAvatarPhotoUrl" TEXT,
    "defaultAvatarIngredientId" TEXT,
    "defaultVoiceId" TEXT,
    "defaultVoiceRef" JSONB,
    "defaultVoiceProvider" TEXT,
    "defaultModel" TEXT,
    "defaultModelReview" TEXT,
    "defaultModelUpdate" TEXT,
    "defaultImageModel" TEXT,
    "defaultVideoModel" TEXT,
    "defaultImageToVideoModel" TEXT,
    "defaultMusicModel" TEXT,
    "agentPolicy" JSONB NOT NULL DEFAULT '{}',
    "byokKeys" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "brandId" TEXT,
    "userId" TEXT,
    "username" TEXT,
    "platform" "CredentialPlatform" NOT NULL,
    "externalId" TEXT,
    "externalHandle" TEXT,
    "externalName" TEXT,
    "externalAvatar" TEXT,
    "oauthState" TEXT,
    "oauthToken" TEXT,
    "oauthTokenHash" TEXT,
    "oauthTokenSecret" TEXT,
    "accessToken" TEXT,
    "accessTokenSecret" TEXT,
    "accessTokenExpiry" TIMESTAMP(3),
    "refreshToken" TEXT,
    "refreshTokenExpiry" TIMESTAMP(3),
    "label" TEXT,
    "description" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ApiKeyCategory" NOT NULL DEFAULT 'GENFEEDAI',
    "description" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimit" INTEGER,
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyFingerprint" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "IntegrationPlatform" NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "brandId" TEXT,
    "folderId" TEXT,
    "parentId" TEXT,
    "metadataId" TEXT,
    "promptId" TEXT,
    "trainingId" TEXT,
    "bookmarkId" TEXT,
    "personaId" TEXT,
    "agentRunId" TEXT,
    "agentStrategyId" TEXT,
    "category" "IngredientCategory" NOT NULL DEFAULT 'IMAGE',
    "status" "IngredientStatus" NOT NULL DEFAULT 'DRAFT',
    "transformations" "TransformationCategory"[] DEFAULT ARRAY[]::"TransformationCategory"[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "scope" "AssetScope" NOT NULL DEFAULT 'USER',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "groupIndex" INTEGER,
    "isMergeEnabled" BOOLEAN,
    "promptTemplate" TEXT,
    "templateVersion" INTEGER,
    "s3Key" TEXT,
    "cdnUrl" TEXT,
    "personaSlug" TEXT,
    "contentRating" "ContentRating",
    "reviewStatus" "DarkroomReviewStatus",
    "assetLabel" "DarkroomAssetLabel",
    "generationSource" TEXT,
    "campaign" TEXT,
    "campaignWeek" INTEGER,
    "modelUsed" TEXT,
    "loraUsed" TEXT,
    "generationPrompt" TEXT,
    "negativePrompt" TEXT,
    "generationSeed" INTEGER,
    "cfgScale" DOUBLE PRECISION,
    "generationSteps" INTEGER,
    "workflowUsed" TEXT,
    "generationStage" TEXT,
    "generationProgress" DOUBLE PRECISION,
    "generationError" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generationCompletedAt" TIMESTAMP(3),
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "postedTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualityScore" DOUBLE PRECISION,
    "qualityFeedback" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'UNRATED',
    "voiceSource" TEXT,
    "voiceProvider" "VoiceProvider",
    "externalVoiceId" TEXT,
    "cloneStatus" "VoiceCloneStatus",
    "sampleAudioUrl" TEXT,
    "isCloned" BOOLEAN,
    "isVoiceActive" BOOLEAN,
    "isDefaultSelectable" BOOLEAN,
    "providerData" JSONB,
    "isFeatured" BOOLEAN,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT 'Default Description',
    "promptId" TEXT,
    "model" TEXT,
    "style" TEXT,
    "extension" "MetadataExtension" NOT NULL,
    "assistant" TEXT,
    "result" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "externalId" TEXT,
    "externalProvider" TEXT,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "size" INTEGER NOT NULL DEFAULT 0,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "fps" DOUBLE PRECISION,
    "resolution" TEXT,
    "seed" INTEGER,
    "promptTemplate" TEXT,
    "templateVersion" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "articleId" TEXT,
    "category" "PromptCategory",
    "original" TEXT NOT NULL,
    "enhanced" TEXT,
    "status" "PromptStatus" NOT NULL DEFAULT 'DRAFT',
    "style" TEXT,
    "mood" TEXT,
    "camera" TEXT,
    "scene" TEXT,
    "fontFamily" TEXT,
    "blacklists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sounds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "duration" DOUBLE PRECISION,
    "ratio" TEXT,
    "resolution" TEXT,
    "seed" INTEGER,
    "reference" TEXT,
    "isSkipEnhancement" BOOLEAN NOT NULL DEFAULT false,
    "scope" "AssetScope" NOT NULL DEFAULT 'USER',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "speech" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "brandId" TEXT,
    "category" "TagCategory",
    "label" TEXT NOT NULL,
    "description" TEXT,
    "key" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#000000',
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "folderId" TEXT,
    "category" "BookmarkCategory" NOT NULL DEFAULT 'URL',
    "url" TEXT NOT NULL,
    "platform" "BookmarkPlatform" NOT NULL DEFAULT 'WEB',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "authorHandle" TEXT,
    "thumbnailUrl" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platformData" JSONB NOT NULL DEFAULT '{}',
    "intent" "BookmarkIntent" NOT NULL DEFAULT 'INSPIRATION',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentType" "AssetParent" NOT NULL,
    "parentOrgId" TEXT,
    "parentBrandId" TEXT,
    "parentIngredientId" TEXT,
    "parentArticleId" TEXT,
    "category" "AssetCategory" NOT NULL,
    "externalId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "links" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "LinkCategory" NOT NULL,
    "url" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "contentId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "customSlug" TEXT,
    "contentType" TEXT,
    "platform" TEXT,
    "campaignName" TEXT,
    "utm" JSONB,
    "stats" JSONB NOT NULL DEFAULT '{"totalClicks":0,"uniqueClicks":0}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_clicks" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "referrer" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "device" TEXT,
    "gaClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "entityIngredientId" TEXT,
    "entityArticleId" TEXT,
    "entityModel" "PostEntityModel",
    "credentialId" TEXT NOT NULL,
    "platform" "CredentialPlatform" NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "parentId" TEXT,
    "originalPostId" TEXT,
    "personaId" TEXT,
    "contentRunId" TEXT,
    "workflowExecutionId" TEXT,
    "agentRunId" TEXT,
    "agentStrategyId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "externalShortcode" TEXT,
    "quoteTweetId" TEXT,
    "groupId" TEXT,
    "url" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "label" TEXT,
    "description" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL DEFAULT 'TEXT',
    "scheduledDate" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "publicationDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "nextScheduledDate" TIMESTAMP(3),
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "repeatFrequency" TEXT,
    "repeatInterval" INTEGER,
    "repeatEndDate" TIMESTAMP(3),
    "maxRepeats" INTEGER,
    "repeatCount" INTEGER,
    "repeatDaysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isShareToFeedSelected" BOOLEAN NOT NULL DEFAULT true,
    "isAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "variantId" TEXT,
    "hookVersion" TEXT,
    "creativeVersion" TEXT,
    "scheduleSlot" TEXT,
    "publishIntent" TEXT,
    "generationId" TEXT,
    "promptUsed" TEXT,
    "reviewBatchId" TEXT,
    "reviewItemId" TEXT,
    "reviewDecision" "ReviewDecision",
    "reviewFeedback" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewEvents" JSONB NOT NULL DEFAULT '[]',
    "sourceActionId" TEXT,
    "sourceWorkflowId" TEXT,
    "sourceWorkflowName" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_analytics" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "CredentialPlatform" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "totalLikes" INTEGER NOT NULL DEFAULT 0,
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "totalShares" INTEGER NOT NULL DEFAULT 0,
    "totalSaves" INTEGER NOT NULL DEFAULT 0,
    "totalViewsIncrement" INTEGER NOT NULL DEFAULT 0,
    "totalLikesIncrement" INTEGER NOT NULL DEFAULT 0,
    "totalCommentsIncrement" INTEGER NOT NULL DEFAULT 0,
    "totalSharesIncrement" INTEGER NOT NULL DEFAULT 0,
    "totalSavesIncrement" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "label" TEXT,
    "platform" "CredentialPlatform",
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "slots" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repurposing_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repurposing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_attributions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceContentId" TEXT,
    "sourceLinkId" TEXT,
    "channel" TEXT,
    "referrer" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION,
    "source" TEXT,
    "description" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_instances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "content" TEXT,
    "excerpt" TEXT,
    "coverImageUrl" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_analytics" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "totalLikes" INTEGER NOT NULL DEFAULT 0,
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "totalShares" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "agentRunId" TEXT,
    "approvedByUserId" TEXT,
    "publishedByUserId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT,
    "content" TEXT,
    "language" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "personaId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "externalId" TEXT,
    "stage" "TrainingStage" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trainingId" TEXT,
    "parentModelId" TEXT,
    "label" TEXT,
    "externalId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "avatarIngredientId" TEXT,
    "voiceIngredientId" TEXT,
    "label" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "status" "PersonaStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isAutopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nextAutopilotRunAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_threads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "brandId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "threadId" TEXT,
    "parentRunId" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "type" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_strategies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "goalId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "policies" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_strategy_opportunities" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_strategy_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_strategy_reports" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_strategy_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "campaignLeadStrategyId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_goals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "label" TEXT,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "campaignId" TEXT,
    "content" TEXT,
    "type" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_thread_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "commandId" TEXT,
    "runId" TEXT,
    "type" TEXT,
    "data" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_thread_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_thread_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_thread_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_context_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thread_context_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_workflows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "inputVariables" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_workflow_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "expression" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "CronJobStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "cronJobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CronRunStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT,
    "parentId" TEXT,
    "planningThreadId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "config" JSONB NOT NULL DEFAULT '{}',
    "eventStream" JSONB NOT NULL DEFAULT '[]',
    "decomposition" JSONB,
    "progress" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" TEXT,
    "authorId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_counters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "targets" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "BotStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "replyBotConfigId" TEXT,
    "monitoredAccountId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_bot_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_bot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitored_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT,
    "botConfigId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitored_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_tweets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "replyBotConfigId" TEXT,
    "botActivityId" TEXT,
    "monitoredAccountId" TEXT,
    "tweetId" TEXT NOT NULL,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processed_tweets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_performance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT,
    "postId" TEXT,
    "contentRunId" TEXT,
    "workflowExecutionId" TEXT,
    "platform" TEXT,
    "variantId" TEXT,
    "generationId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_patterns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceCreatorId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_analyses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_playbooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_patterns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "contentRunId" TEXT,
    "approvedById" TEXT,
    "status" "ContentDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "createdById" TEXT,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_plan_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_scores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimizations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scoreId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" TEXT,
    "contentId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "brandId" TEXT,
    "entityId" TEXT,
    "entityModel" TEXT,
    "action" TEXT,
    "data" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_bulk_upload_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "credentialId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_bulk_upload_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creative_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creative_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insights" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_optimization_audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_optimization_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_optimization_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_optimization_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_optimization_recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_optimization_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_performance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "credentialId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trends" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_hashtags" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trending_hashtags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_sounds" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trending_sounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_videos" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trending_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_preferences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_remix_lineages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "contentDraftId" TEXT,
    "postId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_remix_lineages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_source_references" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_source_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_source_reference_links" (
    "id" TEXT NOT NULL,
    "trendId" TEXT,
    "sourceReferenceId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_source_reference_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_source_reference_snapshots" (
    "id" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trend_source_reference_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "brandId" TEXT,
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_targets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "CampaignTargetStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_blacklists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_blacklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_cameras" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_camera_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_camera_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_lenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_lenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_lightings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_lightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_moods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_scenes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_sounds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_sounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elements_styles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elements_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "font_families" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "font_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "agentRunId" TEXT,
    "organizationId" TEXT NOT NULL,
    "content" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "captions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clip_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clip_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT NOT NULL,
    "renderedVideoId" TEXT,
    "tracks" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editor_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_memories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "content" TEXT,
    "type" TEXT,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_bases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "sourceBrandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_entries" (
    "id" TEXT NOT NULL,
    "contextBaseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_receipts" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_metadata" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_usages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "entityId" TEXT,
    "entityModel" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT,
    "content" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "proactiveOrganizationId" TEXT,
    "proactiveBrandId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT,
    "agentStrategyId" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fanvue_content" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fanvue_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fanvue_earnings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "earnedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fanvue_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fanvue_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT,
    "status" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fanvue_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fanvue_subscribers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fanvue_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livestream_bot_sessions" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livestream_bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_member_brands" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_member_brands_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_workflow_brands" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_workflow_brands_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_credential_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_credential_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_persona_credentials" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_persona_credentials_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ingredient_sources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ingredient_sources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ingredient_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ingredient_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_post_ingredients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_post_ingredients_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_post_analytics_ingredients" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_post_analytics_ingredients_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_training_sources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_training_sources_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_task_linked_outputs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_task_linked_outputs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_task_approved_outputs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_task_approved_outputs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_metadata_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_metadata_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_prompt_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_prompt_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_folder_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_folder_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_workflow_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_workflow_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_bookmark_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_bookmark_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_bookmark_extracted" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_bookmark_extracted_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_bookmark_generated" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_bookmark_generated_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_post_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_post_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_article_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_article_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_newsletter_articles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_newsletter_articles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_newsletter_context" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_newsletter_context_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_persona_tags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_persona_tags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_persona_assigned_members" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_persona_assigned_members_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_task_linked_runs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_task_linked_runs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_campaign_agents" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_campaign_agents_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CreatorAnalysisToPatternPlaybook" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CreatorAnalysisToPatternPlaybook_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_remix_lineage_trends" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_remix_lineage_trends_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_remix_lineage_source_refs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_remix_lineage_source_refs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE INDEX "users_isDefault_idx" ON "users"("isDefault");

-- CreateIndex
CREATE INDEX "users_appSource_idx" ON "users"("appSource");

-- CreateIndex
CREATE INDEX "users_stripeCustomerId_idx" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_isDefault_idx" ON "organizations"("isDefault");

-- CreateIndex
CREATE INDEX "organizations_category_idx" ON "organizations"("category");

-- CreateIndex
CREATE INDEX "organizations_accountType_idx" ON "organizations"("accountType");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_isDefault_idx" ON "brands"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_userId_key" ON "settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");

-- CreateIndex
CREATE INDEX "credentials_oauthTokenHash_idx" ON "credentials"("oauthTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_keyFingerprint_idx" ON "api_keys"("keyFingerprint");

-- CreateIndex
CREATE INDEX "ingredients_groupId_idx" ON "ingredients"("groupId");

-- CreateIndex
CREATE INDEX "ingredients_scope_idx" ON "ingredients"("scope");

-- CreateIndex
CREATE INDEX "ingredients_isPublic_idx" ON "ingredients"("isPublic");

-- CreateIndex
CREATE INDEX "ingredients_agentRunId_idx" ON "ingredients"("agentRunId");

-- CreateIndex
CREATE INDEX "ingredients_agentStrategyId_idx" ON "ingredients"("agentStrategyId");

-- CreateIndex
CREATE INDEX "ingredients_personaSlug_idx" ON "ingredients"("personaSlug");

-- CreateIndex
CREATE INDEX "ingredients_isDeleted_personaId_reviewStatus_idx" ON "ingredients"("isDeleted", "personaId", "reviewStatus");

-- CreateIndex
CREATE INDEX "ingredients_campaign_isDeleted_personaSlug_idx" ON "ingredients"("campaign", "isDeleted", "personaSlug");

-- CreateIndex
CREATE INDEX "metadata_externalId_idx" ON "metadata"("externalId");

-- CreateIndex
CREATE INDEX "metadata_externalProvider_idx" ON "metadata"("externalProvider");

-- CreateIndex
CREATE INDEX "folders_organizationId_isDeleted_createdAt_idx" ON "folders"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "folders_brandId_isDeleted_createdAt_idx" ON "folders"("brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tags_organizationId_isDeleted_createdAt_idx" ON "tags"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tags_brandId_isDeleted_createdAt_idx" ON "tags"("brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tracked_links_shortCode_idx" ON "tracked_links"("shortCode");

-- CreateIndex
CREATE INDEX "posts_externalId_idx" ON "posts"("externalId");

-- CreateIndex
CREATE INDEX "posts_originalPostId_idx" ON "posts"("originalPostId");

-- CreateIndex
CREATE INDEX "posts_groupId_idx" ON "posts"("groupId");

-- CreateIndex
CREATE INDEX "posts_contentRunId_idx" ON "posts"("contentRunId");

-- CreateIndex
CREATE INDEX "posts_variantId_idx" ON "posts"("variantId");

-- CreateIndex
CREATE INDEX "posts_generationId_idx" ON "posts"("generationId");

-- CreateIndex
CREATE INDEX "posts_agentRunId_idx" ON "posts"("agentRunId");

-- CreateIndex
CREATE INDEX "posts_agentStrategyId_idx" ON "posts"("agentStrategyId");

-- CreateIndex
CREATE INDEX "posts_isDeleted_parentId_scheduledDate_status_idx" ON "posts"("isDeleted", "parentId", "scheduledDate", "status");

-- CreateIndex
CREATE INDEX "posts_isDeleted_organizationId_status_idx" ON "posts"("isDeleted", "organizationId", "status");

-- CreateIndex
CREATE INDEX "posts_brandId_isDeleted_status_idx" ON "posts"("brandId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "posts_isDeleted_nextScheduledDate_status_idx" ON "posts"("isDeleted", "nextScheduledDate", "status");

-- CreateIndex
CREATE INDEX "posts_organizationId_isDeleted_createdAt_idx" ON "posts"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "posts_brandId_isDeleted_createdAt_idx" ON "posts"("brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_userId_key" ON "user_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_balances_organizationId_key" ON "credit_balances"("organizationId");

-- CreateIndex
CREATE INDEX "article_analytics_organizationId_date_idx" ON "article_analytics"("organizationId", "date" DESC);

-- CreateIndex
CREATE INDEX "article_analytics_brandId_date_idx" ON "article_analytics"("brandId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "article_analytics_articleId_date_key" ON "article_analytics"("articleId", "date");

-- CreateIndex
CREATE INDEX "trainings_organizationId_isDeleted_createdAt_idx" ON "trainings"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "trainings_brandId_isDeleted_createdAt_idx" ON "trainings"("brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "trainings_isDeleted_personaId_stage_idx" ON "trainings"("isDeleted", "personaId", "stage");

-- CreateIndex
CREATE INDEX "models_organizationId_isActive_isDeleted_idx" ON "models"("organizationId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "personas_organizationId_isDeleted_status_idx" ON "personas"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "personas_brandId_organizationId_isDeleted_idx" ON "personas"("brandId", "organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "personas_organizationId_isDeleted_isAutopilotEnabled_nextAu_idx" ON "personas"("organizationId", "isDeleted", "isAutopilotEnabled", "nextAutopilotRunAt");

-- CreateIndex
CREATE INDEX "agent_thread_events_organizationId_threadId_commandId_idx" ON "agent_thread_events"("organizationId", "threadId", "commandId");

-- CreateIndex
CREATE INDEX "agent_thread_events_organizationId_runId_sequence_idx" ON "agent_thread_events"("organizationId", "runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "agent_thread_events_organizationId_threadId_sequence_key" ON "agent_thread_events"("organizationId", "threadId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "agent_thread_snapshots_organizationId_threadId_key" ON "agent_thread_snapshots"("organizationId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "thread_context_states_organizationId_threadId_key" ON "thread_context_states"("organizationId", "threadId");

-- CreateIndex
CREATE INDEX "batch_workflow_jobs_organizationId_status_idx" ON "batch_workflow_jobs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "batch_workflow_jobs_workflowId_idx" ON "batch_workflow_jobs"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "task_counters_organizationId_key" ON "task_counters"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "processed_tweets_organizationId_tweetId_processedBy_key" ON "processed_tweets"("organizationId", "tweetId", "processedBy");

-- CreateIndex
CREATE INDEX "content_performance_organizationId_idx" ON "content_performance"("organizationId");

-- CreateIndex
CREATE INDEX "content_performance_brandId_idx" ON "content_performance"("brandId");

-- CreateIndex
CREATE INDEX "content_performance_platform_idx" ON "content_performance"("platform");

-- CreateIndex
CREATE INDEX "content_performance_contentRunId_idx" ON "content_performance"("contentRunId");

-- CreateIndex
CREATE INDEX "content_performance_variantId_idx" ON "content_performance"("variantId");

-- CreateIndex
CREATE INDEX "content_performance_generationId_idx" ON "content_performance"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_optimization_configs_organizationId_key" ON "ad_optimization_configs"("organizationId");

-- CreateIndex
CREATE INDEX "elements_blacklists_organizationId_isDeleted_createdAt_idx" ON "elements_blacklists"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_cameras_organizationId_isDeleted_createdAt_idx" ON "elements_cameras"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "template_metadata_templateId_key" ON "template_metadata"("templateId");

-- CreateIndex
CREATE INDEX "leads_organizationId_isDeleted_status_idx" ON "leads"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "fanvue_content_organizationId_isDeleted_status_idx" ON "fanvue_content"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "fanvue_content_organizationId_publishedAt_idx" ON "fanvue_content"("organizationId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "fanvue_earnings_organizationId_isDeleted_type_idx" ON "fanvue_earnings"("organizationId", "isDeleted", "type");

-- CreateIndex
CREATE INDEX "fanvue_earnings_organizationId_earnedAt_idx" ON "fanvue_earnings"("organizationId", "earnedAt" DESC);

-- CreateIndex
CREATE INDEX "fanvue_schedules_organizationId_isDeleted_status_idx" ON "fanvue_schedules"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "fanvue_schedules_scheduledAt_status_idx" ON "fanvue_schedules"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "fanvue_subscribers_organizationId_isDeleted_status_idx" ON "fanvue_subscribers"("organizationId", "isDeleted", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fanvue_subscribers_organizationId_externalId_key" ON "fanvue_subscribers"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "_member_brands_B_index" ON "_member_brands"("B");

-- CreateIndex
CREATE INDEX "_workflow_brands_B_index" ON "_workflow_brands"("B");

-- CreateIndex
CREATE INDEX "_credential_tags_B_index" ON "_credential_tags"("B");

-- CreateIndex
CREATE INDEX "_persona_credentials_B_index" ON "_persona_credentials"("B");

-- CreateIndex
CREATE INDEX "_ingredient_sources_B_index" ON "_ingredient_sources"("B");

-- CreateIndex
CREATE INDEX "_ingredient_tags_B_index" ON "_ingredient_tags"("B");

-- CreateIndex
CREATE INDEX "_post_ingredients_B_index" ON "_post_ingredients"("B");

-- CreateIndex
CREATE INDEX "_post_analytics_ingredients_B_index" ON "_post_analytics_ingredients"("B");

-- CreateIndex
CREATE INDEX "_training_sources_B_index" ON "_training_sources"("B");

-- CreateIndex
CREATE INDEX "_task_linked_outputs_B_index" ON "_task_linked_outputs"("B");

-- CreateIndex
CREATE INDEX "_task_approved_outputs_B_index" ON "_task_approved_outputs"("B");

-- CreateIndex
CREATE INDEX "_metadata_tags_B_index" ON "_metadata_tags"("B");

-- CreateIndex
CREATE INDEX "_prompt_tags_B_index" ON "_prompt_tags"("B");

-- CreateIndex
CREATE INDEX "_folder_tags_B_index" ON "_folder_tags"("B");

-- CreateIndex
CREATE INDEX "_workflow_tags_B_index" ON "_workflow_tags"("B");

-- CreateIndex
CREATE INDEX "_bookmark_tags_B_index" ON "_bookmark_tags"("B");

-- CreateIndex
CREATE INDEX "_bookmark_extracted_B_index" ON "_bookmark_extracted"("B");

-- CreateIndex
CREATE INDEX "_bookmark_generated_B_index" ON "_bookmark_generated"("B");

-- CreateIndex
CREATE INDEX "_post_tags_B_index" ON "_post_tags"("B");

-- CreateIndex
CREATE INDEX "_article_tags_B_index" ON "_article_tags"("B");

-- CreateIndex
CREATE INDEX "_newsletter_articles_B_index" ON "_newsletter_articles"("B");

-- CreateIndex
CREATE INDEX "_newsletter_context_B_index" ON "_newsletter_context"("B");

-- CreateIndex
CREATE INDEX "_persona_tags_B_index" ON "_persona_tags"("B");

-- CreateIndex
CREATE INDEX "_persona_assigned_members_B_index" ON "_persona_assigned_members"("B");

-- CreateIndex
CREATE INDEX "_task_linked_runs_B_index" ON "_task_linked_runs"("B");

-- CreateIndex
CREATE INDEX "_campaign_agents_B_index" ON "_campaign_agents"("B");

-- CreateIndex
CREATE INDEX "_CreatorAnalysisToPatternPlaybook_B_index" ON "_CreatorAnalysisToPatternPlaybook"("B");

-- CreateIndex
CREATE INDEX "_remix_lineage_trends_B_index" ON "_remix_lineage_trends"("B");

-- CreateIndex
CREATE INDEX "_remix_lineage_source_refs_B_index" ON "_remix_lineage_source_refs"("B");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_voiceIngredientId_fkey" FOREIGN KEY ("voiceIngredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_musicIngredientId_fkey" FOREIGN KEY ("musicIngredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_lastUsedBrandId_fkey" FOREIGN KEY ("lastUsedBrandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_integrations" ADD CONSTRAINT "org_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_metadataId_fkey" FOREIGN KEY ("metadataId") REFERENCES "metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "bookmarks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_agentStrategyId_fkey" FOREIGN KEY ("agentStrategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "tracked_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_entityIngredientId_fkey" FOREIGN KEY ("entityIngredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_entityArticleId_fkey" FOREIGN KEY ("entityArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_contentRunId_fkey" FOREIGN KEY ("contentRunId") REFERENCES "content_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_agentStrategyId_fkey" FOREIGN KEY ("agentStrategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_schedules" ADD CONSTRAINT "content_schedules_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurposing_jobs" ADD CONSTRAINT "repurposing_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repurposing_jobs" ADD CONSTRAINT "repurposing_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_attributions" ADD CONSTRAINT "subscription_attributions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_attributions" ADD CONSTRAINT "subscription_attributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_attributions" ADD CONSTRAINT "subscription_attributions_sourceContentId_fkey" FOREIGN KEY ("sourceContentId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_attributions" ADD CONSTRAINT "subscription_attributions_sourceLinkId_fkey" FOREIGN KEY ("sourceLinkId") REFERENCES "tracked_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_analytics" ADD CONSTRAINT "article_analytics_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_analytics" ADD CONSTRAINT "article_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_analytics" ADD CONSTRAINT "article_analytics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_analytics" ADD CONSTRAINT "article_analytics_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_parentModelId_fkey" FOREIGN KEY ("parentModelId") REFERENCES "models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_avatarIngredientId_fkey" FOREIGN KEY ("avatarIngredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_voiceIngredientId_fkey" FOREIGN KEY ("voiceIngredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategies" ADD CONSTRAINT "agent_strategies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategies" ADD CONSTRAINT "agent_strategies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategies" ADD CONSTRAINT "agent_strategies_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategies" ADD CONSTRAINT "agent_strategies_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "agent_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_opportunities" ADD CONSTRAINT "agent_strategy_opportunities_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "agent_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_opportunities" ADD CONSTRAINT "agent_strategy_opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_opportunities" ADD CONSTRAINT "agent_strategy_opportunities_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_reports" ADD CONSTRAINT "agent_strategy_reports_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "agent_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_reports" ADD CONSTRAINT "agent_strategy_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_strategy_reports" ADD CONSTRAINT "agent_strategy_reports_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_campaigns" ADD CONSTRAINT "agent_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_campaigns" ADD CONSTRAINT "agent_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_campaigns" ADD CONSTRAINT "agent_campaigns_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_campaigns" ADD CONSTRAINT "agent_campaigns_campaignLeadStrategyId_fkey" FOREIGN KEY ("campaignLeadStrategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "agent_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_thread_events" ADD CONSTRAINT "agent_thread_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_thread_events" ADD CONSTRAINT "agent_thread_events_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_thread_snapshots" ADD CONSTRAINT "agent_thread_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_thread_snapshots" ADD CONSTRAINT "agent_thread_snapshots_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_context_states" ADD CONSTRAINT "thread_context_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_context_states" ADD CONSTRAINT "thread_context_states_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workflows" ADD CONSTRAINT "agent_workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_workflow_jobs" ADD CONSTRAINT "batch_workflow_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_workflow_jobs" ADD CONSTRAINT "batch_workflow_jobs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_runs" ADD CONSTRAINT "cron_runs_cronJobId_fkey" FOREIGN KEY ("cronJobId") REFERENCES "cron_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_runs" ADD CONSTRAINT "cron_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_runs" ADD CONSTRAINT "cron_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_planningThreadId_fkey" FOREIGN KEY ("planningThreadId") REFERENCES "agent_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_counters" ADD CONSTRAINT "task_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_activities" ADD CONSTRAINT "bot_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_activities" ADD CONSTRAINT "bot_activities_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_activities" ADD CONSTRAINT "bot_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_activities" ADD CONSTRAINT "bot_activities_replyBotConfigId_fkey" FOREIGN KEY ("replyBotConfigId") REFERENCES "reply_bot_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_activities" ADD CONSTRAINT "bot_activities_monitoredAccountId_fkey" FOREIGN KEY ("monitoredAccountId") REFERENCES "monitored_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_bot_configs" ADD CONSTRAINT "reply_bot_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_bot_configs" ADD CONSTRAINT "reply_bot_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_accounts" ADD CONSTRAINT "monitored_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_accounts" ADD CONSTRAINT "monitored_accounts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_accounts" ADD CONSTRAINT "monitored_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_accounts" ADD CONSTRAINT "monitored_accounts_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitored_accounts" ADD CONSTRAINT "monitored_accounts_botConfigId_fkey" FOREIGN KEY ("botConfigId") REFERENCES "reply_bot_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_tweets" ADD CONSTRAINT "processed_tweets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_tweets" ADD CONSTRAINT "processed_tweets_replyBotConfigId_fkey" FOREIGN KEY ("replyBotConfigId") REFERENCES "reply_bot_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_tweets" ADD CONSTRAINT "processed_tweets_monitoredAccountId_fkey" FOREIGN KEY ("monitoredAccountId") REFERENCES "monitored_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_contentRunId_fkey" FOREIGN KEY ("contentRunId") REFERENCES "content_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_patterns" ADD CONSTRAINT "content_patterns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_patterns" ADD CONSTRAINT "content_patterns_sourceCreatorId_fkey" FOREIGN KEY ("sourceCreatorId") REFERENCES "creator_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_analyses" ADD CONSTRAINT "creator_analyses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_analyses" ADD CONSTRAINT "creator_analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_playbooks" ADD CONSTRAINT "pattern_playbooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_patterns" ADD CONSTRAINT "creative_patterns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_patterns" ADD CONSTRAINT "creative_patterns_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_contentRunId_fkey" FOREIGN KEY ("contentRunId") REFERENCES "content_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_items" ADD CONSTRAINT "content_plan_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_items" ADD CONSTRAINT "content_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "content_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_items" ADD CONSTRAINT "content_plan_items_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scores" ADD CONSTRAINT "content_scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimizations" ADD CONSTRAINT "optimizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimizations" ADD CONSTRAINT "optimizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimizations" ADD CONSTRAINT "optimizations_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "content_scores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_bulk_upload_jobs" ADD CONSTRAINT "ad_bulk_upload_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_bulk_upload_jobs" ADD CONSTRAINT "ad_bulk_upload_jobs_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_bulk_upload_jobs" ADD CONSTRAINT "ad_bulk_upload_jobs_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative_mappings" ADD CONSTRAINT "ad_creative_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative_mappings" ADD CONSTRAINT "ad_creative_mappings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_optimization_audit_logs" ADD CONSTRAINT "ad_optimization_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_optimization_configs" ADD CONSTRAINT "ad_optimization_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_optimization_recommendations" ADD CONSTRAINT "ad_optimization_recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trends" ADD CONSTRAINT "trends_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trends" ADD CONSTRAINT "trends_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_preferences" ADD CONSTRAINT "trend_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_preferences" ADD CONSTRAINT "trend_preferences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_remix_lineages" ADD CONSTRAINT "trend_remix_lineages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_remix_lineages" ADD CONSTRAINT "trend_remix_lineages_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_remix_lineages" ADD CONSTRAINT "trend_remix_lineages_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "content_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_remix_lineages" ADD CONSTRAINT "trend_remix_lineages_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_source_reference_links" ADD CONSTRAINT "trend_source_reference_links_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "trends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_source_reference_links" ADD CONSTRAINT "trend_source_reference_links_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "trend_source_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_source_reference_snapshots" ADD CONSTRAINT "trend_source_reference_snapshots_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "trend_source_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "outreach_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presets" ADD CONSTRAINT "presets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presets" ADD CONSTRAINT "presets_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captions" ADD CONSTRAINT "captions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captions" ADD CONSTRAINT "captions_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captions" ADD CONSTRAINT "captions_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captions" ADD CONSTRAINT "captions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_projects" ADD CONSTRAINT "clip_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_projects" ADD CONSTRAINT "clip_projects_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clip_results" ADD CONSTRAINT "clip_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_projects" ADD CONSTRAINT "editor_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_projects" ADD CONSTRAINT "editor_projects_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_projects" ADD CONSTRAINT "editor_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_projects" ADD CONSTRAINT "editor_projects_renderedVideoId_fkey" FOREIGN KEY ("renderedVideoId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_memories" ADD CONSTRAINT "brand_memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_memories" ADD CONSTRAINT "brand_memories_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_bases" ADD CONSTRAINT "context_bases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_bases" ADD CONSTRAINT "context_bases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_bases" ADD CONSTRAINT "context_bases_sourceBrandId_fkey" FOREIGN KEY ("sourceBrandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_contextBaseId_fkey" FOREIGN KEY ("contextBaseId") REFERENCES "context_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_metadata" ADD CONSTRAINT "template_metadata_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_usages" ADD CONSTRAINT "template_usages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_proactiveOrganizationId_fkey" FOREIGN KEY ("proactiveOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_proactiveBrandId_fkey" FOREIGN KEY ("proactiveBrandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_agentStrategyId_fkey" FOREIGN KEY ("agentStrategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fanvue_schedules" ADD CONSTRAINT "fanvue_schedules_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "fanvue_content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_member_brands" ADD CONSTRAINT "_member_brands_A_fkey" FOREIGN KEY ("A") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_member_brands" ADD CONSTRAINT "_member_brands_B_fkey" FOREIGN KEY ("B") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_workflow_brands" ADD CONSTRAINT "_workflow_brands_A_fkey" FOREIGN KEY ("A") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_workflow_brands" ADD CONSTRAINT "_workflow_brands_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_credential_tags" ADD CONSTRAINT "_credential_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_credential_tags" ADD CONSTRAINT "_credential_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_credentials" ADD CONSTRAINT "_persona_credentials_A_fkey" FOREIGN KEY ("A") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_credentials" ADD CONSTRAINT "_persona_credentials_B_fkey" FOREIGN KEY ("B") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ingredient_sources" ADD CONSTRAINT "_ingredient_sources_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ingredient_sources" ADD CONSTRAINT "_ingredient_sources_B_fkey" FOREIGN KEY ("B") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ingredient_tags" ADD CONSTRAINT "_ingredient_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ingredient_tags" ADD CONSTRAINT "_ingredient_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_ingredients" ADD CONSTRAINT "_post_ingredients_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_ingredients" ADD CONSTRAINT "_post_ingredients_B_fkey" FOREIGN KEY ("B") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_analytics_ingredients" ADD CONSTRAINT "_post_analytics_ingredients_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_analytics_ingredients" ADD CONSTRAINT "_post_analytics_ingredients_B_fkey" FOREIGN KEY ("B") REFERENCES "post_analytics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_training_sources" ADD CONSTRAINT "_training_sources_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_training_sources" ADD CONSTRAINT "_training_sources_B_fkey" FOREIGN KEY ("B") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_linked_outputs" ADD CONSTRAINT "_task_linked_outputs_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_linked_outputs" ADD CONSTRAINT "_task_linked_outputs_B_fkey" FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_approved_outputs" ADD CONSTRAINT "_task_approved_outputs_A_fkey" FOREIGN KEY ("A") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_approved_outputs" ADD CONSTRAINT "_task_approved_outputs_B_fkey" FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_metadata_tags" ADD CONSTRAINT "_metadata_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_metadata_tags" ADD CONSTRAINT "_metadata_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_prompt_tags" ADD CONSTRAINT "_prompt_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_prompt_tags" ADD CONSTRAINT "_prompt_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_folder_tags" ADD CONSTRAINT "_folder_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_folder_tags" ADD CONSTRAINT "_folder_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_workflow_tags" ADD CONSTRAINT "_workflow_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_workflow_tags" ADD CONSTRAINT "_workflow_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_tags" ADD CONSTRAINT "_bookmark_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_tags" ADD CONSTRAINT "_bookmark_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_extracted" ADD CONSTRAINT "_bookmark_extracted_A_fkey" FOREIGN KEY ("A") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_extracted" ADD CONSTRAINT "_bookmark_extracted_B_fkey" FOREIGN KEY ("B") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_generated" ADD CONSTRAINT "_bookmark_generated_A_fkey" FOREIGN KEY ("A") REFERENCES "bookmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_bookmark_generated" ADD CONSTRAINT "_bookmark_generated_B_fkey" FOREIGN KEY ("B") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_tags" ADD CONSTRAINT "_post_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_post_tags" ADD CONSTRAINT "_post_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_article_tags" ADD CONSTRAINT "_article_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_article_tags" ADD CONSTRAINT "_article_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_newsletter_articles" ADD CONSTRAINT "_newsletter_articles_A_fkey" FOREIGN KEY ("A") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_newsletter_articles" ADD CONSTRAINT "_newsletter_articles_B_fkey" FOREIGN KEY ("B") REFERENCES "newsletters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_newsletter_context" ADD CONSTRAINT "_newsletter_context_A_fkey" FOREIGN KEY ("A") REFERENCES "newsletters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_newsletter_context" ADD CONSTRAINT "_newsletter_context_B_fkey" FOREIGN KEY ("B") REFERENCES "newsletters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_tags" ADD CONSTRAINT "_persona_tags_A_fkey" FOREIGN KEY ("A") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_tags" ADD CONSTRAINT "_persona_tags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_assigned_members" ADD CONSTRAINT "_persona_assigned_members_A_fkey" FOREIGN KEY ("A") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_persona_assigned_members" ADD CONSTRAINT "_persona_assigned_members_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_linked_runs" ADD CONSTRAINT "_task_linked_runs_A_fkey" FOREIGN KEY ("A") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_task_linked_runs" ADD CONSTRAINT "_task_linked_runs_B_fkey" FOREIGN KEY ("B") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_campaign_agents" ADD CONSTRAINT "_campaign_agents_A_fkey" FOREIGN KEY ("A") REFERENCES "agent_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_campaign_agents" ADD CONSTRAINT "_campaign_agents_B_fkey" FOREIGN KEY ("B") REFERENCES "agent_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatorAnalysisToPatternPlaybook" ADD CONSTRAINT "_CreatorAnalysisToPatternPlaybook_A_fkey" FOREIGN KEY ("A") REFERENCES "creator_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatorAnalysisToPatternPlaybook" ADD CONSTRAINT "_CreatorAnalysisToPatternPlaybook_B_fkey" FOREIGN KEY ("B") REFERENCES "pattern_playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_remix_lineage_trends" ADD CONSTRAINT "_remix_lineage_trends_A_fkey" FOREIGN KEY ("A") REFERENCES "trends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_remix_lineage_trends" ADD CONSTRAINT "_remix_lineage_trends_B_fkey" FOREIGN KEY ("B") REFERENCES "trend_remix_lineages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_remix_lineage_source_refs" ADD CONSTRAINT "_remix_lineage_source_refs_A_fkey" FOREIGN KEY ("A") REFERENCES "trend_remix_lineages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_remix_lineage_source_refs" ADD CONSTRAINT "_remix_lineage_source_refs_B_fkey" FOREIGN KEY ("B") REFERENCES "trend_source_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
