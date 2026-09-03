import type { ActionJsonSchema } from '../../interfaces/action-definition.interface';
import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

type InputField =
  | 'acceptsStructuredPrompt'
  | 'actionVerb'
  | 'addWatermark'
  | 'aspectRatio'
  | 'assetType'
  | 'audio'
  | 'audioCodec'
  | 'audioUrl'
  | 'audioVolume'
  | 'auto'
  | 'autoAnalyzeAfterHours'
  | 'autoSync'
  | 'avoid'
  | 'backgroundColor'
  | 'bitrate'
  | 'brand'
  | 'brandId'
  | 'brandLabel'
  | 'brandVoice'
  | 'caption'
  | 'category'
  | 'channel'
  | 'characterReferenceUrls'
  | 'checkFrequency'
  | 'clipCount'
  | 'clonedVoiceId'
  | 'content'
  | 'contentPreference'
  | 'conversationId'
  | 'credentialId'
  | 'creditCost'
  | 'data'
  | 'days'
  | 'destination'
  | 'dispatchMode'
  | 'duration'
  | 'durationSeconds'
  | 'email'
  | 'endTime'
  | 'faceImage'
  | 'fadeIn'
  | 'fadeOut'
  | 'fontColor'
  | 'fontSize'
  | 'fontWeight'
  | 'format'
  | 'fps'
  | 'generateChapters'
  | 'generatePrompt'
  | 'generateTranscript'
  | 'harnessContext'
  | 'hashtag'
  | 'hashtagCount'
  | 'headers'
  | 'height'
  | 'hookFormula'
  | 'hooks'
  | 'html'
  | 'idempotencyKey'
  | 'image'
  | 'images'
  | 'includeAssetUrl'
  | 'includeCTA'
  | 'includeEmojis'
  | 'includeHashtags'
  | 'includeMetadata'
  | 'instructions'
  | 'keywords'
  | 'language'
  | 'languages'
  | 'lastFrame'
  | 'libraryCategory'
  | 'libraryMood'
  | 'limit'
  | 'maintainQuality'
  | 'maxDuration'
  | 'maxIterations'
  | 'maxLength'
  | 'maxTokens'
  | 'media'
  | 'mediaUrl'
  | 'method'
  | 'minUsageCount'
  | 'minViralScore'
  | 'mixMode'
  | 'mode'
  | 'model'
  | 'monetization'
  | 'music'
  | 'musicUrl'
  | 'negativePrompt'
  | 'niche'
  | 'orientation'
  | 'outputFormat'
  | 'outputQuality'
  | 'parentId'
  | 'parentIngredientId'
  | 'photoUrl'
  | 'pitchShift'
  | 'platform'
  | 'platforms'
  | 'position'
  | 'post'
  | 'postId'
  | 'product'
  | 'productContext'
  | 'productReferenceUrls'
  | 'prompt'
  | 'promptFormat'
  | 'provider'
  | 'quality'
  | 'query'
  | 'reason'
  | 'recipientId'
  | 'references'
  | 'releaseAnalytics'
  | 'resolution'
  | 'scale'
  | 'schedule'
  | 'script'
  | 'seamlessLoop'
  | 'secondaryKeywords'
  | 'seed'
  | 'selectionMode'
  | 'skipped'
  | 'slideIndex'
  | 'sound'
  | 'soundId'
  | 'soundUrl'
  | 'sourceType'
  | 'startFrame'
  | 'startTime'
  | 'strength'
  | 'strokeColor'
  | 'strokeWidth'
  | 'structuredPrompt'
  | 'style'
  | 'subject'
  | 'suggestions'
  | 'summary'
  | 'targetAspectRatio'
  | 'targetKeyword'
  | 'targetScore'
  | 'targetVoiceId'
  | 'temperature'
  | 'template'
  | 'text'
  | 'textColor'
  | 'timestampSeconds'
  | 'timezone'
  | 'title'
  | 'to'
  | 'tone'
  | 'toneStyle'
  | 'topic'
  | 'topN'
  | 'trackingEnabled'
  | 'transitionDuration'
  | 'transitionType'
  | 'trend'
  | 'trendData'
  | 'trendId'
  | 'trendType'
  | 'uploadUrl'
  | 'url'
  | 'useIdentityDefaults'
  | 'useLlm'
  | 'variables'
  | 'video'
  | 'videoReference'
  | 'videoReferences'
  | 'videos'
  | 'videoUrl'
  | 'videoVolume'
  | 'visibility'
  | 'voiceId'
  | 'width'
  | 'wordsPerSecond'
  | 'worstN'
  | 'username';

const MEDIA_VALUE_SCHEMA = JSON_DOCUMENT_SCHEMA;
const URL_OR_MEDIA_SCHEMA = {
  anyOf: [STRING_SCHEMA, MEDIA_VALUE_SCHEMA],
} as const;
/**
 * Context fields an executor accepts either already flattened to text or as a
 * structured object it stringifies itself.
 */
const TEXT_OR_OBJECT_SCHEMA = {
  anyOf: [STRING_SCHEMA, JSON_DOCUMENT_SCHEMA],
} as const;

function inputFieldSchema(field: InputField): ActionJsonSchema {
  switch (field) {
    case 'brandVoice':
    case 'harnessContext':
      return TEXT_OR_OBJECT_SCHEMA;
    case 'acceptsStructuredPrompt':
    case 'addWatermark':
    case 'autoSync':
    case 'generateChapters':
    case 'generateTranscript':
    case 'includeAssetUrl':
    case 'includeCTA':
    case 'includeEmojis':
    case 'includeHashtags':
    case 'includeMetadata':
    case 'maintainQuality':
    case 'monetization':
    case 'trackingEnabled':
    case 'skipped':
    case 'auto':
    case 'seamlessLoop':
    case 'useIdentityDefaults':
    case 'useLlm':
      return BOOLEAN_SCHEMA;
    case 'autoAnalyzeAfterHours':
    case 'hashtagCount':
    case 'maxLength':
    case 'slideIndex':
    case 'topN':
    case 'worstN':
    case 'clipCount':
    case 'maxIterations':
    case 'maxTokens':
    case 'seed':
    case 'days':
    case 'limit':
      return INTEGER_SCHEMA;
    case 'audioVolume':
    case 'bitrate':
    case 'creditCost':
    case 'fadeIn':
    case 'fadeOut':
    case 'fontSize':
    case 'fps':
    case 'strokeWidth':
    case 'videoVolume':
    case 'duration':
    case 'endTime':
    case 'height':
    case 'maxDuration':
    case 'minUsageCount':
    case 'minViralScore':
    case 'pitchShift':
    case 'startTime':
    case 'durationSeconds':
    case 'strength':
    case 'targetScore':
    case 'temperature':
    case 'timestampSeconds':
    case 'transitionDuration':
    case 'width':
    case 'wordsPerSecond':
      return NUMBER_SCHEMA;
    case 'selectionMode':
      return enumSchema(['first', 'last', 'timestamp', 'percentage'] as const);
    case 'audioCodec':
      return enumSchema(['aac', 'mp3'] as const);
    case 'outputQuality':
      return enumSchema(['full', 'draft'] as const);
    case 'transitionType':
      return enumSchema(['cut', 'crossfade', 'wipe', 'fade'] as const);
    case 'avoid':
    case 'hooks':
    case 'keywords':
    case 'languages':
    case 'secondaryKeywords':
    case 'platforms':
      return arraySchema(STRING_SCHEMA);
    case 'faceImage':
    case 'soundUrl':
    case 'startFrame':
    case 'videoReference':
    case 'videoUrl':
      return URL_OR_MEDIA_SCHEMA;
    case 'characterReferenceUrls':
    case 'productReferenceUrls':
    case 'images':
    case 'references':
    case 'videoReferences':
    case 'videos':
    case 'suggestions':
      return arraySchema(URL_OR_MEDIA_SCHEMA);
    case 'headers':
    case 'structuredPrompt':
    case 'variables':
    case 'audio':
    case 'brand':
    case 'data':
    case 'image':
    case 'media':
    case 'music':
    case 'post':
    case 'releaseAnalytics':
    case 'schedule':
    case 'sound':
    case 'trend':
    case 'trendData':
    case 'video':
      return MEDIA_VALUE_SCHEMA;
    default:
      return STRING_SCHEMA;
  }
}

function inputSchema(fields: readonly InputField[]): ActionJsonSchema {
  return closedObjectSchema(
    Object.fromEntries(fields.map((field) => [field, inputFieldSchema(field)])),
  );
}

/**
 * The prompt constructor deliberately treats any unreserved primitive config
 * key as a template variable, so its authored surface is open by design. The
 * contract still types every reserved key and keeps the boundary explicit —
 * `undefined` is rejected, unlike an unconstrained `additionalProperties`.
 */
function promptConstructorInputSchema(): ActionJsonSchema {
  const declared = [
    'acceptsStructuredPrompt',
    'avoid',
    'brand',
    'brandVoice',
    'content',
    'data',
    'hooks',
    'includeHashtags',
    'maxLength',
    'prompt',
    'promptFormat',
    'structuredPrompt',
    'style',
    'template',
    'tone',
    'topic',
    'variables',
  ] as const satisfies readonly InputField[];

  return {
    additionalProperties: JSON_DOCUMENT_SCHEMA,
    properties: Object.fromEntries(
      declared.map((field) => [field, inputFieldSchema(field)]),
    ),
    type: 'object',
  };
}

function objectOutput(
  properties: Readonly<Record<string, ActionJsonSchema>>,
  required: readonly string[] = Object.keys(properties),
): ActionJsonSchema {
  return closedObjectSchema(properties, required);
}

const ID_STATUS_OUTPUT = objectOutput({
  id: STRING_SCHEMA,
  status: STRING_SCHEMA,
});
const VIDEO_ASSET_OUTPUT = objectOutput({
  id: STRING_SCHEMA,
  status: STRING_SCHEMA,
  videoUrl: STRING_SCHEMA,
});
const GENERATED_MEDIA_OUTPUT = objectOutput(
  {
    externalId: nullableSchema(STRING_SCHEMA),
    generationBriefEvidence: JSON_DOCUMENT_SCHEMA,
    generationSource: STRING_SCHEMA,
    id: STRING_SCHEMA,
    imageUrl: STRING_SCHEMA,
    model: STRING_SCHEMA,
    provider: STRING_SCHEMA,
    status: STRING_SCHEMA,
    videoUrl: STRING_SCHEMA,
  },
  ['id', 'model', 'provider', 'status'],
);
const VIDEO_QA_REPORT_PROPERTIES: Readonly<Record<string, ActionJsonSchema>> = {
  blackSegments: arraySchema(JSON_DOCUMENT_SCHEMA),
  contactSheetUrl: nullableSchema(STRING_SCHEMA),
  decodeOk: BOOLEAN_SCHEMA,
  durationSeconds: nullableSchema(NUMBER_SCHEMA),
  failures: arraySchema(JSON_DOCUMENT_SCHEMA),
  frameRate: nullableSchema(NUMBER_SCHEMA),
  freezeSegments: arraySchema(JSON_DOCUMENT_SCHEMA),
  height: nullableSchema(NUMBER_SCHEMA),
  loudnessDeviation: nullableSchema(NUMBER_SCHEMA),
  loudnessLufs: nullableSchema(NUMBER_SCHEMA),
  loudnessTargetLufs: NUMBER_SCHEMA,
  passed: BOOLEAN_SCHEMA,
  streams: arraySchema(JSON_DOCUMENT_SCHEMA),
  width: nullableSchema(NUMBER_SCHEMA),
};
const VIDEO_QA_REPORT = objectOutput(VIDEO_QA_REPORT_PROPERTIES);

const WORKFLOW_NODE_CONTRACTS: Readonly<Record<string, ActionContractSchemas>> =
  {
    'ai-enhance': {
      inputSchema: inputSchema(['media', 'strength']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'ai-transcribe': {
      inputSchema: inputSchema(['audio', 'language', 'video']),
      outputSchema: objectOutput({ transcript: STRING_SCHEMA }),
    },
    aiAvatarVideo: {
      inputSchema: inputSchema([
        'aspectRatio',
        'audioUrl',
        'brandId',
        'clonedVoiceId',
        'photoUrl',
        'provider',
        'script',
        'useIdentityDefaults',
      ]),
      outputSchema: objectOutput({
        externalId: nullableSchema(STRING_SCHEMA),
        id: STRING_SCHEMA,
        status: STRING_SCHEMA,
        video: objectOutput({
          externalId: nullableSchema(STRING_SCHEMA),
          id: STRING_SCHEMA,
          status: STRING_SCHEMA,
        }),
      }),
    },
    analyticsFeedback: {
      inputSchema: inputSchema([
        'autoAnalyzeAfterHours',
        'brandId',
        'releaseAnalytics',
        'topN',
        'topic',
        'trackingEnabled',
        'worstN',
      ]),
      outputSchema: objectOutput(
        {
          avgEngagementRate: NUMBER_SCHEMA,
          bestPlatform: nullableSchema(STRING_SCHEMA),
          bestPostingTimes: arraySchema(
            closedObjectSchema(
              {
                avgEngagement: NUMBER_SCHEMA,
                dayOfWeek: NUMBER_SCHEMA,
                hour: NUMBER_SCHEMA,
              },
              ['dayOfWeek', 'hour'],
            ),
          ),
          releaseEvidence: nullableSchema(JSON_DOCUMENT_SCHEMA),
          topHooks: arraySchema(STRING_SCHEMA),
          topTopics: arraySchema(STRING_SCHEMA),
          weekOverWeekChange: NUMBER_SCHEMA,
          weekOverWeekDirection: enumSchema(['up', 'down', 'stable']),
          worstTopics: arraySchema(STRING_SCHEMA),
        },
        // `releaseEvidence` is emitted only when the run analyzed a release.
        [
          'avgEngagementRate',
          'bestPlatform',
          'bestPostingTimes',
          'topHooks',
          'topTopics',
          'weekOverWeekChange',
          'weekOverWeekDirection',
          'worstTopics',
        ],
      ),
    },
    attachPostIngredient: {
      inputSchema: inputSchema(['brandId', 'media', 'post']),
      outputSchema: objectOutput({
        ingredientId: STRING_SCHEMA,
        postId: STRING_SCHEMA,
      }),
    },
    brand: {
      inputSchema: inputSchema(['brandId']),
      outputSchema: objectOutput({
        brandId: STRING_SCHEMA,
        colors: objectOutput({
          background: STRING_SCHEMA,
          primary: STRING_SCHEMA,
          secondary: STRING_SCHEMA,
        }),
        fonts: nullableSchema(STRING_SCHEMA),
        handle: STRING_SCHEMA,
        label: STRING_SCHEMA,
        models: objectOutput({
          image: nullableSchema(STRING_SCHEMA),
          imageToVideo: nullableSchema(STRING_SCHEMA),
          music: nullableSchema(STRING_SCHEMA),
          video: nullableSchema(STRING_SCHEMA),
        }),
        voice: nullableSchema(STRING_SCHEMA),
      }),
    },
    brandAsset: {
      inputSchema: inputSchema(['assetType', 'brandId']),
      outputSchema: {
        anyOf: [STRING_SCHEMA, arraySchema(STRING_SCHEMA)],
      },
    },
    brandContext: {
      inputSchema: inputSchema(['brandId']),
      outputSchema: objectOutput({
        brandId: STRING_SCHEMA,
        colors: objectOutput({
          background: STRING_SCHEMA,
          primary: STRING_SCHEMA,
          secondary: STRING_SCHEMA,
        }),
        fonts: nullableSchema(STRING_SCHEMA),
        label: STRING_SCHEMA,
        models: objectOutput({
          image: nullableSchema(STRING_SCHEMA),
          imageToVideo: nullableSchema(STRING_SCHEMA),
          music: nullableSchema(STRING_SCHEMA),
          video: nullableSchema(STRING_SCHEMA),
        }),
        slug: STRING_SCHEMA,
        voice: nullableSchema(STRING_SCHEMA),
        voiceConfig: nullableSchema(JSON_DOCUMENT_SCHEMA),
      }),
    },
    castPrompt: {
      inputSchema: inputSchema([
        'brand',
        'content',
        'product',
        'prompt',
        'startFrame',
        'style',
      ]),
      outputSchema: objectOutput({
        output: STRING_SCHEMA,
        preset: JSON_DOCUMENT_SCHEMA,
        prompt: STRING_SCHEMA,
        text: STRING_SCHEMA,
      }),
    },
    cinematicColorGrade: {
      inputSchema: inputSchema(['video']),
      outputSchema: STRING_SCHEMA,
    },
    colorGrade: {
      inputSchema: inputSchema(['image', 'media', 'style', 'video']),
      outputSchema: STRING_SCHEMA,
    },
    'effect-captions': {
      inputSchema: inputSchema([
        'autoSync',
        'backgroundColor',
        'brandId',
        'fontColor',
        'fontSize',
        'generateChapters',
        'generateTranscript',
        'hashtagCount',
        'includeCTA',
        'includeEmojis',
        'includeHashtags',
        'languages',
        'platform',
        'position',
        'style',
        'tone',
        'video',
      ]),
      outputSchema: VIDEO_ASSET_OUTPUT,
    },
    'effect-ken-burns': {
      inputSchema: inputSchema(['image', 'media']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'effect-portrait-blur': {
      inputSchema: inputSchema(['media', 'video']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'effect-split-screen': {
      inputSchema: inputSchema(['media', 'videos']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'effect-text-overlay': {
      inputSchema: inputSchema([
        'fontSize',
        'fontWeight',
        'media',
        'position',
        'slideIndex',
        'strokeColor',
        'strokeWidth',
        'text',
        'textColor',
        'video',
      ]),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'effect-watermark': {
      inputSchema: inputSchema(['image', 'media', 'video']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    filmGrain: {
      inputSchema: inputSchema(['video']),
      outputSchema: STRING_SCHEMA,
    },
    hookGenerator: {
      inputSchema: inputSchema([
        'brand',
        'hookFormula',
        'niche',
        'product',
        'toneStyle',
        'trend',
        'trendData',
      ]),
      outputSchema: objectOutput({
        captionHook: STRING_SCHEMA,
        hashtags: arraySchema(STRING_SCHEMA),
        hookText: STRING_SCHEMA,
        slidePrompts: arraySchema(STRING_SCHEMA),
      }),
    },
    imageGen: {
      inputSchema: inputSchema([
        'brandId',
        'faceImage',
        'height',
        'image',
        'model',
        'negativePrompt',
        'prompt',
        'quality',
        'references',
        'seed',
        'strength',
        'style',
        'width',
      ]),
      outputSchema: GENERATED_MEDIA_OUTPUT,
    },
    'input-template': {
      inputSchema: inputSchema(['data']),
      outputSchema: objectOutput({ prompt: STRING_SCHEMA }),
    },
    iterativeSeoRefine: {
      inputSchema: inputSchema([
        'content',
        'maxIterations',
        'targetScore',
        'title',
      ]),
      outputSchema: objectOutput({
        converged: BOOLEAN_SCHEMA,
        iterations: INTEGER_SCHEMA,
        score: NUMBER_SCHEMA,
        text: STRING_SCHEMA,
        title: nullableSchema(STRING_SCHEMA),
      }),
    },
    lensEffects: {
      inputSchema: inputSchema(['video']),
      outputSchema: STRING_SCHEMA,
    },
    lipSync: {
      inputSchema: inputSchema(['audio', 'brandId', 'image', 'video']),
      outputSchema: objectOutput({
        id: STRING_SCHEMA,
        status: STRING_SCHEMA,
        videoUrl: STRING_SCHEMA,
      }),
    },
    llm: {
      inputSchema: inputSchema([
        'content',
        'maxTokens',
        'model',
        'outputFormat',
        'prompt',
        'temperature',
        'text',
      ]),
      outputSchema: objectOutput({
        content: STRING_SCHEMA,
        model: STRING_SCHEMA,
        text: STRING_SCHEMA,
      }),
    },
    musicSource: {
      inputSchema: inputSchema([
        'brandId',
        'generatePrompt',
        'libraryCategory',
        'libraryMood',
        'music',
        'sourceType',
        'uploadUrl',
      ]),
      // The library branch resolves an ingredient; upload and generate branches
      // hand back the caller-supplied URL, which may not resolve at all.
      outputSchema: objectOutput(
        {
          musicIngredientId: STRING_SCHEMA,
          musicUrl: nullableSchema(STRING_SCHEMA),
          sourceType: STRING_SCHEMA,
        },
        ['musicUrl', 'sourceType'],
      ),
    },
    newsletterGen: {
      inputSchema: inputSchema([
        'brandId',
        'brandLabel',
        'content',
        'instructions',
        'prompt',
        'text',
        'timezone',
      ]),
      outputSchema: objectOutput({
        id: STRING_SCHEMA,
        newsletter: objectOutput({
          id: STRING_SCHEMA,
          label: STRING_SCHEMA,
          status: STRING_SCHEMA,
          topic: STRING_SCHEMA,
        }),
        status: STRING_SCHEMA,
        topic: STRING_SCHEMA,
      }),
    },
    'output-export': {
      inputSchema: inputSchema(['format', 'media', 'quality']),
      outputSchema: objectOutput({ url: STRING_SCHEMA }),
    },
    'output-notify': {
      inputSchema: inputSchema(['data']),
      outputSchema: objectOutput({ delivered: BOOLEAN_SCHEMA }),
    },
    'output-save': {
      inputSchema: inputSchema(['media']),
      outputSchema: ID_STATUS_OUTPUT,
    },
    'output-webhook': {
      inputSchema: inputSchema([
        'data',
        'headers',
        'includeAssetUrl',
        'includeMetadata',
        'method',
        'url',
      ]),
      outputSchema: objectOutput({
        status: INTEGER_SCHEMA,
        success: BOOLEAN_SCHEMA,
      }),
    },
    postGen: {
      inputSchema: inputSchema([
        'brand',
        'brandId',
        'brandLabel',
        'content',
        'credentialId',
        'platform',
        'prompt',
        'schedule',
        'text',
        'timezone',
        'topic',
      ]),
      outputSchema: objectOutput({
        description: STRING_SCHEMA,
        groupId: STRING_SCHEMA,
        id: STRING_SCHEMA,
        platform: STRING_SCHEMA,
        post: objectOutput({
          id: STRING_SCHEMA,
          label: STRING_SCHEMA,
          status: STRING_SCHEMA,
        }),
        postIds: arraySchema(STRING_SCHEMA),
        status: STRING_SCHEMA,
      }),
    },
    postReply: {
      inputSchema: inputSchema([
        'brandId',
        'conversationId',
        'credentialId',
        'idempotencyKey',
        'mediaUrl',
        'platform',
        'postId',
        'text',
      ]),
      outputSchema: objectOutput(
        {
          error: STRING_SCHEMA,
          originalPostId: STRING_SCHEMA,
          platform: STRING_SCHEMA,
          replyId: STRING_SCHEMA,
          replyUrl: STRING_SCHEMA,
          success: BOOLEAN_SCHEMA,
        },
        ['originalPostId', 'platform', 'success'],
      ),
    },
    'process-compress': {
      inputSchema: inputSchema(['quality', 'video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'process-extract-audio': {
      inputSchema: inputSchema(['format', 'video']),
      outputSchema: objectOutput({ audio: MEDIA_VALUE_SCHEMA }),
    },
    'process-merge-videos': {
      inputSchema: inputSchema(['videos']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'process-mirror': {
      inputSchema: inputSchema(['video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'process-resize': {
      inputSchema: inputSchema([
        'aspectRatio',
        'height',
        'maintainQuality',
        'media',
        'platform',
        'width',
      ]),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'process-reverse': {
      inputSchema: inputSchema(['video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'process-transform': {
      inputSchema: inputSchema([
        'aspectRatio',
        'maintainQuality',
        'media',
        'orientation',
      ]),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'process-trim': {
      inputSchema: inputSchema(['endTime', 'startTime', 'video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    promptConstructor: {
      inputSchema: promptConstructorInputSchema(),
      // Text mode emits the bare prompt string; JSON mode emits
      // `PromptConstructorJsonPayload`.
      outputSchema: {
        anyOf: [
          STRING_SCHEMA,
          closedObjectSchema(
            {
              prompt: STRING_SCHEMA,
              promptFormat: enumSchema(['json']),
              structuredPrompt: JSON_DOCUMENT_SCHEMA,
            },
            ['prompt', 'promptFormat'],
          ),
        ],
      },
    },
    publish: {
      inputSchema: inputSchema([
        'addWatermark',
        'brand',
        'caption',
        'category',
        'credentialId',
        'media',
        'monetization',
        'platform',
        'platforms',
        'schedule',
        'visibility',
      ]),
      outputSchema: objectOutput({
        platforms: arraySchema(STRING_SCHEMA),
        postIds: arraySchema(STRING_SCHEMA),
        scheduledFor: nullableSchema(STRING_SCHEMA),
        status: enumSchema(['published', 'queued', 'scheduled'] as const),
      }),
    },
    reframe: {
      inputSchema: inputSchema([
        'brandId',
        'format',
        'media',
        'targetAspectRatio',
      ]),
      outputSchema: objectOutput({
        format: STRING_SCHEMA,
        id: STRING_SCHEMA,
        mediaUrl: STRING_SCHEMA,
        status: STRING_SCHEMA,
        targetAspectRatio: STRING_SCHEMA,
      }),
    },
    reportDelivery: {
      inputSchema: inputSchema([
        'channel',
        'content',
        'destination',
        'email',
        'html',
        'subject',
        'summary',
        'text',
        'title',
      ]),
      outputSchema: objectOutput({
        delivered: BOOLEAN_SCHEMA,
        destination: STRING_SCHEMA,
        channel: STRING_SCHEMA,
      }),
    },
    sendDm: {
      inputSchema: inputSchema([
        'brandId',
        'conversationId',
        'credentialId',
        'idempotencyKey',
        'mediaUrl',
        'platform',
        'recipientId',
        'text',
      ]),
      outputSchema: objectOutput(
        {
          error: STRING_SCHEMA,
          messageId: STRING_SCHEMA,
          platform: STRING_SCHEMA,
          recipientId: STRING_SCHEMA,
          success: BOOLEAN_SCHEMA,
        },
        ['platform', 'recipientId', 'success'],
      ),
    },
    sendEmail: {
      inputSchema: inputSchema([
        'content',
        'html',
        'reason',
        'skipped',
        'subject',
        'title',
        'to',
      ]),
      outputSchema: {
        oneOf: [
          objectOutput({
            sent: { const: true, type: 'boolean' },
            to: STRING_SCHEMA,
          }),
          objectOutput({
            sent: { const: false, type: 'boolean' },
            skippedReason: STRING_SCHEMA,
          }),
        ],
      },
    },
    seoRewrite: {
      inputSchema: inputSchema([
        'content',
        'model',
        'suggestions',
        'targetKeyword',
        'title',
      ]),
      outputSchema: objectOutput({
        appliedSuggestions: arraySchema(STRING_SCHEMA),
        model: nullableSchema(STRING_SCHEMA),
        targetKeyword: nullableSchema(STRING_SCHEMA),
        text: STRING_SCHEMA,
        title: nullableSchema(STRING_SCHEMA),
      }),
    },
    seoScore: {
      inputSchema: inputSchema([
        'content',
        'secondaryKeywords',
        'targetKeyword',
        'title',
        'useLlm',
      ]),
      outputSchema: objectOutput({
        breakdown: JSON_DOCUMENT_SCHEMA,
        content: nullableSchema(STRING_SCHEMA),
        rating: STRING_SCHEMA,
        score: NUMBER_SCHEMA,
        suggestions: arraySchema(STRING_SCHEMA),
        targetKeyword: nullableSchema(STRING_SCHEMA),
        title: nullableSchema(STRING_SCHEMA),
      }),
    },
    socialRead: {
      inputSchema: inputSchema([
        'brand',
        'brandId',
        'credentialId',
        'limit',
        'mode',
        'platform',
        'query',
        'username',
      ]),
      outputSchema: objectOutput({
        count: INTEGER_SCHEMA,
        mode: STRING_SCHEMA,
        platform: STRING_SCHEMA,
        posts: STRING_SCHEMA,
        postsJson: STRING_SCHEMA,
        summary: STRING_SCHEMA,
      }),
    },
    soundOverlay: {
      inputSchema: inputSchema([
        'audioVolume',
        'brandId',
        'fadeIn',
        'fadeOut',
        'mixMode',
        'soundUrl',
        'videoUrl',
        'videoVolume',
      ]),
      // The executor returns the merged video ingredient, not a bare url.
      outputSchema: objectOutput({
        id: STRING_SCHEMA,
        status: STRING_SCHEMA,
        videoUrl: STRING_SCHEMA,
      }),
    },
    sourceCorpus: {
      inputSchema: inputSchema(['brandId', 'days', 'limit']),
      outputSchema: objectOutput({
        content: STRING_SCHEMA,
        corpus: STRING_SCHEMA,
        count: INTEGER_SCHEMA,
        markdown: STRING_SCHEMA,
        posts: arraySchema(JSON_DOCUMENT_SCHEMA),
        text: STRING_SCHEMA,
      }),
    },
    talkingHeadScript: {
      inputSchema: inputSchema([
        'brand',
        'brandVoice',
        'clipCount',
        'durationSeconds',
        'harnessContext',
        'language',
        'model',
        'productContext',
        'wordsPerSecond',
      ]),
      // `language` is run metadata, not node output — `TalkingHeadScriptNodeOutput`
      // carries only the script payload.
      outputSchema: objectOutput({
        clipCount: INTEGER_SCHEMA,
        fullText: STRING_SCHEMA,
        script: JSON_DOCUMENT_SCHEMA,
        segments: arraySchema(JSON_DOCUMENT_SCHEMA),
        totalDurationSeconds: NUMBER_SCHEMA,
        totalTargetWordCount: INTEGER_SCHEMA,
        totalWordCount: INTEGER_SCHEMA,
        wordsPerSecond: NUMBER_SCHEMA,
      }),
    },
    textToSpeech: {
      inputSchema: inputSchema(['text', 'voiceId']),
      outputSchema: objectOutput({
        audioUrl: STRING_SCHEMA,
        duration: NUMBER_SCHEMA,
        id: STRING_SCHEMA,
        status: STRING_SCHEMA,
      }),
    },
    trendDigest: {
      inputSchema: inputSchema([
        'brandId',
        'creditCost',
        'minViralScore',
        'platform',
        'platforms',
        'topN',
      ]),
      outputSchema: {
        oneOf: [
          objectOutput({
            creditCost: NUMBER_SCHEMA,
            html: STRING_SCHEMA,
            orgId: STRING_SCHEMA,
            ownerUserId: STRING_SCHEMA,
            skipped: { const: false, type: 'boolean' },
            subject: STRING_SCHEMA,
            to: STRING_SCHEMA,
          }),
          objectOutput({
            reason: STRING_SCHEMA,
            skipped: { const: true, type: 'boolean' },
          }),
        ],
      },
    },
    trendHashtagInspiration: {
      inputSchema: inputSchema([
        'auto',
        'contentPreference',
        'hashtag',
        'platform',
        'trend',
      ]),
      outputSchema: objectOutput({
        contentType: enumSchema([
          'carousel',
          'image',
          'thread',
          'video',
        ] as const),
        hashtagPostCount: nullableSchema(NUMBER_SCHEMA),
        hashtags: arraySchema(STRING_SCHEMA),
        prompt: STRING_SCHEMA,
        recommendedPlatform: STRING_SCHEMA,
        sourceHashtag: STRING_SCHEMA,
      }),
    },
    trendSoundInspiration: {
      inputSchema: inputSchema(['maxDuration', 'minUsageCount', 'platform']),
      outputSchema: objectOutput({
        authorName: nullableSchema(STRING_SCHEMA),
        coverUrl: nullableSchema(STRING_SCHEMA),
        duration: nullableSchema(NUMBER_SCHEMA),
        growthRate: nullableSchema(NUMBER_SCHEMA),
        soundId: nullableSchema(STRING_SCHEMA),
        soundName: nullableSchema(STRING_SCHEMA),
        soundUrl: nullableSchema(STRING_SCHEMA),
        usageCount: nullableSchema(NUMBER_SCHEMA),
      }),
    },
    trendTrigger: {
      inputSchema: inputSchema([
        'checkFrequency',
        'keywords',
        'minViralScore',
        'platform',
        'topic',
        'trendId',
        'trendType',
      ]),
      outputSchema: {
        anyOf: [
          nullableSchema(
            objectOutput({
              hashtags: arraySchema(STRING_SCHEMA),
              platform: STRING_SCHEMA,
              soundId: nullableSchema(STRING_SCHEMA),
              topic: STRING_SCHEMA,
              trendId: STRING_SCHEMA,
              videoUrl: nullableSchema(STRING_SCHEMA),
              viralScore: NUMBER_SCHEMA,
            }),
          ),
        ],
      },
    },
    trendVideoInspiration: {
      inputSchema: inputSchema([
        'auto',
        'contentPreference',
        'minViralScore',
        'platform',
        'trend',
        'trendId',
      ]),
      outputSchema: objectOutput({
        aspectRatio: enumSchema(['16:9', '1:1', '9:16'] as const),
        duration: nullableSchema(NUMBER_SCHEMA),
        hashtags: arraySchema(STRING_SCHEMA),
        prompt: STRING_SCHEMA,
        soundId: nullableSchema(STRING_SCHEMA),
        sourceTrendTitle: nullableSchema(STRING_SCHEMA),
        sourceTrendUrl: nullableSchema(STRING_SCHEMA),
        style: STRING_SCHEMA,
      }),
    },
    upscale: {
      inputSchema: inputSchema([
        'bitrate',
        'brandId',
        'fps',
        'media',
        'model',
        'quality',
        'resolution',
        'scale',
      ]),
      outputSchema: objectOutput({
        id: STRING_SCHEMA,
        mediaUrl: STRING_SCHEMA,
        model: STRING_SCHEMA,
        scale: STRING_SCHEMA,
        status: STRING_SCHEMA,
      }),
    },
    videoFrameExtract: {
      inputSchema: inputSchema(['selectionMode', 'timestampSeconds', 'video']),
      outputSchema: objectOutput({
        image: STRING_SCHEMA,
        last_frame: STRING_SCHEMA,
        sourceVideo: STRING_SCHEMA,
      }),
    },
    videoGen: {
      inputSchema: inputSchema([
        'actionVerb',
        'aspectRatio',
        'brandId',
        'duration',
        'fps',
        'height',
        'image',
        'lastFrame',
        'model',
        'negativePrompt',
        'parentIngredientId',
        'prompt',
        'references',
        'resolution',
        'seed',
        'style',
        'videoReference',
        'videoReferences',
        'width',
      ]),
      outputSchema: GENERATED_MEDIA_OUTPUT,
    },
    videoQa: {
      inputSchema: inputSchema([
        'characterReferenceUrls',
        'productReferenceUrls',
        'references',
        'video',
        'videoUrl',
      ]),
      outputSchema: objectOutput({
        ...VIDEO_QA_REPORT_PROPERTIES,
        continuityQa: nullableSchema(JSON_DOCUMENT_SCHEMA),
        report: VIDEO_QA_REPORT,
        video: nullableSchema(STRING_SCHEMA),
      }),
    },
    videoStitch: {
      inputSchema: inputSchema([
        'audioCodec',
        'brandId',
        'dispatchMode',
        'model',
        'outputQuality',
        'parentId',
        'quality',
        'seamlessLoop',
        'transitionDuration',
        'transitionType',
        'videos',
      ]),
      outputSchema: objectOutput({
        video: STRING_SCHEMA,
        videoUrl: STRING_SCHEMA,
      }),
    },
    voiceChange: {
      inputSchema: inputSchema(['audio', 'pitchShift', 'targetVoiceId']),
      outputSchema: STRING_SCHEMA,
    },
  };

export function getWorkflowNodeActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return WORKFLOW_NODE_CONTRACTS[id];
}
