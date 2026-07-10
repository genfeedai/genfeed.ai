/**
 * Serializer Drift Detector
 *
 * Prisma records are serialized through a public allowlist, so equality with a
 * raw Prisma model would incorrectly require internal columns and foreign keys
 * to be exposed. This guard instead verifies that every serializer attribute is
 * backed by its Prisma model, declared document projection, configured
 * relationship, or an explicitly classified computed projection.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SCHEMA_ROOTS = [
  'apps/server/api/src',
  'apps/server/server/src',
  'ee/packages',
];
const PRISMA_SCHEMA_PATH = 'packages/prisma/prisma/schema.prisma';
const SERIALIZER_ROOT = 'packages/serializers/src';

const SCHEMA_TO_SERIALIZER_BASENAME_OVERRIDES: Record<string, string> = {
  'credit-transactions': 'credit-transaction',
  'organization-setting': 'organization-settings',
};

const SCHEMA_DOCUMENT_NAME_OVERRIDES: Record<string, string> = {
  'agent-thread': 'AgentRoomDocument',
  blacklist: 'ElementBlacklistDocument',
  camera: 'ElementCameraDocument',
  'camera-movement': 'ElementCameraMovementDocument',
  lens: 'ElementLensDocument',
  lighting: 'ElementLightingDocument',
  mood: 'ElementMoodDocument',
  scene: 'ElementSceneDocument',
  sound: 'ElementSoundDocument',
  style: 'ElementStyleDocument',
};

/**
 * Computed public fields that are neither Prisma columns nor relationship
 * entries in the serializer config. Missing pairs and removed serializer
 * fields fail closed; structural backing takes precedence over this baseline.
 * Every covered pair has an entry, including an empty array, so discovery or
 * matching regressions cannot silently reduce coverage to a smaller nonzero set.
 */
export const SERIALIZER_PROJECTIONS: Record<string, readonly string[]> = {
  'activity:Activity': ['totalFailed', 'totalRequested', 'totalUpdated'],
  'agent-campaign:AgentCampaign': [
    'endDate',
    'orchestrationEnabled',
    'startDate',
  ],
  'agent-strategy:AgentStrategy': [
    'autoPublishConfidenceThreshold',
    'consecutiveFailures',
    'creditsUsedToday',
    'displayRole',
    'engagementEnabled',
    'engagementKeywords',
    'engagementTone',
    'expectedSpendToDate',
    'lastRunAt',
    'maxEngagementsPerDay',
    'minCreditThreshold',
    'nextRunAt',
    'preferredPostingTimes',
    'reportsToLabel',
    'runFrequency',
    'teamGroup',
    'timezone',
    'voice',
    'weeklyResetAt',
  ],
  'article:Article': [
    'aiGeneration',
    'bannerUrl',
    'evaluation',
    'generationPrompt',
    'performanceMetrics',
    'xArticleMetadata',
  ],
  'batch:Batch': [
    'completedAt',
    'completedCount',
    'contentMix',
    'dateRangeEnd',
    'dateRangeStart',
    'failedCount',
    'platforms',
    'source',
    'style',
    'topics',
    'totalCount',
  ],
  'bot-activity:BotActivity': [
    'platform',
    'processingTimeMs',
    'replyContentId',
    'replyContentUrl',
    'skippedReason',
    'triggerContentAuthor',
    'triggerContentId',
    'triggerContentText',
    'triggerContentUrl',
  ],
  'bot:Bot': [
    'alertsTriggered',
    'engagementSettings',
    'engagementsCount',
    'lastActivityAt',
    'messagesCount',
    'monitoringSettings',
    'postsPublished',
    'publishingSettings',
    'scope',
  ],
  'brand:Brand': [
    'bannerUrl',
    'externalHandle',
    'externalId',
    'instagramHandle',
    'logoUrl',
  ],
  'caption:Caption': ['brand', 'format', 'language'],
  'content-plan-item:ContentPlanItem': [],
  'content-plan:ContentPlan': [],
  'content-run:ContentRun': [
    'analyticsSummary',
    'brief',
    'creditsUsed',
    'duration',
    'error',
    'input',
    'output',
    'publish',
    'recommendations',
    'skillSlug',
    'source',
    'variants',
  ],
  'credential:Credential': ['accountHealth'],
  'cron-run:CronRun': ['endedAt'],
  'distribution:Distribution': ['errorMessage', 'publishedAt'],
  'editor-project:EditorProject': ['name'],
  'fanvue-content:FanvueContent': [
    'caption',
    'externalId',
    'isPinned',
    'mediaUrls',
    'price',
    'title',
    'type',
  ],
  'fanvue-earnings:FanvueEarnings': [
    'amount',
    'currency',
    'externalTransactionId',
  ],
  'fanvue-schedule:FanvueSchedule': [
    'caption',
    'errorMessage',
    'mediaUrls',
    'price',
  ],
  'fanvue-subscriber:FanvueSubscriber': [
    'displayName',
    'expiresAt',
    'subscribedAt',
    'tier',
    'username',
  ],
  'harness-profile:Profile': [
    'audience',
    'brandId',
    'description',
    'examples',
    'guardrails',
    'handles',
    'isDefault',
    'label',
    'metadata',
    'platforms',
    'profileType',
    'scope',
    'status',
    'structure',
    'thesis',
    'voice',
  ],
  'image:Ingredient': [
    'blacklist',
    'blacklists',
    'camera',
    'enhanceModel',
    'evaluation',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'format',
    'frame',
    'hasVoted',
    'height',
    'isBrandingEnabled',
    'lens',
    'lighting',
    'model',
    'mood',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'publications',
    'references',
    'resolution',
    'scene',
    'script',
    'seed',
    'speech',
    'style',
    'subjectDetection',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'width',
  ],
  'ingredient:Ingredient': [
    'blacklists',
    'camera',
    'enhanceModel',
    'evaluation',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'frame',
    'hasVoted',
    'height',
    'model',
    'mood',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'publications',
    'references',
    'scene',
    'script',
    'speech',
    'style',
    'subjectDetection',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'width',
  ],
  'insight:Insight': [
    'actionableSteps',
    'category',
    'confidence',
    'description',
    'expiresAt',
    'impact',
    'isDismissed',
    'isRead',
    'relatedMetrics',
    'title',
  ],
  'livestream-bot-session:LivestreamBotSession': [],
  'metadata:Metadata': ['modelLabel'],
  'model:Model': [
    'aspectRatios',
    'costPerUnit',
    'defaultAspectRatio',
    'defaultDuration',
    'deprecatedAt',
    'discoveredAt',
    'durations',
    'hasAudioToggle',
    'hasDurationEditing',
    'hasEndFrame',
    'hasInterpolation',
    'hasResolutionOptions',
    'hasSpeech',
    'inputCostPerMillionTokens',
    'isBatchSupported',
    'isDeprecated',
    'isDiscovered',
    'isImagenModel',
    'isLegacy',
    'isPublic',
    'isReferencesMandatory',
    'lastSyncedAt',
    'margin',
    'maxOutputs',
    'maxReferences',
    'minCost',
    'minDimensions',
    'outputCostPerMillionTokens',
    'predecessorOf',
    'pricingType',
    'providerConfig',
    'providerCostUsd',
    'rejectionReason',
    'reviewStatus',
    'reviewedAt',
    'reviewedBy',
    'succeededBy',
    'usesOrientation',
  ],
  'monitored-account:MonitoredAccount': [
    'avatarUrl',
    'bio',
    'displayName',
    'externalId',
    'followersCount',
    'lastPostId',
    'platform',
    'username',
  ],
  'optimization:Optimization': [
    'changes',
    'contentType',
    'goals',
    'improvementScore',
    'optimizedContent',
    'originalContent',
    'platform',
    'wasApplied',
  ],
  'organization-setting:OrganizationSetting': ['enabledModels'],
  'outreach-campaign:OutreachCampaign': [
    'lastActivityAt',
    'totalDmsSent',
    'totalFailed',
    'totalSkipped',
    'totalTargets',
  ],
  'persona:Persona': [
    'bio',
    'contentStrategy',
    'emoji',
    'loraModelPath',
    'loraStatus',
    'niche',
  ],
  'post:Post': [
    'analytics',
    'avgEngagementRate',
    'evalScore',
    'evaluation',
    'totalComments',
    'totalLikes',
    'totalSaves',
    'totalShares',
    'totalViews',
  ],
  'prompt:Prompt': ['modelSettings', 'systemPromptKey', 'tokens', 'version'],
  'reply-bot-config:ReplyBotConfig': [
    'credential',
    'name',
    'platform',
    'replyInstructions',
    'schedule',
    'templateId',
  ],
  'schedule:Schedule': [
    'content',
    'errorMessage',
    'expectedEngagement',
    'performance',
    'publishedAt',
    'status',
  ],
  'subscription-attribution:SubscriptionAttribution': [
    'amount',
    'currency',
    'email',
    'expiresAt',
    'plan',
    'source',
    'status',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'subscribedAt',
    'utm',
  ],
  'subscription:Subscription': ['category', 'planId'],
  'task-comment:TaskComment': ['authorAgentId', 'authorUserId', 'body'],
  'task:Task': ['linkedEntities', 'linkedIssueId'],
  'template:Template': [
    'createdBy',
    'industry',
    'isPremium',
    'performance',
    'thumbnail',
    'user',
  ],
  'training:Training': [
    'baseModel',
    'category',
    'completedAt',
    'error',
    'learningRate',
    'loraName',
    'loraRank',
    'personaSlug',
    'progress',
    'provider',
    'seed',
    'startedAt',
    'status',
    'steps',
    'totalGeneratedImages',
    'totalSources',
    'trigger',
  ],
  'transcript:Transcript': [
    'audioFileUrl',
    'error',
    'status',
    'transcriptText',
    'videoDuration',
    'videoTitle',
    'youtubeId',
    'youtubeUrl',
  ],
  'trend:Trend': ['growthRate', 'mentions', 'metadata'],
  'voice:Ingredient': [
    'accent',
    'blacklists',
    'camera',
    'enhanceModel',
    'evaluation',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'frame',
    'gender',
    'hasVoted',
    'height',
    'isActive',
    'model',
    'mood',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'pitch',
    'publications',
    'references',
    'scene',
    'script',
    'speech',
    'speed',
    'style',
    'subjectDetection',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'voiceId',
    'volume',
    'width',
  ],
  'vote:Vote': ['entity'],
  'watchlist:Watchlist': [
    'avatarUrl',
    'category',
    'label',
    'metrics',
    'notes',
    'profileUrl',
  ],
  'workflow:Workflow': ['cloudSync', 'key', 'tasks'],
  'agent-thread:AgentThread': [
    'attentionState',
    'lastActivityAt',
    'lastAssistantPreview',
    'pendingInputCount',
    'runStatus',
  ],
  'announcement:Announcement': [
    'authorId',
    'body',
    'channels',
    'discordChannelId',
    'discordMessageUrl',
    'publishedAt',
    'tweetId',
    'tweetText',
    'tweetUrl',
  ],
  'blacklist:ElementBlacklist': [
    'isActive',
    'isDefault',
    'isFavorite',
    'organization',
  ],
  'camera-movement:ElementCameraMovement': [
    'category',
    'isActive',
    'isDefault',
    'organization',
    'user',
  ],
  'camera:ElementCamera': ['category'],
  'clip-project:ClipProject': [
    'transcriptSegments',
    'transcriptSrt',
    'videoMetadata',
  ],
  'clip-result:ClipResult': [
    'clipType',
    'index',
    'providerName',
    'summary',
    'tags',
    'title',
    'user',
  ],
  'folder:Folder': ['key'],
  'goal:Goal': ['description', 'title'],
  'lens:ElementLens': [
    'category',
    'isActive',
    'isDefault',
    'organization',
    'user',
  ],
  'lighting:ElementLighting': [
    'category',
    'isActive',
    'isDefault',
    'organization',
    'user',
  ],
  'mood:ElementMood': ['category', 'isFavorite'],
  'preset:Preset': [
    'blacklists',
    'camera',
    'description',
    'ingredient',
    'key',
    'label',
    'model',
    'mood',
    'platform',
    'prompt',
    'provider',
    'scene',
    'style',
  ],
  'scene:ElementScene': ['category'],
  'sound:ElementSound': ['category', 'isActive', 'isDefault', 'organization'],
  'style:ElementStyle': ['category', 'isFavorite', 'models'],
  'agent-run:AgentRun': [],
  'asset:Asset': [],
  'bookmark:Bookmark': [],
  'brand-memory:BrandMemory': [],
  'content-draft:ContentDraft': [],
  'content-performance:ContentPerformance': [],
  'content-schedule:ContentSchedule': [],
  'context-base:ContextBase': [],
  'context-entry:ContextEntry': [],
  'cron-job:CronJob': [],
  'evaluation:Evaluation': [],
  'font-family:FontFamilyRecord': [],
  'link:Link': [],
  'member:Member': [],
  'mood-board:MoodBoard': [],
  'newsletter:Newsletter': [],
  'organization:Organization': [],
  'platform-setting:PlatformSetting': [],
  'profile:Profile': [],
  'project:Project': [],
  'role:Role': [],
  'run:Run': [],
  'setting:Setting': [],
  'social-source:SocialSource': [],
  'tag:Tag': [],
  'tracked-link:TrackedLink': [],
  'user:User': [],
  'workflow-execution:WorkflowExecution': [],
  'api-key:ApiKey': [],
  'avatar:Ingredient': [
    'age',
    'blacklists',
    'camera',
    'description',
    'duration',
    'enhanceModel',
    'evaluation',
    'extension',
    'externalId',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'fps',
    'frame',
    'gender',
    'hasAudio',
    'hasVoted',
    'height',
    'label',
    'model',
    'modelLabel',
    'mood',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'provider',
    'publications',
    'quality',
    'references',
    'resolution',
    'result',
    'scene',
    'script',
    'size',
    'speech',
    'style',
    'subjectDetection',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'voice',
    'width',
  ],
  'music:Ingredient': [
    'blacklists',
    'bpm',
    'camera',
    'duration',
    'enhanceModel',
    'evaluation',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'frame',
    'genre',
    'hasVoted',
    'height',
    'instrument',
    'key',
    'label',
    'model',
    'mood',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'publications',
    'references',
    'scene',
    'script',
    'speech',
    'style',
    'subjectDetection',
    'tempo',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'width',
  ],
  'social-conversation:SocialConversation': [],
  'social-message:SocialMessage': [],
  'video:Ingredient': [
    'backgroundMusic',
    'bitrate',
    'blacklist',
    'blacklists',
    'camera',
    'cameraMovement',
    'codec',
    'duration',
    'endFrame',
    'enhanceModel',
    'evaluation',
    'faceEnhancement',
    'faceEnhancementCreativity',
    'faceEnhancementStrength',
    'fontFamily',
    'format',
    'frame',
    'frameRate',
    'hasVoted',
    'height',
    'isAudioEnabled',
    'isBrandingEnabled',
    'lens',
    'lighting',
    'model',
    'mood',
    'musicVolume',
    'muteVideoAudio',
    'outputFormat',
    'outputs',
    'pendingIngredientIds',
    'provider',
    'reference',
    'references',
    'resolution',
    'scene',
    'script',
    'seed',
    'sounds',
    'speech',
    'style',
    'subjectDetection',
    'text',
    'totalChildren',
    'totalVotes',
    'upscaleFactor',
    'width',
  ],
};

const IGNORED_ATTRIBUTE_FIELDS = new Set([
  '_id',
  'createdAt',
  'id',
  'isDeleted',
  'mongoId',
  'updatedAt',
]);

type ImportBinding = {
  importedName: string;
  source: string;
};

type AttributeExpression =
  | { fields: string[]; kind: 'array' }
  | { kind: 'alias'; targetName: string }
  | { excludedFields: string[]; kind: 'filter'; targetName: string };

type ParsedAttributeFile = {
  exports: Set<string>;
  imports: Map<string, ImportBinding>;
  symbols: Map<string, AttributeExpression>;
};

export type PrismaModelInfo = {
  fields: Set<string>;
  modelName: string;
};

export type SchemaInfo = {
  basename: string;
  documentFields: Set<string>;
  documentName: string;
  filePath: string;
  modelName: string;
  omittedModelFields: Set<string>;
};

export type SerializerInfo = {
  attributeFields: Set<string>;
  attributeFilePath: string;
  attributeName: string;
  basename: string;
  configFilePath: string;
  relationshipFields: Set<string>;
  serializerFilePath: string;
};

export type SerializerDrift = {
  schema: SchemaInfo;
  serializer: SerializerInfo;
  unbackedFields: string[];
};

export type UnmatchedSchema = {
  reason: string;
  schema: SchemaInfo;
};

export type UnresolvedSchemaCandidate = {
  basename: string;
  filePath: string;
  reason: string;
};

export type SerializerDriftCheckOptions = {
  files?: string[];
  projections?: Record<string, readonly string[]>;
  rootDir?: string;
  schemaRoots?: string[];
};

export type SerializerDriftCheckResult = {
  discoveredSchemaCount: number;
  drifts: SerializerDrift[];
  errors: string[];
  matchedCount: number;
  matchedPairKeys: string[];
  scannedCount: number;
  serializerCount: number;
  unmatchedSchemas: UnmatchedSchema[];
  unresolvedSchemaCandidates: UnresolvedSchemaCandidate[];
};

type ParserContext = {
  parsedAttributeFiles: Map<string, ParsedAttributeFile>;
  resolvedAttributeExports: Map<string, string[] | null>;
  rootDir: string;
};

function findFiles(
  dir: string,
  predicate: (entryName: string) => boolean,
  base = '',
): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(
        ...findFiles(path.join(dir, entry.name), predicate, relativePath),
      );
    } else if (predicate(entry.name)) {
      results.push(relativePath);
    }
  }
  return results;
}

function extractBalancedBlock(
  content: string,
  openIndex: number,
  openCharacter = '{',
  closeCharacter = '}',
): string | null {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < content.length; index += 1) {
    const character = content[index];
    const previous = content[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === openCharacter) {
      depth += 1;
    } else if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openIndex + 1, index);
      }
    }
  }
  return null;
}

function extractQuotedStrings(content: string): string[] {
  return [...content.matchAll(/['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
}

function extractSpreadTargets(content: string): string[] {
  return [...content.matchAll(/\.\.\.(\w+)/g)].map((match) => `...${match[1]}`);
}

function toPascalCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function parseNamedImports(content: string): Map<string, ImportBinding> {
  const imports = new Map<string, ImportBinding>();
  const importRegex =
    /import\s+(?:type\s+)?\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;

  for (const match of content.matchAll(importRegex)) {
    const source = match[2];
    if (!source) {
      continue;
    }
    for (const rawSpecifier of match[1]?.split(',') ?? []) {
      const specifier = rawSpecifier.replace(/^type\s+/, '').trim();
      const aliasMatch = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(specifier);
      if (!aliasMatch?.[1]) {
        continue;
      }
      imports.set(aliasMatch[2] ?? aliasMatch[1], {
        importedName: aliasMatch[1],
        source,
      });
    }
  }
  return imports;
}

export function parsePrismaSchema(
  schemaPath: string,
): Map<string, PrismaModelInfo> {
  if (!fs.existsSync(schemaPath)) {
    return new Map();
  }

  const content = fs.readFileSync(schemaPath, 'utf8');
  const rawModels = new Map<string, Map<string, string>>();
  const modelNames = new Set<string>();
  let currentModel: string | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!currentModel) {
      const modelMatch = /^model\s+(\w+)\s+\{$/.exec(trimmed);
      if (modelMatch?.[1]) {
        currentModel = modelMatch[1];
        modelNames.add(currentModel);
        rawModels.set(currentModel, new Map());
      }
      continue;
    }
    if (trimmed === '}') {
      currentModel = null;
      continue;
    }
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
      continue;
    }
    const fieldMatch = /^(\w+)\s+(\S+)/.exec(trimmed);
    if (fieldMatch?.[1] && fieldMatch[2]) {
      rawModels.get(currentModel)?.set(fieldMatch[1], fieldMatch[2]);
    }
  }

  return new Map(
    [...rawModels].map(([modelName, rawFields]) => [
      modelName,
      { fields: new Set(rawFields.keys()), modelName },
    ]),
  );
}

function extractDocumentInterface(
  content: string,
  documentName: string,
): { body: string; heritage: string } | null {
  const interfaceMatch = new RegExp(
    `(?:export\\s+)?interface\\s+${documentName}\\b([\\s\\S]*?)\\{`,
  ).exec(content);
  if (!interfaceMatch) {
    return null;
  }
  const openIndex = content.indexOf('{', interfaceMatch.index);
  const body = extractBalancedBlock(content, openIndex);
  if (body === null) {
    return null;
  }
  return { body, heritage: interfaceMatch[1] ?? '' };
}

function parseDocumentFields(body: string): Set<string> {
  const fields = new Set<string>();
  for (const match of body.matchAll(/^\s{2}([A-Za-z_]\w*)(?:\?|!)?\s*:/gm)) {
    if (match[1]) {
      fields.add(match[1]);
    }
  }
  return fields;
}

function directPrismaExportName(
  content: string,
  symbolName: string,
): string | null {
  for (const match of content.matchAll(
    /export\s+type\s+\{\s*([^}]+)\s*\}\s+from\s+['"]@genfeedai\/prisma['"]/g,
  )) {
    for (const rawSpecifier of match[1]?.split(',') ?? []) {
      const specifier = rawSpecifier.trim();
      const alias = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(specifier);
      if (alias?.[1] && (alias[2] ?? alias[1]) === symbolName) {
        return alias[1];
      }
    }
  }
  return null;
}

function typeAliasExpression(
  content: string,
  symbolName: string,
): string | null {
  const declaration = new RegExp(
    `(?:export\\s+)?type\\s+${symbolName}\\s*=\\s*`,
  ).exec(content);
  if (!declaration) {
    return null;
  }
  const expressionStart = declaration.index + declaration[0].length;
  const depths: Record<string, number> = { '(': 0, '<': 0, '[': 0, '{': 0 };
  const closingToOpening: Record<string, string> = {
    ')': '(',
    '>': '<',
    ']': '[',
    '}': '{',
  };
  let quote: string | null = null;

  for (let index = expressionStart; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === quote && content[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character && character in depths) {
      depths[character] += 1;
      continue;
    }
    const opening = character ? closingToOpening[character] : undefined;
    if (opening) {
      depths[opening] = Math.max(0, depths[opening] - 1);
      continue;
    }
    if (
      character === ';' &&
      Object.values(depths).every((depth) => depth === 0)
    ) {
      return content.slice(expressionStart, index).trim();
    }
  }
  return null;
}

const TYPE_WRAPPER_NAMES = new Set([
  'Array',
  'Date',
  'Map',
  'Omit',
  'Partial',
  'Pick',
  'Record',
  'Set',
]);

function referencedTypeNames(expression: string): string[] {
  return [...expression.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)]
    .map((match) => match[1])
    .filter(
      (name): name is string =>
        Boolean(name) && !TYPE_WRAPPER_NAMES.has(name as string),
    );
}

function resolvePrismaModelName(
  content: string,
  symbolName: string,
  imports: Map<string, ImportBinding>,
  trail = new Set<string>(),
): string | null {
  if (trail.has(symbolName)) {
    return null;
  }
  const nextTrail = new Set(trail);
  nextTrail.add(symbolName);
  const directExport = directPrismaExportName(content, symbolName);
  if (directExport) {
    return directExport;
  }
  const binding = imports.get(symbolName);
  if (binding?.source === '@genfeedai/prisma') {
    return binding.importedName;
  }

  const documentInterface = extractDocumentInterface(content, symbolName);
  const alias = typeAliasExpression(content, symbolName);
  const ancestry = [
    ...referencedTypeNames(documentInterface?.heritage ?? ''),
    ...referencedTypeNames(alias ?? ''),
  ];
  for (const ancestor of ancestry) {
    const modelName = resolvePrismaModelName(
      content,
      ancestor,
      imports,
      nextTrail,
    );
    if (modelName) {
      return modelName;
    }
  }
  return null;
}

function collectDocumentFields(
  content: string,
  symbolName: string,
  trail = new Set<string>(),
): Set<string> {
  if (trail.has(symbolName)) {
    return new Set();
  }
  const nextTrail = new Set(trail);
  nextTrail.add(symbolName);
  const documentInterface = extractDocumentInterface(content, symbolName);
  const fields = documentInterface
    ? parseDocumentFields(documentInterface.body)
    : new Set<string>();
  const alias = typeAliasExpression(content, symbolName);
  const inlineObjectStart = alias?.indexOf('{') ?? -1;
  if (alias && inlineObjectStart !== -1) {
    const inlineObject = extractBalancedBlock(alias, inlineObjectStart);
    if (inlineObject) {
      for (const field of parseDocumentFields(inlineObject)) {
        fields.add(field);
      }
    }
  }
  for (const ancestor of [
    ...referencedTypeNames(documentInterface?.heritage ?? ''),
    ...referencedTypeNames(alias ?? ''),
  ]) {
    for (const field of collectDocumentFields(content, ancestor, nextTrail)) {
      fields.add(field);
    }
  }
  return fields;
}

function collectExportedDocumentNames(content: string): Set<string> {
  const documentNames = new Set<string>();
  for (const match of content.matchAll(
    /export\s+(?:interface|type)\s+(\w+Document)\b/g,
  )) {
    if (match[1]) {
      documentNames.add(match[1]);
    }
  }
  for (const match of content.matchAll(
    /export\s+type\s+\{\s*([^}]+)\s*\}\s+from\s+['"][^'"]+['"]/g,
  )) {
    for (const rawSpecifier of match[1]?.split(',') ?? []) {
      const alias = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(rawSpecifier.trim());
      const exportedName = alias?.[2] ?? alias?.[1];
      if (exportedName?.endsWith('Document')) {
        documentNames.add(exportedName);
      }
    }
  }
  return documentNames;
}

function parseOmittedFields(
  content: string,
  documentName: string,
): Set<string> {
  const declarationStart = content.search(
    new RegExp(`export\\s+(?:interface|type)\\s+${documentName}\\b`),
  );
  if (declarationStart === -1) {
    return new Set();
  }
  const declaration = content.slice(
    declarationStart,
    content.indexOf('{', declarationStart),
  );
  const omitMatch = /Omit\s*<\s*\w+\s*,([\s\S]*?)>/.exec(declaration);
  return new Set(extractQuotedStrings(omitMatch?.[1] ?? ''));
}

function collectSchemas(
  rootDir: string,
  schemaRoots: string[],
  prismaModels: Map<string, PrismaModelInfo>,
): {
  candidates: number;
  schemas: SchemaInfo[];
  unresolved: UnresolvedSchemaCandidate[];
} {
  const schemasByKey = new Map<string, SchemaInfo>();
  const unresolved: UnresolvedSchemaCandidate[] = [];
  let candidates = 0;

  for (const relativeRoot of schemaRoots) {
    const schemaRoot = path.join(rootDir, relativeRoot);
    for (const relativePath of findFiles(schemaRoot, (name) =>
      name.endsWith('.schema.ts'),
    )) {
      const filePath = path.join(schemaRoot, relativePath);
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes('@genfeedai/prisma')) {
        continue;
      }
      candidates += 1;
      const fileBasename = path.basename(filePath, '.schema.ts');
      const primaryDocumentName =
        SCHEMA_DOCUMENT_NAME_OVERRIDES[fileBasename] ??
        `${toPascalCase(fileBasename)}Document`;
      const exportedDocumentNames = collectExportedDocumentNames(content);
      const documentNames =
        exportedDocumentNames.size > 0
          ? [...exportedDocumentNames]
          : [primaryDocumentName];
      const imports = parseNamedImports(content);
      for (const documentName of documentNames) {
        const basename =
          documentName === primaryDocumentName
            ? fileBasename
            : toKebabCase(documentName.slice(0, -'Document'.length));
        const modelName = resolvePrismaModelName(
          content,
          documentName,
          imports,
        );
        if (!modelName) {
          unresolved.push({
            basename,
            filePath,
            reason: `Could not resolve ${documentName} to an @genfeedai/prisma model`,
          });
          continue;
        }
        if (!prismaModels.has(modelName)) {
          unresolved.push({
            basename,
            filePath,
            reason: `Resolved Prisma model ${modelName} does not exist in schema.prisma`,
          });
          continue;
        }
        const schema = {
          basename,
          documentFields: collectDocumentFields(content, documentName),
          documentName,
          filePath,
          modelName,
          omittedModelFields: parseOmittedFields(content, documentName),
        } satisfies SchemaInfo;
        const key = `${basename}:${modelName}`;
        const existing = schemasByKey.get(key);
        if (!existing || path.basename(filePath, '.schema.ts') === basename) {
          schemasByKey.set(key, schema);
        }
      }
    }
  }

  return { candidates, schemas: [...schemasByKey.values()], unresolved };
}

function resolveSerializerImportPath(
  context: ParserContext,
  filePath: string,
  source: string,
): string | null {
  let resolvedPath: string | null = null;
  if (source.startsWith('.')) {
    resolvedPath = path.resolve(path.dirname(filePath), source);
  } else if (source.startsWith('@serializers/')) {
    resolvedPath = path.join(
      context.rootDir,
      SERIALIZER_ROOT,
      source.slice('@serializers/'.length),
    );
  }
  if (!resolvedPath) {
    return null;
  }
  const withExtension = resolvedPath.endsWith('.ts')
    ? resolvedPath
    : `${resolvedPath}.ts`;
  if (fs.existsSync(withExtension)) {
    return withExtension;
  }
  const indexPath = path.join(resolvedPath, 'index.ts');
  return fs.existsSync(indexPath) ? indexPath : null;
}

function resolveExportedSymbolFile(
  context: ParserContext,
  filePath: string,
  symbolName: string,
  trail = new Set<string>(),
): string | null {
  const cacheKey = `${filePath}:${symbolName}`;
  if (trail.has(cacheKey)) {
    return null;
  }
  const nextTrail = new Set(trail);
  nextTrail.add(cacheKey);
  const content = fs.readFileSync(filePath, 'utf8');
  if (
    new RegExp(
      `export\\s+(?:const|let|class|interface|type|function)\\s+${symbolName}\\b`,
    ).test(content)
  ) {
    return filePath;
  }

  for (const match of content.matchAll(
    /export\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    for (const rawSpecifier of match[1]?.split(',') ?? []) {
      const specifier = rawSpecifier.trim();
      const alias = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(specifier);
      if (!alias?.[1] || (alias[2] ?? alias[1]) !== symbolName || !match[2]) {
        continue;
      }
      const targetPath = resolveSerializerImportPath(
        context,
        filePath,
        match[2],
      );
      if (!targetPath) {
        return null;
      }
      return resolveExportedSymbolFile(
        context,
        targetPath,
        alias[1],
        nextTrail,
      );
    }
  }

  for (const match of content.matchAll(
    /export\s+\*\s+from\s+['"]([^'"]+)['"]/g,
  )) {
    if (!match[1]) {
      continue;
    }
    const targetPath = resolveSerializerImportPath(context, filePath, match[1]);
    if (!targetPath) {
      continue;
    }
    const resolved = resolveExportedSymbolFile(
      context,
      targetPath,
      symbolName,
      nextTrail,
    );
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function parseAttributeFile(
  context: ParserContext,
  filePath: string,
): ParsedAttributeFile {
  const cached = context.parsedAttributeFiles.get(filePath);
  if (cached) {
    return cached;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const imports = parseNamedImports(content);
  const exports = new Set<string>();
  const symbols = new Map<string, AttributeExpression>();
  const arrayRegex =
    /(?:export\s+)?const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*\[([\s\S]*?)\]\s*;?/g;
  for (const match of content.matchAll(arrayRegex)) {
    if (!match[1]) {
      continue;
    }
    symbols.set(match[1], {
      fields: [
        ...extractQuotedStrings(match[2] ?? ''),
        ...extractSpreadTargets(match[2] ?? ''),
      ],
      kind: 'array',
    });
    if (match[0].trimStart().startsWith('export')) {
      exports.add(match[1]);
    }
  }

  const createEntityRegex =
    /export\s+const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*createEntityAttributes\s*\(/g;
  for (const match of content.matchAll(createEntityRegex)) {
    const exportName = match[1];
    if (!exportName) {
      continue;
    }
    const openIndex = content.indexOf('(', match.index);
    const argument = (extractBalancedBlock(content, openIndex, '(', ')') ?? '')
      .trim()
      .replace(/,\s*$/, '');
    exports.add(exportName);
    if (argument.startsWith('[') && argument.endsWith(']')) {
      const arrayBody = argument.slice(1, -1);
      symbols.set(exportName, {
        fields: [
          ...extractQuotedStrings(arrayBody),
          ...extractSpreadTargets(arrayBody),
        ],
        kind: 'array',
      });
    } else if (/^\w+$/.test(argument)) {
      symbols.set(exportName, { kind: 'alias', targetName: argument });
    } else {
      const filterMatch =
        /^(\w+)\.filter\([\s\S]*?=>[\s\S]*?\w+\s*!==?\s*['"]([^'"]+)['"][\s\S]*\)$/.exec(
          argument,
        );
      if (filterMatch?.[1] && filterMatch[2]) {
        symbols.set(exportName, {
          excludedFields: [filterMatch[2]],
          kind: 'filter',
          targetName: filterMatch[1],
        });
      }
    }
  }

  const aliasRegex = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*;?/g;
  for (const match of content.matchAll(aliasRegex)) {
    if (match[1] && match[2] && !symbols.has(match[1])) {
      exports.add(match[1]);
      symbols.set(match[1], { kind: 'alias', targetName: match[2] });
    }
  }

  const parsed = { exports, imports, symbols };
  context.parsedAttributeFiles.set(filePath, parsed);
  return parsed;
}

function resolveAttributeSymbol(
  context: ParserContext,
  filePath: string,
  symbolName: string,
  trail = new Set<string>(),
): string[] | null {
  const cacheKey = `${filePath}:${symbolName}`;
  if (context.resolvedAttributeExports.has(cacheKey)) {
    return context.resolvedAttributeExports.get(cacheKey) ?? null;
  }
  if (trail.has(cacheKey)) {
    return null;
  }
  const nextTrail = new Set(trail);
  nextTrail.add(cacheKey);
  const parsed = parseAttributeFile(context, filePath);
  const expression = parsed.symbols.get(symbolName);

  if (expression?.kind === 'array') {
    const fields = expression.fields.filter(
      (field) => !field.startsWith('...'),
    );
    for (const spread of expression.fields.filter((field) =>
      field.startsWith('...'),
    )) {
      const resolved = resolveAttributeSymbol(
        context,
        filePath,
        spread.slice(3),
        nextTrail,
      );
      if (!resolved) {
        context.resolvedAttributeExports.set(cacheKey, null);
        return null;
      }
      fields.push(...resolved);
    }
    const uniqueFields = [...new Set(fields)];
    context.resolvedAttributeExports.set(cacheKey, uniqueFields);
    return uniqueFields;
  }

  const targetName =
    expression?.kind === 'alias' || expression?.kind === 'filter'
      ? expression.targetName
      : symbolName;
  if (
    (expression?.kind === 'alias' || expression?.kind === 'filter') &&
    parsed.symbols.has(targetName)
  ) {
    const resolved = resolveAttributeSymbol(
      context,
      filePath,
      targetName,
      nextTrail,
    );
    const filtered =
      resolved && expression.kind === 'filter'
        ? resolved.filter((field) => !expression.excludedFields.includes(field))
        : resolved;
    context.resolvedAttributeExports.set(cacheKey, filtered);
    return filtered;
  }
  const imported = parsed.imports.get(targetName);
  if (!imported) {
    context.resolvedAttributeExports.set(cacheKey, null);
    return null;
  }
  const importedPath = resolveSerializerImportPath(
    context,
    filePath,
    imported.source,
  );
  if (!importedPath) {
    context.resolvedAttributeExports.set(cacheKey, null);
    return null;
  }
  const resolved = resolveAttributeSymbol(
    context,
    importedPath,
    imported.importedName,
    nextTrail,
  );
  context.resolvedAttributeExports.set(cacheKey, resolved);
  return resolved;
}

function findPrimaryAttributeName(configContent: string): string | null {
  const explicit = /\battributes\s*:\s*(\w+)/.exec(configContent)?.[1];
  if (explicit) {
    return explicit;
  }
  return (
    /\bsimpleConfig\(\s*['"][^'"]+['"]\s*,\s*(\w+)/.exec(configContent)?.[1] ??
    null
  );
}

function findCanonicalConfigName(
  serializerContent: string,
  serializerBasename: string,
): string | null {
  const expectedSerializerName = `${toPascalCase(serializerBasename)}Serializer`;
  const exactExport = new RegExp(
    `export\\s+const\\s+(?:\\{\\s*${expectedSerializerName}\\s*\\}|${expectedSerializerName})\\s*=\\s*build(?:Single)?Serializer\\(\\s*['"]server['"]\\s*,\\s*(\\w+)`,
  ).exec(serializerContent)?.[1];
  return (
    exactExport ??
    /build(?:Single)?Serializer\(\s*['"]server['"]\s*,\s*(\w+)/.exec(
      serializerContent,
    )?.[1] ??
    null
  );
}

function collectSerializerContracts(context: ParserContext): SerializerInfo[] {
  const serverRoot = path.join(context.rootDir, SERIALIZER_ROOT, 'server');
  const contracts: SerializerInfo[] = [];

  for (const relativePath of findFiles(serverRoot, (name) =>
    name.endsWith('.serializer.ts'),
  )) {
    const serializerFilePath = path.join(serverRoot, relativePath);
    const serializerContent = fs.readFileSync(serializerFilePath, 'utf8');
    const basename = path.basename(serializerFilePath, '.serializer.ts');
    const configName = findCanonicalConfigName(serializerContent, basename);
    if (!configName) {
      continue;
    }
    const serializerImports = parseNamedImports(serializerContent);
    let configImport = serializerImports.get(configName);
    const serverAttributeFields: string[] = [];
    if (!configImport) {
      const localConfigMatch = new RegExp(
        `(?:const|let)\\s+${configName}\\s*=\\s*\\{`,
      ).exec(serializerContent);
      const openIndex = localConfigMatch
        ? serializerContent.indexOf('{', localConfigMatch.index)
        : -1;
      const localConfigBody =
        openIndex === -1
          ? null
          : extractBalancedBlock(serializerContent, openIndex);
      const baseConfigName = localConfigBody
        ? /\.\.\.(\w+)/.exec(localConfigBody)?.[1]
        : null;
      if (baseConfigName) {
        configImport = serializerImports.get(baseConfigName);
        const attributesExpression =
          /attributes\s*:\s*\[([\s\S]*?)\]/.exec(localConfigBody ?? '')?.[1] ??
          '';
        for (const spreadTarget of extractSpreadTargets(attributesExpression)) {
          const targetName = spreadTarget.slice(3);
          if (targetName === baseConfigName) {
            continue;
          }
          const resolved = resolveAttributeSymbol(
            context,
            serializerFilePath,
            targetName,
          );
          if (resolved) {
            serverAttributeFields.push(...resolved);
          }
        }
      }
    }
    if (!configImport) {
      continue;
    }
    const configImportPath = resolveSerializerImportPath(
      context,
      serializerFilePath,
      configImport.source,
    );
    if (!configImportPath) {
      continue;
    }
    const configFilePath = resolveExportedSymbolFile(
      context,
      configImportPath,
      configImport.importedName,
    );
    if (!configFilePath) {
      continue;
    }
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const attributeName = findPrimaryAttributeName(configContent);
    if (!attributeName) {
      continue;
    }
    const attributeImport = parseNamedImports(configContent).get(attributeName);
    if (!attributeImport) {
      continue;
    }
    const attributeImportPath = resolveSerializerImportPath(
      context,
      configFilePath,
      attributeImport.source,
    );
    if (!attributeImportPath) {
      continue;
    }
    const attributeFilePath = resolveExportedSymbolFile(
      context,
      attributeImportPath,
      attributeImport.importedName,
    );
    if (!attributeFilePath) {
      continue;
    }
    const attributeFields = resolveAttributeSymbol(
      context,
      attributeFilePath,
      attributeImport.importedName,
    );
    if (!attributeFields) {
      continue;
    }
    const relationshipFields = new Set<string>();
    for (const match of configContent.matchAll(/^\s{2}([A-Za-z_]\w*)\s*:/gm)) {
      if (match[1] && match[1] !== 'attributes' && match[1] !== 'type') {
        relationshipFields.add(match[1]);
      }
    }
    contracts.push({
      attributeFields: new Set([...attributeFields, ...serverAttributeFields]),
      attributeFilePath,
      attributeName: attributeImport.importedName,
      basename,
      configFilePath,
      relationshipFields,
      serializerFilePath,
    });
  }
  return contracts;
}

function serializerBasenameForSchema(schemaBasename: string): string {
  return (
    SCHEMA_TO_SERIALIZER_BASENAME_OVERRIDES[schemaBasename] ?? schemaBasename
  );
}

function normalizeSelectedFile(rootDir: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(rootDir, filePath);
  return absolutePath;
}

function isSelectedPair(
  schema: SchemaInfo,
  serializer: SerializerInfo,
  selectedFiles: Set<string>,
  prismaSchemaPath: string,
): boolean {
  if (
    selectedFiles.size === 0 ||
    selectedFiles.has(path.normalize(prismaSchemaPath))
  ) {
    return true;
  }
  return [
    schema.filePath,
    serializer.attributeFilePath,
    serializer.configFilePath,
    serializer.serializerFilePath,
  ].some((filePath) => selectedFiles.has(path.normalize(filePath)));
}

function isRelevantSelectedFile(
  rootDir: string,
  filePath: string,
  relevantSchemaFiles: Set<string>,
): boolean {
  const relativePath = path
    .relative(rootDir, filePath)
    .split(path.sep)
    .join('/');
  return (
    relevantSchemaFiles.has(path.normalize(filePath)) ||
    relativePath.startsWith(`${SERIALIZER_ROOT}/attributes/`) ||
    relativePath.startsWith(`${SERIALIZER_ROOT}/configs/`) ||
    relativePath.startsWith(`${SERIALIZER_ROOT}/server/`) ||
    relativePath === PRISMA_SCHEMA_PATH
  );
}

function projectionKey(schema: SchemaInfo): string {
  return `${schema.basename}:${schema.modelName}`;
}

export function runCheckSerializerDrift(
  options: SerializerDriftCheckOptions = {},
): SerializerDriftCheckResult {
  const rootDir = path.resolve(options.rootDir ?? DEFAULT_ROOT_DIR);
  const schemaRoots = options.schemaRoots ?? DEFAULT_SCHEMA_ROOTS;
  const projectionContract = options.projections ?? SERIALIZER_PROJECTIONS;
  const errors: string[] = [];
  const prismaSchemaPath = path.join(rootDir, PRISMA_SCHEMA_PATH);
  const serializerRoot = path.join(rootDir, SERIALIZER_ROOT);

  if (!fs.existsSync(prismaSchemaPath)) {
    errors.push(`Prisma schema root is missing: ${PRISMA_SCHEMA_PATH}`);
  }
  if (!fs.existsSync(serializerRoot)) {
    errors.push(`Serializer root is missing: ${SERIALIZER_ROOT}`);
  }
  const existingSchemaRoots = schemaRoots.filter((schemaRoot) =>
    fs.existsSync(path.join(rootDir, schemaRoot)),
  );
  if (existingSchemaRoots.length === 0) {
    errors.push('No configured schema roots exist');
  }

  const prismaModels = parsePrismaSchema(prismaSchemaPath);
  const discovered = collectSchemas(rootDir, existingSchemaRoots, prismaModels);
  const context: ParserContext = {
    parsedAttributeFiles: new Map(),
    resolvedAttributeExports: new Map(),
    rootDir,
  };
  const serializers = fs.existsSync(serializerRoot)
    ? collectSerializerContracts(context)
    : [];

  if (discovered.candidates === 0) {
    errors.push('No Prisma-backed schema candidates were discovered');
  }
  if (serializers.length === 0) {
    errors.push('No canonical serializer triplets were discovered');
  }

  const selectedFiles = new Set(
    (options.files ?? []).map((filePath) =>
      normalizeSelectedFile(rootDir, filePath),
    ),
  );
  const serializersByBasename = new Map<string, SerializerInfo[]>();
  for (const serializer of serializers) {
    const existing = serializersByBasename.get(serializer.basename) ?? [];
    serializersByBasename.set(serializer.basename, [...existing, serializer]);
  }

  const relevantSchemaFiles = new Set(
    discovered.schemas
      .filter((schema) =>
        serializersByBasename.has(serializerBasenameForSchema(schema.basename)),
      )
      .map((schema) => path.normalize(schema.filePath)),
  );
  for (const unresolved of discovered.unresolved) {
    if (
      serializersByBasename.has(
        serializerBasenameForSchema(unresolved.basename),
      )
    ) {
      relevantSchemaFiles.add(path.normalize(unresolved.filePath));
    }
  }
  const relevantSelectedFiles = [...selectedFiles].filter((filePath) =>
    isRelevantSelectedFile(rootDir, filePath, relevantSchemaFiles),
  );

  for (const unresolved of discovered.unresolved) {
    const serializerBasename = serializerBasenameForSchema(unresolved.basename);
    const hasSerializer = serializersByBasename.has(serializerBasename);
    const isSelected =
      selectedFiles.size === 0 ||
      selectedFiles.has(path.normalize(unresolved.filePath));
    if (hasSerializer && isSelected) {
      errors.push(
        `Prisma-backed schema ${path.relative(rootDir, unresolved.filePath)} has a canonical serializer but could not be discovered: ${unresolved.reason}`,
      );
    }
  }

  const drifts: SerializerDrift[] = [];
  const unmatchedSchemas: UnmatchedSchema[] = [];
  const matchedProjectionKeys = new Set<string>();
  let matchedCount = 0;
  let scannedCount = 0;

  for (const schema of discovered.schemas) {
    const candidates =
      serializersByBasename.get(serializerBasenameForSchema(schema.basename)) ??
      [];
    if (candidates.length !== 1) {
      unmatchedSchemas.push({
        reason:
          candidates.length === 0
            ? 'No canonical server serializer triplet found'
            : 'Multiple canonical server serializer triplets found',
        schema,
      });
      continue;
    }
    const serializer = candidates[0];
    if (
      !serializer ||
      !isSelectedPair(schema, serializer, selectedFiles, prismaSchemaPath)
    ) {
      continue;
    }
    scannedCount += 1;
    matchedCount += 1;
    const model = prismaModels.get(schema.modelName);
    if (!model) {
      errors.push(
        `Prisma model ${schema.modelName} was not found for ${schema.documentName}`,
      );
      continue;
    }
    const backedFields = new Set(
      [...model.fields].filter(
        (field) => !schema.omittedModelFields.has(field),
      ),
    );
    for (const field of schema.documentFields) {
      backedFields.add(field);
    }
    for (const field of serializer.relationshipFields) {
      backedFields.add(field);
    }
    const key = projectionKey(schema);
    const projections = new Set(projectionContract[key] ?? []);
    matchedProjectionKeys.add(key);
    const unbackedFields = [...serializer.attributeFields]
      .filter((field) => !IGNORED_ATTRIBUTE_FIELDS.has(field))
      .filter((field) => !backedFields.has(field) && !projections.has(field))
      .sort();
    if (unbackedFields.length > 0) {
      drifts.push({ schema, serializer, unbackedFields });
    }
    for (const field of projections) {
      if (!serializer.attributeFields.has(field)) {
        errors.push(
          `Projection contract ${key}.${field} is stale: serializer field is gone`,
        );
      } else if (backedFields.has(field)) {
        errors.push(
          `Projection contract ${key}.${field} is stale: field is now structurally backed`,
        );
      }
    }
  }

  const isFullCoverageRun =
    selectedFiles.size === 0 ||
    selectedFiles.has(path.normalize(prismaSchemaPath));
  if (isFullCoverageRun) {
    if (options.projections === undefined) {
      for (const key of matchedProjectionKeys) {
        if (!(key in projectionContract)) {
          errors.push(
            `Serializer contract ${key} is missing from SERIALIZER_PROJECTIONS`,
          );
        }
      }
    }
    for (const key of Object.keys(projectionContract)) {
      if (!matchedProjectionKeys.has(key)) {
        errors.push(
          `Projection contract ${key} is stale: no matched schema/serializer pair`,
        );
      }
    }
  }

  if (selectedFiles.size === 0 && matchedCount === 0) {
    errors.push(
      'Unexpected zero coverage: no schema/serializer pairs were matched',
    );
  }
  if (relevantSelectedFiles.length > 0 && matchedCount === 0) {
    errors.push(
      `Unexpected zero coverage for selected serializer/schema files: ${relevantSelectedFiles
        .map((filePath) => path.relative(rootDir, filePath))
        .join(', ')}`,
    );
  }

  return {
    discoveredSchemaCount: discovered.schemas.length,
    drifts,
    errors,
    matchedCount,
    matchedPairKeys: [...matchedProjectionKeys].sort(),
    scannedCount,
    serializerCount: serializers.length,
    unmatchedSchemas,
    unresolvedSchemaCandidates: discovered.unresolved,
  };
}

function formatPath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath);
}

function printResults(
  rootDir: string,
  result: SerializerDriftCheckResult,
): void {
  console.log('Serializer drift report');
  console.log(
    `- Prisma-backed schemas discovered: ${result.discoveredSchemaCount}`,
  );
  console.log(
    `- Canonical serializer triplets discovered: ${result.serializerCount}`,
  );
  console.log(`- Schema/serializer pairs scanned: ${result.scannedCount}`);
  console.log(`- Matched schema/serializer pairs: ${result.matchedCount}`);
  console.log(`- Unmatched schemas: ${result.unmatchedSchemas.length}`);
  console.log(
    `- Unresolved Prisma-backed schema candidates: ${result.unresolvedSchemaCandidates.length}`,
  );
  console.log(`- Drifted pairs: ${result.drifts.length}`);
  console.log(`- Coverage errors: ${result.errors.length}`);

  for (const drift of result.drifts) {
    console.error(
      `\n- ${drift.schema.documentName} (${formatPath(rootDir, drift.schema.filePath)} ↔ ${formatPath(rootDir, drift.serializer.attributeFilePath)})`,
    );
    console.error(
      `  Unbacked serializer fields: ${drift.unbackedFields.join(', ')}`,
    );
  }
  if (result.errors.length > 0) {
    console.error('\nCoverage/configuration errors:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
  }
  if (result.drifts.length === 0 && result.errors.length === 0) {
    console.log('\nNo serializer drift detected.');
  }
}

export function parseCliFiles(argv: string[]): string[] {
  const files: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--files') {
      continue;
    }
    for (let fileIndex = index + 1; fileIndex < argv.length; fileIndex += 1) {
      const value = argv[fileIndex];
      if (!value || value.startsWith('--')) {
        break;
      }
      files.push(value);
      index = fileIndex;
    }
  }
  return files;
}

function main(): void {
  const rootDir = DEFAULT_ROOT_DIR;
  const result = runCheckSerializerDrift({
    files: parseCliFiles(process.argv.slice(2)),
    rootDir,
  });
  printResults(rootDir, result);
  process.exitCode =
    result.drifts.length > 0 || result.errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  main();
}
