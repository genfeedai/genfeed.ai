import type { INodeExecutor } from '@workflow-engine/executors/base-executor';
import {
  createSimpleExecutor,
  NoopExecutor,
} from '@workflow-engine/executors/base-executor';
import {
  BeatAnalysisExecutor,
  createBeatAnalysisExecutor,
} from '@workflow-engine/executors/saas/beat-analysis-executor';
import {
  BeatSyncEditorExecutor,
  createBeatSyncEditorExecutor,
} from '@workflow-engine/executors/saas/beat-sync-editor-executor';
import {
  BrandAssetExecutor,
  createBrandAssetExecutor,
} from '@workflow-engine/executors/saas/brand-asset-executor';
import {
  BrandContextExecutor,
  createBrandContextExecutor,
} from '@workflow-engine/executors/saas/brand-context-executor';
import {
  BrandExecutor,
  createBrandExecutor,
} from '@workflow-engine/executors/saas/brand-executor';
import {
  CinematicColorGradeExecutor,
  createCinematicColorGradeExecutor,
} from '@workflow-engine/executors/saas/cinematic-color-grade-executor';
import {
  ColorGradeExecutor,
  createColorGradeExecutor,
} from '@workflow-engine/executors/saas/color-grade-executor';
import { CommentTriggerExecutor } from '@workflow-engine/executors/saas/comment-trigger-executor';
import { ConditionExecutor } from '@workflow-engine/executors/saas/condition-executor';
import { DelayExecutor } from '@workflow-engine/executors/saas/delay-executor';
import { EngagementTriggerExecutor } from '@workflow-engine/executors/saas/engagement-trigger-executor';
import {
  createFilmGrainExecutor,
  FilmGrainExecutor,
} from '@workflow-engine/executors/saas/film-grain-executor';
import { HookGeneratorExecutor } from '@workflow-engine/executors/saas/hook-generator-executor';
import { ImageGenExecutor } from '@workflow-engine/executors/saas/image-gen-executor';
import {
  createIterativeSeoRefineExecutor,
  IterativeSeoRefineExecutor,
} from '@workflow-engine/executors/saas/iterative-seo-refine-executor';
import { KeywordTriggerExecutor } from '@workflow-engine/executors/saas/keyword-trigger-executor';
import {
  createLensEffectsExecutor,
  LensEffectsExecutor,
} from '@workflow-engine/executors/saas/lens-effects-executor';
import { LipSyncExecutor } from '@workflow-engine/executors/saas/lip-sync-executor';
import { MentionTriggerExecutor } from '@workflow-engine/executors/saas/mention-trigger-executor';
import {
  createMusicSourceExecutor,
  MusicSourceExecutor,
} from '@workflow-engine/executors/saas/music-source-executor';
import { NewFollowerTriggerExecutor } from '@workflow-engine/executors/saas/new-follower-trigger-executor';
import { NewLikeTriggerExecutor } from '@workflow-engine/executors/saas/new-like-trigger-executor';
import { NewRepostTriggerExecutor } from '@workflow-engine/executors/saas/new-repost-trigger-executor';
import {
  createPatternContextExecutor,
  PatternContextExecutor,
} from '@workflow-engine/executors/saas/pattern-context-executor';
import { PostPublishTriggerExecutor } from '@workflow-engine/executors/saas/post-publish-trigger-executor';
import { PostReplyExecutor } from '@workflow-engine/executors/saas/post-reply-executor';
import { PromptConstructorExecutor } from '@workflow-engine/executors/saas/prompt-constructor-executor';
import {
  createPublishExecutor,
  PublishExecutor,
} from '@workflow-engine/executors/saas/publish-executor';
import { ReframeExecutor } from '@workflow-engine/executors/saas/reframe-executor';
import {
  createRssInputExecutor,
  RssInputExecutor,
} from '@workflow-engine/executors/saas/rss-input-executor';
import { SendDmExecutor } from '@workflow-engine/executors/saas/send-dm-executor';
import {
  createSendEmailExecutor,
  SendEmailExecutor,
} from '@workflow-engine/executors/saas/send-email-executor';
import {
  createSeoRewriteExecutor,
  SeoRewriteExecutor,
} from '@workflow-engine/executors/saas/seo-rewrite-executor';
import {
  createSeoScoreExecutor,
  SeoScoreExecutor,
} from '@workflow-engine/executors/saas/seo-score-executor';
import {
  createSocialPublishExecutor,
  SocialPublishExecutor,
} from '@workflow-engine/executors/saas/social-publish-executor';
import {
  createSoundOverlayExecutor,
  SoundOverlayExecutor,
} from '@workflow-engine/executors/saas/sound-overlay-executor';
import { TextToSpeechExecutor } from '@workflow-engine/executors/saas/text-to-speech-executor';
import { TrendDigestExecutor } from '@workflow-engine/executors/saas/trend-digest-executor';
import {
  createTrendTriggerExecutor,
  TrendTriggerExecutor,
} from '@workflow-engine/executors/saas/trend-trigger-executor';
import {
  createTweetInputExecutor,
  TweetInputExecutor,
} from '@workflow-engine/executors/saas/tweet-input-executor';
import {
  createTweetRemixExecutor,
  TweetRemixExecutor,
} from '@workflow-engine/executors/saas/tweet-remix-executor';
import { UpscaleExecutor } from '@workflow-engine/executors/saas/upscale-executor';
import {
  createVideoInputExecutor,
  VideoInputExecutor,
} from '@workflow-engine/executors/saas/video-input-executor';
import { VoiceChangeExecutor } from '@workflow-engine/executors/saas/voice-change-executor';

/**
 * Node Type to Executor Mapping
 *
 * This registry maps node types (from @genfeedai/workflow-saas) to their
 * executor implementations in this package.
 *
 * | Node Type       | Executor                 | Package Location                      |
 * |-----------------|--------------------------|---------------------------------------|
 * | brand           | BrandExecutor            | ./saas/brand-executor.ts              |
 * | brandContext    | BrandContextExecutor     | ./saas/brand-context-executor.ts      |
 * | brandAsset      | BrandAssetExecutor       | ./saas/brand-asset-executor.ts        |
 * | publish         | PublishExecutor          | ./saas/publish-executor.ts            |
 * | tweetInput      | TweetInputExecutor       | ./saas/tweet-input-executor.ts        |
 * | tweetRemix      | TweetRemixExecutor       | ./saas/tweet-remix-executor.ts        |
 * | rssInput        | RssInputExecutor         | ./saas/rss-input-executor.ts          |
 * | socialPublish   | SocialPublishExecutor    | ./saas/social-publish-executor.ts     |
 * | trendTrigger    | TrendTriggerExecutor     | ./saas/trend-trigger-executor.ts      |
 * | soundOverlay    | SoundOverlayExecutor     | ./saas/sound-overlay-executor.ts      |
 * | videoInput      | VideoInputExecutor       | ./saas/video-input-executor.ts        |
 * | musicSource     | MusicSourceExecutor      | ./saas/music-source-executor.ts       |
 * | beatAnalysis    | BeatAnalysisExecutor     | ./saas/beat-analysis-executor.ts      |
 * | beatSyncEditor  | BeatSyncEditorExecutor   | ./saas/beat-sync-editor-executor.ts   |
 * | colorGrade      | ColorGradeExecutor       | ./saas/color-grade-executor.ts        |
 * | cinematicColorGrade | CinematicColorGradeExecutor | ./saas/cinematic-color-grade-executor.ts |
 * | filmGrain       | FilmGrainExecutor        | ./saas/film-grain-executor.ts         |
 * | lensEffects     | LensEffectsExecutor      | ./saas/lens-effects-executor.ts       |
 * | hookGenerator   | HookGeneratorExecutor    | ./saas/hook-generator-executor.ts     |
 * | promptConstructor | PromptConstructorExecutor | ./saas/prompt-constructor-executor.ts |
 * | voiceChange     | VoiceChangeExecutor      | ./saas/voice-change-executor.ts       |
 * | lipSync         | LipSyncExecutor          | ./saas/lip-sync-executor.ts           |
 * | textToSpeech    | TextToSpeechExecutor     | ./saas/text-to-speech-executor.ts     |
 * | patternContext  | PatternContextExecutor   | ./saas/pattern-context-executor.ts    |
 * | reframe         | ReframeExecutor          | ./saas/reframe-executor.ts            |
 * | upscale         | UpscaleExecutor          | ./saas/upscale-executor.ts            |
 *
 * Executors require "resolvers" to be injected at runtime since they need
 * access to database operations and external services.
 */

export type ExecutorFactory<T extends INodeExecutor = INodeExecutor> = () => T;

export interface ExecutorRegistryEntry {
  nodeType: string;
  executorClass: new () => INodeExecutor;
  factory: ExecutorFactory;
  description: string;
  requiresResolver: boolean;
}

/**
 * Registry of all available node executors
 */
export const EXECUTOR_REGISTRY: Record<string, ExecutorRegistryEntry> = {
  beatAnalysis: {
    description: 'Detects tempo and beat timestamps from audio',
    executorClass: BeatAnalysisExecutor,
    factory: () => createBeatAnalysisExecutor(),
    nodeType: 'beatAnalysis',
    requiresResolver: true,
  },
  beatSyncEditor: {
    description: 'Cuts videos to match beat timestamps',
    executorClass: BeatSyncEditorExecutor,
    factory: () => createBeatSyncEditorExecutor(),
    nodeType: 'beatSyncEditor',
    requiresResolver: true,
  },
  brand: {
    description: 'Resolves brand context from organization brands',
    executorClass: BrandExecutor,
    factory: () => createBrandExecutor(),
    nodeType: 'brand',
    requiresResolver: true,
  },
  brandAsset: {
    description: 'Resolves brand logos, banners, and reference images',
    executorClass: BrandAssetExecutor,
    factory: () => createBrandAssetExecutor(),
    nodeType: 'brandAsset',
    requiresResolver: true,
  },
  brandContext: {
    description: 'Injects brand voice, colors, fonts, and default models',
    executorClass: BrandContextExecutor,
    factory: () => createBrandContextExecutor(),
    nodeType: 'brandContext',
    requiresResolver: true,
  },
  cinematicColorGrade: {
    description:
      'Applies cinematic color grading with camera profiles, 3-way color balance, and LUT support',
    executorClass: CinematicColorGradeExecutor,
    factory: () => createCinematicColorGradeExecutor(),
    nodeType: 'cinematicColorGrade',
    requiresResolver: true,
  },
  colorGrade: {
    description:
      'Applies Instagram-style color grading via FFmpeg or AI style transfer',
    executorClass: ColorGradeExecutor,
    factory: () => createColorGradeExecutor(),
    nodeType: 'colorGrade',
    requiresResolver: true,
  },
  commentTrigger: {
    description: 'Starts workflow when a social comment is detected',
    executorClass: CommentTriggerExecutor,
    factory: () => new CommentTriggerExecutor(),
    nodeType: 'commentTrigger',
    requiresResolver: true,
  },
  condition: {
    description:
      'Evaluates conditions and branches workflow into true/false paths',
    executorClass: ConditionExecutor,
    factory: () => new ConditionExecutor(),
    nodeType: 'condition',
    requiresResolver: false,
  },
  delay: {
    description:
      'Pauses workflow execution for configurable duration or until optimal time',
    executorClass: DelayExecutor,
    factory: () => new DelayExecutor(),
    nodeType: 'delay',
    requiresResolver: true,
  },
  engagementTrigger: {
    description:
      'Starts workflow when engagement metrics hit a configured threshold',
    executorClass: EngagementTriggerExecutor,
    factory: () => new EngagementTriggerExecutor(),
    nodeType: 'engagementTrigger',
    requiresResolver: true,
  },
  filmGrain: {
    description:
      'Simulates cinematic film grain (35mm, 16mm, 8mm, digital) via FFmpeg noise filters',
    executorClass: FilmGrainExecutor,
    factory: () => createFilmGrainExecutor(),
    nodeType: 'filmGrain',
    requiresResolver: true,
  },
  hookGenerator: {
    description:
      'Generates hook text, caption openings, hashtags, and slide prompts from trend and brand context',
    executorClass: HookGeneratorExecutor,
    factory: () => new HookGeneratorExecutor(),
    nodeType: 'hookGenerator',
    requiresResolver: false,
  },
  imageGen: {
    description:
      'Generates images using AI models (Replicate, fal.ai, or self-hosted Genfeed AI)',
    executorClass: ImageGenExecutor,
    factory: () => new ImageGenExecutor(),
    nodeType: 'imageGen',
    requiresResolver: true,
  },
  iterativeSeoRefine: {
    description:
      'Runs an internal SEO score -> rewrite -> re-score loop until the target score is reached (no graph cycle)',
    executorClass: IterativeSeoRefineExecutor,
    factory: () => createIterativeSeoRefineExecutor(),
    nodeType: 'iterativeSeoRefine',
    requiresResolver: true,
  },
  keywordTrigger: {
    description:
      'Starts workflow when a keyword or phrase is detected in social posts',
    executorClass: KeywordTriggerExecutor,
    factory: () => new KeywordTriggerExecutor(),
    nodeType: 'keywordTrigger',
    requiresResolver: true,
  },
  lensEffects: {
    description:
      'Applies cinematic lens effects: vignette, chromatic aberration, barrel distortion, and bloom',
    executorClass: LensEffectsExecutor,
    factory: () => createLensEffectsExecutor(),
    nodeType: 'lensEffects',
    requiresResolver: true,
  },
  lipSync: {
    description:
      'Generates lip-synced video from source image/video and audio input',
    executorClass: LipSyncExecutor,
    factory: () => new LipSyncExecutor(),
    nodeType: 'lipSync',
    requiresResolver: true,
  },
  mentionTrigger: {
    description: 'Starts workflow when the authenticated user is mentioned',
    executorClass: MentionTriggerExecutor,
    factory: () => new MentionTriggerExecutor(),
    nodeType: 'mentionTrigger',
    requiresResolver: true,
  },
  musicSource: {
    description:
      'Resolves music from trends, library, upload, or AI generation',
    executorClass: MusicSourceExecutor,
    factory: () => createMusicSourceExecutor(),
    nodeType: 'musicSource',
    requiresResolver: true,
  },
  newFollowerTrigger: {
    description:
      'Starts workflow when a new follower matching criteria is detected',
    executorClass: NewFollowerTriggerExecutor,
    factory: () => new NewFollowerTriggerExecutor(),
    nodeType: 'newFollowerTrigger',
    requiresResolver: true,
  },
  newLikeTrigger: {
    description:
      'Starts workflow when a new like is detected on monitored posts',
    executorClass: NewLikeTriggerExecutor,
    factory: () => new NewLikeTriggerExecutor(),
    nodeType: 'newLikeTrigger',
    requiresResolver: true,
  },
  newRepostTrigger: {
    description: 'Starts workflow when a new repost/retweet is detected',
    executorClass: NewRepostTriggerExecutor,
    factory: () => new NewRepostTriggerExecutor(),
    nodeType: 'newRepostTrigger',
    requiresResolver: true,
  },
  noop: {
    description: 'Passthrough executor that forwards input to output',
    executorClass: NoopExecutor,
    factory: () => new NoopExecutor(),
    nodeType: 'noop',
    requiresResolver: false,
  },
  patternContext: {
    description:
      'Retrieves proven creative patterns for a brand from performance data',
    executorClass: PatternContextExecutor,
    factory: () => createPatternContextExecutor(),
    nodeType: 'patternContext',
    requiresResolver: true,
  },
  postPublishTrigger: {
    description:
      'Starts an SEO-optimization workflow when content is published (post-published event)',
    executorClass: PostPublishTriggerExecutor,
    factory: () => new PostPublishTriggerExecutor(),
    nodeType: 'postPublishTrigger',
    requiresResolver: false,
  },
  postReply: {
    description: 'Replies to a social media post on the specified platform',
    executorClass: PostReplyExecutor,
    factory: () => new PostReplyExecutor(),
    nodeType: 'postReply',
    requiresResolver: true,
  },
  promptConstructor: {
    description:
      'Composes prompts from templates with {{variable}} substitution',
    executorClass: PromptConstructorExecutor,
    factory: () => new PromptConstructorExecutor(),
    nodeType: 'promptConstructor',
    requiresResolver: false,
  },
  publish: {
    description: 'Publishes content to social media platforms (multi-platform)',
    executorClass: PublishExecutor,
    factory: () => createPublishExecutor(),
    nodeType: 'publish',
    requiresResolver: true,
  },
  reframe: {
    description: 'Reframes image or video to a target aspect ratio using AI',
    executorClass: ReframeExecutor,
    factory: () => new ReframeExecutor(),
    nodeType: 'reframe',
    requiresResolver: true,
  },
  rssInput: {
    description: 'Fetches and parses RSS feeds from URL or XML',
    executorClass: RssInputExecutor,
    factory: () => createRssInputExecutor(),
    nodeType: 'rssInput',
    requiresResolver: true,
  },
  sendDm: {
    description: 'Sends a direct message on the specified platform',
    executorClass: SendDmExecutor,
    factory: () => new SendDmExecutor(),
    nodeType: 'sendDm',
    requiresResolver: true,
  },
  sendEmail: {
    description: 'Sends a single email via the notifications publisher',
    executorClass: SendEmailExecutor,
    factory: () => createSendEmailExecutor(),
    nodeType: 'sendEmail',
    requiresResolver: true,
  },
  seoRewrite: {
    description:
      'Rewrites content to address SEO suggestions from an upstream seoScore node',
    executorClass: SeoRewriteExecutor,
    factory: () => createSeoRewriteExecutor(),
    nodeType: 'seoRewrite',
    requiresResolver: true,
  },
  seoScore: {
    description:
      'Scores content against the canonical SEO rubric; emits score, breakdown, and suggestions',
    executorClass: SeoScoreExecutor,
    factory: () => createSeoScoreExecutor(),
    nodeType: 'seoScore',
    requiresResolver: true,
  },
  socialPublish: {
    description: 'Publishes video to a single social media platform',
    executorClass: SocialPublishExecutor,
    factory: () => createSocialPublishExecutor(),
    nodeType: 'socialPublish',
    requiresResolver: true,
  },
  soundOverlay: {
    description: 'Adds audio track to video via FFmpeg',
    executorClass: SoundOverlayExecutor,
    factory: () => createSoundOverlayExecutor(),
    nodeType: 'soundOverlay',
    requiresResolver: true,
  },
  textToSpeech: {
    description:
      'Converts text to speech audio using ElevenLabs or another TTS provider',
    executorClass: TextToSpeechExecutor,
    factory: () => new TextToSpeechExecutor(),
    nodeType: 'textToSpeech',
    requiresResolver: true,
  },
  trendDigest: {
    description:
      'Assembles a curated daily trends digest email from the global trend corpus',
    executorClass: TrendDigestExecutor,
    factory: () => new TrendDigestExecutor(),
    nodeType: 'trendDigest',
    requiresResolver: true,
  },
  trendTrigger: {
    description: 'Starts workflow when new trend matches criteria',
    executorClass: TrendTriggerExecutor,
    factory: () => createTrendTriggerExecutor(),
    nodeType: 'trendTrigger',
    requiresResolver: true,
  },
  tweetInput: {
    description: 'Fetches tweet content from URL or accepts text input',
    executorClass: TweetInputExecutor,
    factory: () => createTweetInputExecutor(),
    nodeType: 'tweetInput',
    requiresResolver: true,
  },
  tweetRemix: {
    description: 'Generates tweet variations with different tones using AI',
    executorClass: TweetRemixExecutor,
    factory: () => createTweetRemixExecutor(),
    nodeType: 'tweetRemix',
    requiresResolver: true,
  },
  upscale: {
    description: 'Upscales media resolution using AI (Real-ESRGAN, Topaz)',
    executorClass: UpscaleExecutor,
    factory: () => new UpscaleExecutor(),
    nodeType: 'upscale',
    requiresResolver: true,
  },
  videoInput: {
    description: 'Accepts multiple video URLs for beat-synced editing',
    executorClass: VideoInputExecutor,
    factory: () => createVideoInputExecutor(),
    nodeType: 'videoInput',
    requiresResolver: true,
  },
  voiceChange: {
    description: 'Changes the voice of an audio file using AI voice conversion',
    executorClass: VoiceChangeExecutor,
    factory: () => new VoiceChangeExecutor(),
    nodeType: 'voiceChange',
    requiresResolver: true,
  },
};

/**
 * Get an executor for a specific node type
 */
export function getExecutor(nodeType: string): INodeExecutor | undefined {
  const entry = EXECUTOR_REGISTRY[nodeType];
  return entry?.factory();
}

/**
 * Check if an executor exists for a node type
 */
export function hasExecutor(nodeType: string): boolean {
  return nodeType in EXECUTOR_REGISTRY;
}

/**
 * Get all registered node types
 */
export function getRegisteredNodeTypes(): string[] {
  return Object.keys(EXECUTOR_REGISTRY);
}

/**
 * Get executor metadata for a node type
 */
export function getExecutorMetadata(
  nodeType: string,
): Omit<ExecutorRegistryEntry, 'factory' | 'executorClass'> | undefined {
  const entry = EXECUTOR_REGISTRY[nodeType];
  if (!entry) {
    return undefined;
  }

  return {
    description: entry.description,
    nodeType: entry.nodeType,
    requiresResolver: entry.requiresResolver,
  };
}

/**
 * Create an executor registry instance for workflow execution
 *
 * This creates a mutable registry that can have resolvers injected
 * for executors that need them (brand, publish, etc.)
 */
export function createExecutorRegistry(): ExecutorRegistryInstance {
  return new ExecutorRegistryInstance();
}

export class ExecutorRegistryInstance {
  private executors: Map<string, INodeExecutor> = new Map();

  constructor() {
    for (const [nodeType, entry] of Object.entries(EXECUTOR_REGISTRY)) {
      this.executors.set(nodeType, entry.factory());
    }
  }

  get(nodeType: string): INodeExecutor | undefined {
    return this.executors.get(nodeType);
  }

  set(nodeType: string, executor: INodeExecutor): void {
    this.executors.set(nodeType, executor);
  }

  has(nodeType: string): boolean {
    return this.executors.has(nodeType);
  }

  /**
   * Register a custom executor for a node type
   */
  register(
    nodeType: string,
    executeFn: (
      input: Parameters<INodeExecutor['execute']>[0],
    ) => Promise<unknown>,
  ): void {
    this.executors.set(nodeType, createSimpleExecutor(nodeType, executeFn));
  }

  /**
   * Get the condition executor
   */
  getConditionExecutor(): ConditionExecutor | undefined {
    const executor = this.executors.get('condition');
    return executor instanceof ConditionExecutor ? executor : undefined;
  }

  /**
   * Get the delay executor for optimal time resolver injection
   */
  getDelayExecutor(): DelayExecutor | undefined {
    const executor = this.executors.get('delay');
    return executor instanceof DelayExecutor ? executor : undefined;
  }

  /**
   * Get the brand executor for resolver injection
   */
  getBrandExecutor(): BrandExecutor | undefined {
    const executor = this.executors.get('brand');
    return executor instanceof BrandExecutor ? executor : undefined;
  }

  /**
   * Get the brand context executor for resolver injection
   */
  getBrandContextExecutor(): BrandContextExecutor | undefined {
    const executor = this.executors.get('brandContext');
    return executor instanceof BrandContextExecutor ? executor : undefined;
  }

  /**
   * Get the brand asset executor for resolver injection
   */
  getBrandAssetExecutor(): BrandAssetExecutor | undefined {
    const executor = this.executors.get('brandAsset');
    return executor instanceof BrandAssetExecutor ? executor : undefined;
  }

  /**
   * Get the publish executor for resolver injection
   */
  getPublishExecutor(): PublishExecutor | undefined {
    const executor = this.executors.get('publish');
    return executor instanceof PublishExecutor ? executor : undefined;
  }

  /**
   * Get the tweet input executor for fetcher injection
   */
  getTweetInputExecutor(): TweetInputExecutor | undefined {
    const executor = this.executors.get('tweetInput');
    return executor instanceof TweetInputExecutor ? executor : undefined;
  }

  /**
   * Get the tweet remix executor for remixer injection
   */
  getTweetRemixExecutor(): TweetRemixExecutor | undefined {
    const executor = this.executors.get('tweetRemix');
    return executor instanceof TweetRemixExecutor ? executor : undefined;
  }

  /**
   * Get the RSS input executor for fetcher/parser injection
   */
  getRssInputExecutor(): RssInputExecutor | undefined {
    const executor = this.executors.get('rssInput');
    return executor instanceof RssInputExecutor ? executor : undefined;
  }

  /**
   * Get the social publish executor for publisher injection
   */
  getSocialPublishExecutor(): SocialPublishExecutor | undefined {
    const executor = this.executors.get('socialPublish');
    return executor instanceof SocialPublishExecutor ? executor : undefined;
  }

  /**
   * Get the trend trigger executor for checker injection
   */
  getTrendTriggerExecutor(): TrendTriggerExecutor | undefined {
    const executor = this.executors.get('trendTrigger');
    return executor instanceof TrendTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the trend digest executor for resolver/provider injection
   */
  getTrendDigestExecutor(): TrendDigestExecutor | undefined {
    const executor = this.executors.get('trendDigest');
    return executor instanceof TrendDigestExecutor ? executor : undefined;
  }

  /**
   * Get the sound overlay executor for processor injection
   */
  getSoundOverlayExecutor(): SoundOverlayExecutor | undefined {
    const executor = this.executors.get('soundOverlay');
    return executor instanceof SoundOverlayExecutor ? executor : undefined;
  }

  /**
   * Get the video input executor for validator injection
   */
  getVideoInputExecutor(): VideoInputExecutor | undefined {
    const executor = this.executors.get('videoInput');
    return executor instanceof VideoInputExecutor ? executor : undefined;
  }

  /**
   * Get the music source executor for resolver injection
   */
  getMusicSourceExecutor(): MusicSourceExecutor | undefined {
    const executor = this.executors.get('musicSource');
    return executor instanceof MusicSourceExecutor ? executor : undefined;
  }

  /**
   * Get the beat analysis executor for analyzer injection
   */
  getBeatAnalysisExecutor(): BeatAnalysisExecutor | undefined {
    const executor = this.executors.get('beatAnalysis');
    return executor instanceof BeatAnalysisExecutor ? executor : undefined;
  }

  /**
   * Get the beat sync editor executor for editor injection
   */
  getBeatSyncEditorExecutor(): BeatSyncEditorExecutor | undefined {
    const executor = this.executors.get('beatSyncEditor');
    return executor instanceof BeatSyncEditorExecutor ? executor : undefined;
  }

  /**
   * Get the cinematic color grade executor for processor injection
   */
  getCinematicColorGradeExecutor(): CinematicColorGradeExecutor | undefined {
    const executor = this.executors.get('cinematicColorGrade');
    return executor instanceof CinematicColorGradeExecutor
      ? executor
      : undefined;
  }

  /**
   * Get the color grade executor for processor injection
   */
  getColorGradeExecutor(): ColorGradeExecutor | undefined {
    const executor = this.executors.get('colorGrade');
    return executor instanceof ColorGradeExecutor ? executor : undefined;
  }

  /**
   * Get the film grain executor for processor injection
   */
  getFilmGrainExecutor(): FilmGrainExecutor | undefined {
    const executor = this.executors.get('filmGrain');
    return executor instanceof FilmGrainExecutor ? executor : undefined;
  }

  /**
   * Get the lens effects executor for processor injection
   */
  getLensEffectsExecutor(): LensEffectsExecutor | undefined {
    const executor = this.executors.get('lensEffects');
    return executor instanceof LensEffectsExecutor ? executor : undefined;
  }

  /**
   * Get the pattern context executor for resolver injection
   */
  getPatternContextExecutor(): PatternContextExecutor | undefined {
    const executor = this.executors.get('patternContext');
    return executor instanceof PatternContextExecutor ? executor : undefined;
  }

  /**
   * Get the post reply executor for publisher injection
   */
  getPostReplyExecutor(): PostReplyExecutor | undefined {
    const executor = this.executors.get('postReply');
    return executor instanceof PostReplyExecutor ? executor : undefined;
  }

  /**
   * Get the send DM executor for sender injection
   */
  getSendDmExecutor(): SendDmExecutor | undefined {
    const executor = this.executors.get('sendDm');
    return executor instanceof SendDmExecutor ? executor : undefined;
  }

  /**
   * Get the send email executor for sender injection
   */
  getSendEmailExecutor(): SendEmailExecutor | undefined {
    const executor = this.executors.get('sendEmail');
    return executor instanceof SendEmailExecutor ? executor : undefined;
  }

  /**
   * Get the new follower trigger executor for checker injection
   */
  getNewFollowerTriggerExecutor(): NewFollowerTriggerExecutor | undefined {
    const executor = this.executors.get('newFollowerTrigger');
    return executor instanceof NewFollowerTriggerExecutor
      ? executor
      : undefined;
  }

  /**
   * Get the mention trigger executor for checker injection
   */
  getMentionTriggerExecutor(): MentionTriggerExecutor | undefined {
    const executor = this.executors.get('mentionTrigger');
    return executor instanceof MentionTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the new like trigger executor for checker injection
   */
  getNewLikeTriggerExecutor(): NewLikeTriggerExecutor | undefined {
    const executor = this.executors.get('newLikeTrigger');
    return executor instanceof NewLikeTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the new repost trigger executor for checker injection
   */
  getNewRepostTriggerExecutor(): NewRepostTriggerExecutor | undefined {
    const executor = this.executors.get('newRepostTrigger');
    return executor instanceof NewRepostTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the image gen executor for resolver injection
   */
  getImageGenExecutor(): ImageGenExecutor | undefined {
    const executor = this.executors.get('imageGen');
    return executor instanceof ImageGenExecutor ? executor : undefined;
  }

  /**
   * Get the voice change executor for resolver injection
   */
  getVoiceChangeExecutor(): VoiceChangeExecutor | undefined {
    const executor = this.executors.get('voiceChange');
    return executor instanceof VoiceChangeExecutor ? executor : undefined;
  }

  /**
   * Get the keyword trigger executor for checker injection
   */
  getKeywordTriggerExecutor(): KeywordTriggerExecutor | undefined {
    const executor = this.executors.get('keywordTrigger');
    return executor instanceof KeywordTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the engagement trigger executor for checker injection
   */
  getEngagementTriggerExecutor(): EngagementTriggerExecutor | undefined {
    const executor = this.executors.get('engagementTrigger');
    return executor instanceof EngagementTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the comment trigger executor for checker injection
   */
  getCommentTriggerExecutor(): CommentTriggerExecutor | undefined {
    const executor = this.executors.get('commentTrigger');
    return executor instanceof CommentTriggerExecutor ? executor : undefined;
  }

  /**
   * Get the reframe executor for resolver injection
   */
  getReframeExecutor(): ReframeExecutor | undefined {
    const executor = this.executors.get('reframe');
    return executor instanceof ReframeExecutor ? executor : undefined;
  }

  /**
   * Get the upscale executor for resolver injection
   */
  getUpscaleExecutor(): UpscaleExecutor | undefined {
    const executor = this.executors.get('upscale');
    return executor instanceof UpscaleExecutor ? executor : undefined;
  }

  /**
   * Get the lip sync executor for resolver injection
   */
  getLipSyncExecutor(): LipSyncExecutor | undefined {
    const executor = this.executors.get('lipSync');
    return executor instanceof LipSyncExecutor ? executor : undefined;
  }

  /**
   * Get the text to speech executor for resolver injection
   */
  getTextToSpeechExecutor(): TextToSpeechExecutor | undefined {
    const executor = this.executors.get('textToSpeech');
    return executor instanceof TextToSpeechExecutor ? executor : undefined;
  }
}
