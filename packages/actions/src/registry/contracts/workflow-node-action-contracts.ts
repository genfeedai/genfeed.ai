import type { ActionJsonSchema } from '../../interfaces/action-definition.interface.js';
import type { ActionContractSchemas } from './action-contract.interface.js';
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
} from './schema-builders.js';

type InputField =
  | 'aspectRatio'
  | 'assetType'
  | 'audio'
  | 'audioVolume'
  | 'audioUrl'
  | 'auto'
  | 'brand'
  | 'brandId'
  | 'brandLabel'
  | 'caption'
  | 'channel'
  | 'clipCount'
  | 'clonedVoiceId'
  | 'content'
  | 'contentPreference'
  | 'conversationId'
  | 'credentialId'
  | 'data'
  | 'duration'
  | 'destination'
  | 'days'
  | 'endTime'
  | 'format'
  | 'generatePrompt'
  | 'harnessContext'
  | 'hashtag'
  | 'height'
  | 'image'
  | 'images'
  | 'language'
  | 'limit'
  | 'lastFrame'
  | 'maxDuration'
  | 'maxIterations'
  | 'maxTokens'
  | 'mediaUrl'
  | 'media'
  | 'minUsageCount'
  | 'minViralScore'
  | 'model'
  | 'music'
  | 'musicUrl'
  | 'negativePrompt'
  | 'niche'
  | 'photoUrl'
  | 'pitchShift'
  | 'platform'
  | 'post'
  | 'postId'
  | 'product'
  | 'productContext'
  | 'prompt'
  | 'quality'
  | 'query'
  | 'recipientId'
  | 'references'
  | 'scale'
  | 'releaseAnalytics'
  | 'schedule'
  | 'script'
  | 'seed'
  | 'sound'
  | 'soundId'
  | 'soundUrl'
  | 'sourceType'
  | 'startTime'
  | 'strength'
  | 'style'
  | 'suggestions'
  | 'targetKeyword'
  | 'targetScore'
  | 'targetAspectRatio'
  | 'targetVoiceId'
  | 'temperature'
  | 'text'
  | 'title'
  | 'topic'
  | 'trend'
  | 'trendId'
  | 'uploadUrl'
  | 'useLlm'
  | 'useIdentityDefaults'
  | 'video'
  | 'videoReferences'
  | 'videos'
  | 'videoUrl'
  | 'voiceId'
  | 'width'
  | 'wordsPerSecond'
  | 'idempotencyKey'
  | 'instructions'
  | 'mode'
  | 'timezone'
  | 'username';

const MEDIA_VALUE_SCHEMA = JSON_DOCUMENT_SCHEMA;
const URL_OR_MEDIA_SCHEMA = {
  anyOf: [STRING_SCHEMA, MEDIA_VALUE_SCHEMA],
} as const;

function inputFieldSchema(field: InputField): ActionJsonSchema {
  switch (field) {
    case 'auto':
    case 'useIdentityDefaults':
    case 'useLlm':
      return BOOLEAN_SCHEMA;
    case 'clipCount':
    case 'maxIterations':
    case 'maxTokens':
    case 'seed':
    case 'days':
    case 'limit':
      return INTEGER_SCHEMA;
    case 'duration':
    case 'endTime':
    case 'height':
    case 'maxDuration':
    case 'minUsageCount':
    case 'minViralScore':
    case 'pitchShift':
    case 'startTime':
    case 'strength':
    case 'targetScore':
    case 'temperature':
    case 'width':
    case 'wordsPerSecond':
      return NUMBER_SCHEMA;
    case 'images':
    case 'references':
    case 'videoReferences':
    case 'videos':
    case 'suggestions':
      return arraySchema(URL_OR_MEDIA_SCHEMA);
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
      inputSchema: inputSchema(['brandId', 'releaseAnalytics', 'topic']),
      outputSchema: objectOutput({
        avgEngagementRate: NUMBER_SCHEMA,
        bestPlatform: nullableSchema(STRING_SCHEMA),
        bestPostingTimes: arraySchema(STRING_SCHEMA),
        releaseEvidence: nullableSchema(JSON_DOCUMENT_SCHEMA),
        topHooks: arraySchema(STRING_SCHEMA),
        topTopics: arraySchema(STRING_SCHEMA),
        weekOverWeekChange: NUMBER_SCHEMA,
        weekOverWeekDirection: enumSchema(['up', 'down', 'stable']),
        worstTopics: arraySchema(STRING_SCHEMA),
      }),
    },
    attachPostIngredient: {
      inputSchema: inputSchema(['post', 'media']),
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
      inputSchema: inputSchema(['brandId', 'video']),
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
      inputSchema: inputSchema(['media', 'text', 'video']),
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
      inputSchema: inputSchema(['brand', 'niche', 'product', 'trend']),
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
        'height',
        'model',
        'negativePrompt',
        'prompt',
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
        'music',
        'uploadUrl',
      ]),
      outputSchema: STRING_SCHEMA,
    },
    newsletterGen: {
      inputSchema: inputSchema([
        'brandId',
        'content',
        'instructions',
        'prompt',
        'text',
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
      inputSchema: inputSchema(['data']),
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
      inputSchema: inputSchema(['aspectRatio', 'height', 'media', 'width']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'process-reverse': {
      inputSchema: inputSchema(['video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    'process-transform': {
      inputSchema: inputSchema(['aspectRatio', 'media']),
      outputSchema: objectOutput({ media: MEDIA_VALUE_SCHEMA }),
    },
    'process-trim': {
      inputSchema: inputSchema(['endTime', 'startTime', 'video']),
      outputSchema: objectOutput({ video: MEDIA_VALUE_SCHEMA }),
    },
    promptConstructor: {
      inputSchema: inputSchema([
        'brand',
        'content',
        'data',
        'prompt',
        'style',
        'topic',
      ]),
      outputSchema: objectOutput({
        output: STRING_SCHEMA,
        prompt: STRING_SCHEMA,
        text: STRING_SCHEMA,
      }),
    },
    publish: {
      inputSchema: inputSchema([
        'brand',
        'caption',
        'credentialId',
        'media',
        'platform',
        'schedule',
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
      inputSchema: inputSchema(['channel', 'content', 'destination', 'title']),
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
      inputSchema: inputSchema(['content', 'title']),
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
      inputSchema: inputSchema(['content', 'targetKeyword', 'title', 'useLlm']),
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
        'soundUrl',
        'videoUrl',
      ]),
      outputSchema: STRING_SCHEMA,
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
        'clipCount',
        'harnessContext',
        'language',
        'model',
        'productContext',
        'wordsPerSecond',
      ]),
      outputSchema: objectOutput({
        clipCount: INTEGER_SCHEMA,
        fullText: STRING_SCHEMA,
        language: STRING_SCHEMA,
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
      inputSchema: inputSchema(['brandId', 'platform']),
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
        'minViralScore',
        'platform',
        'topic',
        'trendId',
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
      inputSchema: inputSchema(['brandId', 'media', 'model', 'scale']),
      outputSchema: objectOutput({
        id: STRING_SCHEMA,
        mediaUrl: STRING_SCHEMA,
        model: STRING_SCHEMA,
        scale: STRING_SCHEMA,
        status: STRING_SCHEMA,
      }),
    },
    videoFrameExtract: {
      inputSchema: inputSchema(['video']),
      outputSchema: objectOutput({
        image: STRING_SCHEMA,
        last_frame: STRING_SCHEMA,
        sourceVideo: STRING_SCHEMA,
      }),
    },
    videoGen: {
      inputSchema: inputSchema([
        'brandId',
        'duration',
        'height',
        'lastFrame',
        'model',
        'negativePrompt',
        'prompt',
        'references',
        'seed',
        'videoReferences',
        'width',
      ]),
      outputSchema: GENERATED_MEDIA_OUTPUT,
    },
    videoQa: {
      inputSchema: inputSchema(['references', 'video', 'videoUrl']),
      outputSchema: objectOutput({
        ...VIDEO_QA_REPORT_PROPERTIES,
        continuityQa: nullableSchema(JSON_DOCUMENT_SCHEMA),
        report: VIDEO_QA_REPORT,
        video: nullableSchema(STRING_SCHEMA),
      }),
    },
    videoStitch: {
      inputSchema: inputSchema(['quality', 'videos']),
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
