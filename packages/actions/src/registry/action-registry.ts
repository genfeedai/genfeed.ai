import type {
  ActionCreditPolicy,
  CreateGenfeedActionNodeInput,
  GenfeedActionDefinition,
  GenfeedActionNodeDefinition,
} from '../interfaces/action-definition.interface.js';
import type {
  CanonicalToolDefinition,
  ToolParameterSchema,
} from '../interfaces/tool-definition.interface.js';
import { ALL_TOOLS } from './tool-registry.js';

const OBJECT_SCHEMA: ToolParameterSchema = {
  properties: {},
  type: 'object',
};
const ANY_SCHEMA = {};

function internalAction(
  id: string,
  label: string,
  description: string,
  options: Partial<
    Pick<
      GenfeedActionDefinition,
      'authorization' | 'credits' | 'idempotency' | 'visibility'
    >
  > = {},
): GenfeedActionDefinition {
  return {
    approval: 'none',
    authorization: options.authorization ?? 'system',
    credits: options.credits ?? { amount: 0, mode: 'fixed' },
    description,
    id,
    idempotency: options.idempotency ?? 'run-node',
    inputSchema: OBJECT_SCHEMA,
    label,
    outputSchema: ANY_SCHEMA,
    visibility: options.visibility ?? 'internal',
  };
}

function toolAction(tool: CanonicalToolDefinition): GenfeedActionDefinition {
  return {
    approval: tool.requiresConfirmation ? 'required' : 'none',
    authorization: tool.requiredRole,
    credits: { amount: tool.creditCost, mode: 'fixed' },
    description: tool.description,
    id: tool.name,
    idempotency: 'run-node',
    inputSchema: tool.parameters,
    label: tool.name
      .split('_')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' '),
    outputSchema: ANY_SCHEMA,
    visibility: 'tool',
  };
}

const WORKFLOW_ACTIONS = [
  ['adOptimization', 'Optimize Ads', 'Runs one ad-optimization operation.'],
  ['adSyncGoogle', 'Sync Google Ads', 'Synchronizes Google Ads data.'],
  ['adSyncMeta', 'Sync Meta Ads', 'Synchronizes Meta Ads data.'],
  ['adSyncTikTok', 'Sync TikTok Ads', 'Synchronizes TikTok Ads data.'],
  [
    'agentCampaignOrchestration',
    'Orchestrate Agent Campaign',
    'Runs one agent campaign orchestration operation.',
  ],
  [
    'agentCampaignTriggerEvaluation',
    'Evaluate Agent Campaign Trigger',
    'Evaluates one agent campaign trigger.',
  ],
  ['ai-enhance', 'Enhance Media', 'Enhances media quality with AI.'],
  ['ai-transcribe', 'Transcribe Media', 'Transcribes workflow audio or video.'],
  ['aiAvatarVideo', 'Generate Avatar Video', 'Generates one avatar video.'],
  [
    'aiInfluencerDailyPosts',
    'Generate AI Influencer Posts',
    'Generates one bounded AI influencer daily-post batch.',
  ],
  [
    'analyticsFacebookSync',
    'Sync Facebook Analytics',
    'Synchronizes Facebook analytics.',
  ],
  [
    'analyticsFeedback',
    'Read Analytics Feedback',
    'Reads performance analytics for workflow context.',
  ],
  [
    'analyticsGenericSync',
    'Sync Generic Analytics',
    'Synchronizes generic platform analytics.',
  ],
  [
    'analyticsSocialSync',
    'Sync Social Analytics',
    'Synchronizes social analytics.',
  ],
  [
    'analyticsThreadsSync',
    'Sync Threads Analytics',
    'Synchronizes Threads analytics.',
  ],
  ['analyticsTwitterSync', 'Sync X Analytics', 'Synchronizes X analytics.'],
  [
    'attachPostIngredient',
    'Attach Post Ingredient',
    'Attaches a generated ingredient to a post draft.',
  ],
  ['brand', 'Read Brand', 'Reads one tenant brand for workflow context.'],
  ['brandAsset', 'Read Brand Asset', 'Reads one tenant brand asset.'],
  ['brandContext', 'Assemble Brand Context', 'Assembles tenant brand context.'],
  ['castPrompt', 'Generate Cast Prompt', 'Generates one cast-aware prompt.'],
  [
    'cinematicColorGrade',
    'Apply Cinematic Color Grade',
    'Applies cinematic color grading to media.',
  ],
  ['colorGrade', 'Apply Color Grade', 'Applies color grading to media.'],
  [
    'contentEngineProduction',
    'Produce Content Engine Output',
    'Runs one content-engine production operation.',
  ],
  [
    'contentPipelineAutopilot',
    'Run Content Pipeline Autopilot',
    'Runs one content-pipeline autopilot operation.',
  ],
  ['effect-captions', 'Add Captions', 'Burns captions into one video.'],
  [
    'engagement-rule-evaluation',
    'Evaluate Engagement Rule',
    'Evaluates and applies one tenant engagement rule.',
  ],
  [
    'effect-ken-burns',
    'Apply Ken Burns Effect',
    'Applies a zoom and pan effect.',
  ],
  [
    'effect-portrait-blur',
    'Apply Portrait Blur',
    'Creates a portrait-blur composition.',
  ],
  [
    'effect-split-screen',
    'Create Split Screen',
    'Creates a split-screen composition.',
  ],
  ['effect-text-overlay', 'Add Text Overlay', 'Adds a text overlay to media.'],
  ['effect-watermark', 'Add Watermark', 'Adds a watermark to media.'],
  ['filmGrain', 'Apply Film Grain', 'Applies film grain to media.'],
  [
    'harnessWinnerPromotionSweep',
    'Promote Harness Winners',
    'Promotes bounded content-performance winners.',
  ],
  ['hookGenerator', 'Generate Hook', 'Generates one content hook.'],
  ['imageGen', 'Generate Image', 'Generates one image from workflow inputs.'],
  ['input-template', 'Load Prompt Template', 'Loads one prompt template.'],
  [
    'iterativeSeoRefine',
    'Refine SEO Iteratively',
    'Runs bounded SEO refinement.',
  ],
  ['lensEffects', 'Apply Lens Effects', 'Applies selected lens effects.'],
  ['lipSync', 'Generate Lip Sync', 'Generates one lip-synced media output.'],
  [
    'livestreamBotSessionProcessing',
    'Process Livestream Bot Session',
    'Processes one livestream bot session.',
  ],
  ['llm', 'Generate Text', 'Runs one language-model text generation.'],
  [
    'musicSource',
    'Resolve Music Source',
    'Resolves one workflow music source.',
  ],
  [
    'newsletterGen',
    'Generate Newsletter Draft',
    'Generates one newsletter draft.',
  ],
  [
    'outreachCampaignDispatch',
    'Dispatch Outreach Campaign',
    'Dispatches one bounded outreach campaign operation.',
  ],
  [
    'output-export',
    'Export Workflow Output',
    'Exports a workflow output file.',
  ],
  [
    'output-notify',
    'Notify Workflow Output',
    'Sends a workflow completion notification.',
  ],
  [
    'output-save',
    'Save Workflow Output',
    'Saves workflow output to the asset library.',
  ],
  [
    'output-webhook',
    'Send Workflow Webhook',
    'Sends workflow output to a webhook.',
  ],
  [
    'paidCreativeResearchIngestion',
    'Ingest Paid Creative Research',
    'Ingests one paid-creative research batch.',
  ],
  [
    'postGen',
    'Generate Post Draft',
    'Generates and persists one social post draft.',
  ],
  [
    'promptConstructor',
    'Construct Prompt',
    'Constructs one prompt from workflow inputs.',
  ],
  ['postReply', 'Post Social Reply', 'Posts one social reply.'],
  [
    'proactiveAgentStrategies',
    'Run Proactive Agent Strategies',
    'Runs one proactive agent strategy operation.',
  ],
  ['process-compress', 'Compress Video', 'Compresses one video.'],
  ['process-extract-audio', 'Extract Audio', 'Extracts audio from one video.'],
  ['process-merge-videos', 'Merge Videos', 'Merges workflow videos.'],
  ['process-mirror', 'Mirror Video', 'Mirrors one video.'],
  ['process-resize', 'Resize Media', 'Resizes workflow media.'],
  ['process-reverse', 'Reverse Video', 'Reverses one video.'],
  ['process-transform', 'Transform Media', 'Transforms workflow media.'],
  ['process-trim', 'Trim Video', 'Trims one video.'],
  [
    'publish',
    'Publish Social Content',
    'Publishes workflow content to social targets.',
  ],
  ['reframe', 'Reframe Media', 'Reframes workflow media.'],
  [
    'replyBotPolling',
    'Poll Reply Bot',
    'Runs one reply-bot polling operation.',
  ],
  [
    'reportDelivery',
    'Deliver Workflow Report',
    'Delivers one workflow report.',
  ],
  [
    'restreamChatIngest',
    'Ingest Restream Chat',
    'Ingests one Restream chat batch.',
  ],
  [
    'rss-source-poll',
    'Poll RSS Source',
    'Polls one tenant RSS source and applies its configured workflow behavior.',
  ],
  ['sendDm', 'Send Direct Message', 'Sends one social direct message.'],
  ['sendEmail', 'Send Email', 'Sends one email.'],
  ['seoRewrite', 'Rewrite for SEO', 'Rewrites content using SEO guidance.'],
  ['seoScore', 'Score SEO', 'Scores content for SEO.'],
  [
    'socialRead',
    'Read Social Content',
    'Reads social content for workflow context.',
  ],
  [
    'socialTriggerPolling',
    'Poll Social Triggers',
    'Polls social trigger state.',
  ],
  ['soundOverlay', 'Overlay Sound', 'Overlays sound on one video.'],
  [
    'sourceCorpus',
    'Build Source Corpus',
    'Collects recent tenant source posts.',
  ],
  [
    'talkingHeadScript',
    'Generate Talking-head Script',
    'Generates a duration-bounded talking-head script.',
  ],
  ['textToSpeech', 'Generate Text to Speech', 'Converts text to speech.'],
  ['trendDigest', 'Build Trend Digest', 'Builds one trends digest.'],
  [
    'trendHashtagInspiration',
    'Find Hashtag Inspiration',
    'Finds trend hashtag inspiration.',
  ],
  [
    'trendSoundInspiration',
    'Find Sound Inspiration',
    'Finds trend sound inspiration.',
  ],
  [
    'trendSummaryNotifications',
    'Send Trend Notifications',
    'Sends trend-summary notifications.',
  ],
  [
    'trendTrigger',
    'Resolve Matching Trend',
    'Resolves one matching trend for workflow execution.',
  ],
  [
    'trendVideoInspiration',
    'Find Video Inspiration',
    'Finds trend video inspiration.',
  ],
  ['upscale', 'Upscale Media', 'Upscales one media asset.'],
  [
    'videoFrameExtract',
    'Extract Video Frames',
    'Extracts selected frames from one video.',
  ],
  ['videoGen', 'Generate Video', 'Generates one video from workflow inputs.'],
  ['videoQa', 'Validate Video Quality', 'Validates one generated video.'],
  ['videoStitch', 'Stitch Videos', 'Stitches workflow video segments.'],
  ['voiceChange', 'Change Voice', 'Changes the voice in one audio asset.'],
  [
    'youtubeAnalyticsSync',
    'Sync YouTube Analytics',
    'Synchronizes YouTube analytics.',
  ],
] as const;

const WORKFLOW_ACTION_CREDIT_POLICIES: Readonly<
  Record<string, ActionCreditPolicy>
> = {
  cinematicColorGrade: { amount: 2, mode: 'fixed' },
  colorGrade: { amount: 1, mode: 'fixed' },
  'effect-captions': { amount: 1, mode: 'fixed' },
  filmGrain: { amount: 1, mode: 'fixed' },
  hookGenerator: { amount: 1, mode: 'fixed' },
  imageGen: { amount: 5, mode: 'fixed' },
  iterativeSeoRefine: { amount: 15, mode: 'fixed' },
  lensEffects: { amount: 1, mode: 'fixed' },
  lipSync: { amount: 8, mode: 'fixed' },
  postReply: { amount: 1, mode: 'fixed' },
  'process-resize': { amount: 1, mode: 'fixed' },
  'process-transform': { amount: 1, mode: 'fixed' },
  reframe: { amount: 3, mode: 'fixed' },
  seoRewrite: { amount: 3, mode: 'fixed' },
  seoScore: { amount: 2, mode: 'fixed' },
  socialRead: { amount: 1, mode: 'fixed' },
  soundOverlay: { amount: 1, mode: 'fixed' },
  talkingHeadScript: { amount: 3, mode: 'fixed' },
  textToSpeech: { amount: 3, mode: 'fixed' },
  trendHashtagInspiration: { amount: 1, mode: 'fixed' },
  trendSoundInspiration: { amount: 1, mode: 'fixed' },
  trendVideoInspiration: { amount: 1, mode: 'fixed' },
  upscale: { amount: 2, mode: 'fixed' },
  videoFrameExtract: { amount: 2, mode: 'fixed' },
  videoGen: { amount: 10, mode: 'fixed' },
  videoQa: { amount: 1, mode: 'fixed' },
  videoStitch: { amount: 1, mode: 'fixed' },
  voiceChange: { amount: 5, mode: 'fixed' },
};

const WORKFLOW_ACTION_DEFINITIONS = WORKFLOW_ACTIONS.map(
  ([id, label, description]) =>
    internalAction(id, label, description, {
      credits: WORKFLOW_ACTION_CREDIT_POLICIES[id] ?? {
        amount: 0,
        mode: 'fixed',
      },
      visibility: 'workflow',
    }),
);

const INTERNAL_ACTIONS: readonly GenfeedActionDefinition[] = [
  ...WORKFLOW_ACTION_DEFINITIONS,
  internalAction(
    'ads.credentials.discover',
    'Discover Ads Credentials',
    'Discovers bounded connected ad credentials for one provider workflow.',
  ),
  internalAction(
    'ads.google.performance.fetch',
    'Fetch Google Ads Performance',
    'Fetches scoped Google Ads performance records.',
  ),
  internalAction(
    'ads.google.performance.normalize',
    'Normalize Google Ads Performance',
    'Normalizes Google Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.meta.performance.fetch',
    'Fetch Meta Ads Performance',
    'Fetches scoped Meta Ads performance records.',
  ),
  internalAction(
    'ads.meta.performance.normalize',
    'Normalize Meta Ads Performance',
    'Normalizes Meta Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.tiktok.performance.fetch',
    'Fetch TikTok Ads Performance',
    'Fetches scoped TikTok Ads performance records.',
  ),
  internalAction(
    'ads.tiktok.performance.normalize',
    'Normalize TikTok Ads Performance',
    'Normalizes TikTok Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.performance.persist',
    'Persist Ads Performance',
    'Persists normalized tenant-scoped ad performance records.',
  ),
  internalAction(
    'ads.optimization.load-config',
    'Load Ads Optimization Config',
    'Loads the scoped policy for one ads optimization workflow.',
  ),
  internalAction(
    'ads.optimization.analyze',
    'Analyze Ads Optimization',
    'Analyzes normalized ad performance against its optimization policy.',
  ),
  internalAction(
    'ads.optimization.persist-recommendations',
    'Persist Ads Recommendations',
    'Persists recommendations produced by one ads optimization workflow.',
  ),
  internalAction(
    'ads.optimization.finalize',
    'Finalize Ads Optimization',
    'Finalizes one ads optimization workflow and audit record.',
  ),
  internalAction(
    'ads.bulk-upload.claim',
    'Claim Ad Bulk Upload',
    'Claims one ad bulk-upload job for workflow execution.',
  ),
  internalAction(
    'ads.bulk-upload.build-media-items',
    'Build Ad Media Items',
    'Builds bounded media upload items for one ad bulk-upload job.',
  ),
  internalAction(
    'ads.bulk-upload.upload-media',
    'Upload Ad Media',
    'Uploads one ad media item through its scoped provider account.',
  ),
  internalAction(
    'ads.bulk-upload.build-permutations',
    'Build Ad Permutations',
    'Builds bounded creative permutations from uploaded ad media.',
  ),
  internalAction(
    'ads.bulk-upload.create-ad',
    'Create Bulk Ad',
    'Creates one ad from a validated bulk-upload permutation.',
  ),
  internalAction(
    'ads.bulk-upload.finalize',
    'Finalize Ad Bulk Upload',
    'Finalizes one completed ad bulk-upload workflow.',
  ),
  internalAction(
    'ads.bulk-upload.fail',
    'Fail Ad Bulk Upload',
    'Projects a terminal workflow failure onto one ad bulk-upload job.',
  ),
  internalAction(
    'analytics.posts.discover',
    'Discover Analytics Posts',
    'Discovers bounded tenant posts requiring analytics collection.',
  ),
  internalAction(
    'analytics.facebook.collect',
    'Collect Facebook Analytics',
    'Collects and persists analytics for one Facebook post.',
  ),
  internalAction(
    'analytics.social.collect',
    'Collect Social Analytics',
    'Collects and persists analytics for one supported social post.',
  ),
  internalAction(
    'analytics.threads.collect',
    'Collect Threads Analytics',
    'Collects and persists analytics for one Threads post.',
  ),
  internalAction(
    'analytics.twitter.collect',
    'Collect X Analytics',
    'Collects and persists analytics for one X post.',
  ),
  internalAction(
    'analytics.youtube.collect',
    'Collect YouTube Analytics',
    'Collects and persists analytics for one YouTube post.',
  ),
  internalAction(
    'analytics.collection.finalize',
    'Finalize Analytics Collection',
    'Finalizes one bounded provider analytics collection workflow.',
  ),
  internalAction(
    'analytics.generic.resolve-window',
    'Resolve Analytics Window',
    'Resolves and validates one generic analytics collection window.',
  ),
  internalAction(
    'analytics.generic.discover',
    'Discover Generic Analytics Items',
    'Discovers bounded generic analytics items for child workflows.',
  ),
  internalAction(
    'analytics.generic.persist',
    'Persist Generic Analytics',
    'Persists analytics for one discovered generic item.',
  ),
  internalAction(
    'analytics.generic.sync-memory',
    'Sync Analytics Memory',
    'Synchronizes durable brand memory from collected analytics.',
  ),
  internalAction(
    'analytics.generic.detect-alerts',
    'Detect Analytics Alerts',
    'Detects and records alerts from collected analytics.',
  ),
  internalAction(
    'content.pipeline.generate-image',
    'Generate Pipeline Image',
    'Generates and persists one image for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-music',
    'Generate Pipeline Music',
    'Generates and persists one music asset for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-speech',
    'Generate Pipeline Speech',
    'Generates and persists one speech asset for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-video',
    'Generate Pipeline Video',
    'Generates and persists one video for a content workflow.',
  ),
  internalAction(
    'content.pipeline.publish',
    'Publish Content Pipeline Output',
    'Publishes the selected generated assets for one persona.',
  ),
  internalAction(
    'content.pipeline.resolve-context',
    'Resolve Content Pipeline Context',
    'Resolves one persona and its immutable brand references.',
  ),
  internalAction(
    'article.review',
    'Review Article',
    'Reviews one tenant article with the configured rubric.',
    { authorization: 'user' },
  ),
  internalAction(
    'brand-remix-paused-meta-draft',
    'Brand Remix Paused Meta Draft',
    'Creates reviewed, paused-only Meta ad drafts.',
  ),
  internalAction(
    'brand-remix-paused-x-ads-draft',
    'Brand Remix Paused X Ads Draft',
    'Creates reviewed, paused-only X Ads drafts.',
  ),
  internalAction(
    'brand-remix-review-handoff',
    'Brand Remix Review Handoff',
    'Creates canonical draft posts and routes them to Review.',
  ),
  internalAction(
    'campaign.reply.discover-targets',
    'Discover Campaign Reply Targets',
    'Discovers the bounded pending targets for one reply campaign run.',
  ),
  internalAction(
    'campaign.reply.claim',
    'Claim Campaign Reply Target',
    'Claims one campaign reply target for workflow execution.',
  ),
  internalAction(
    'campaign.reply.load-context',
    'Load Campaign Reply Context',
    'Loads the scoped context required to generate one campaign reply.',
  ),
  internalAction(
    'campaign.reply.generate',
    'Generate Campaign Reply',
    'Generates one campaign reply from the claimed target context.',
  ),
  internalAction(
    'campaign.reply.reserve',
    'Reserve Campaign Reply Slot',
    'Reserves rate-limit capacity for one campaign reply.',
  ),
  internalAction(
    'campaign.reply.send',
    'Send Campaign Reply',
    'Sends one reserved campaign reply through its connected account.',
  ),
  internalAction(
    'campaign.reply.finalize',
    'Finalize Campaign Reply',
    'Finalizes one campaign reply target and its campaign counters.',
  ),
  internalAction(
    'campaign.dm.discover-targets',
    'Discover Campaign DM Targets',
    'Discovers the bounded pending targets for one direct-message campaign run.',
  ),
  internalAction(
    'campaign.dm.claim',
    'Claim Campaign DM Target',
    'Claims one campaign direct-message target for workflow execution.',
  ),
  internalAction(
    'campaign.dm.resolve-context',
    'Resolve Campaign DM Context',
    'Resolves the scoped account and recipient context for one campaign direct message.',
  ),
  internalAction(
    'campaign.dm.generate',
    'Generate Campaign DM',
    'Generates one campaign direct message from the claimed target context.',
  ),
  internalAction(
    'campaign.dm.reserve',
    'Reserve Campaign DM Slot',
    'Reserves rate-limit capacity for one campaign direct message.',
  ),
  internalAction(
    'campaign.dm.send',
    'Send Campaign DM',
    'Sends one reserved campaign direct message through its connected account.',
  ),
  internalAction(
    'campaign.dm.finalize',
    'Finalize Campaign DM',
    'Finalizes one campaign direct-message target and its campaign counters.',
  ),
  internalAction(
    'campaign.dispatch.discover',
    'Discover Active Campaigns',
    'Discovers the bounded active campaigns for one tenant dispatch run.',
  ),
  internalAction(
    'campaign.dispatch.finalize',
    'Finalize Campaign Dispatch',
    'Finalizes one tenant campaign dispatch after all child workflows settle.',
  ),
  internalAction(
    'campaign.reply.preview.validate',
    'Validate Campaign Reply Preview',
    'Validates one campaign reply preview request and its tenant context.',
  ),
  internalAction(
    'campaign.reply.preview.generate',
    'Generate Campaign Reply Preview',
    'Generates one campaign reply preview from validated context.',
  ),
  internalAction(
    'clip.analysis.detect-highlights',
    'Detect Clip Highlights',
    'Detects and scores clip highlights in one transcript.',
  ),
  internalAction(
    'clip.analysis.extract-reference-frames',
    'Extract Clip Reference Frames',
    'Extracts bounded reference frames for clip highlights.',
  ),
  internalAction(
    'clip.analysis.fail',
    'Fail Clip Analysis',
    'Persists one failed clip analysis.',
  ),
  internalAction(
    'clip.generation.generate-one',
    'Generate One Clip',
    'Creates and dispatches exactly one clip result.',
  ),
  internalAction(
    'clip.generation.plan',
    'Plan Clip Generation',
    'Validates detected highlights and plans immutable child clip-generation inputs.',
  ),
  internalAction(
    'clip.factory.fail',
    'Fail Clip Factory',
    'Projects a terminal clip-factory workflow failure onto its source project.',
  ),
  internalAction(
    'clip.generation.finalize-child',
    'Finalize Clip Factory Child',
    'Reconciles project progress after one clip-generation child succeeds or fails.',
  ),
  internalAction(
    'clip.handoff.create-editor',
    'Create Clip Editor Handoff',
    'Creates one editor project from a ready clip.',
  ),
  internalAction(
    'clip.handoff.link-library',
    'Link Clip to Library',
    'Links one completed clip to its canonical Library asset.',
  ),
  internalAction(
    'clip.handoff.prepare-publish',
    'Prepare Clip Publish Handoff',
    'Builds one user-confirmed publish handoff for a ready clip.',
  ),
  internalAction(
    'clip.continuity.begin',
    'Begin Clip Continuity QA',
    'Claims one queued clip project continuity run.',
  ),
  internalAction(
    'clip.continuity.fail',
    'Fail Clip Continuity QA',
    'Projects a failed queued continuity workflow onto its clip project.',
  ),
  internalAction(
    'clip.continuity.persist-report',
    'Persist Clip Continuity Report',
    'Persists one aggregate continuity report and its workflow provenance.',
  ),
  internalAction(
    'clip.analysis.persist',
    'Persist Clip Analysis',
    'Persists one completed clip analysis.',
  ),
  internalAction(
    'clip.analysis.prepare-source',
    'Prepare Clip Analysis Source',
    'Prepares one clip-analysis source for transcription.',
  ),
  internalAction(
    'clip.analysis.transcribe',
    'Transcribe Clip Analysis Source',
    'Transcribes one prepared clip-analysis source.',
  ),
  internalAction(
    'content.batch.plan',
    'Plan Content Batch',
    'Builds the bounded child inputs for one content batch.',
  ),
  internalAction(
    'content.batch.item.generate',
    'Generate Content Batch Item',
    'Generates and persists one item in a content batch.',
  ),
  internalAction(
    'content.batch.rank',
    'Rank Content Batch',
    'Ranks the completed items in one content batch.',
  ),
  internalAction(
    'content.optimization.summary.load',
    'Load Optimization Summary',
    'Loads the tenant-scoped summary for one optimization run.',
  ),
  internalAction(
    'content.optimization.cycle.run',
    'Run Optimization Cycle',
    'Runs one bounded content optimization cycle.',
  ),
  internalAction(
    'content.optimization.analysis.derive',
    'Derive Optimization Analysis',
    'Derives optimization analysis from scoped performance data.',
  ),
  internalAction(
    'content.optimization.prompt.load-context',
    'Load Optimization Prompt Context',
    'Loads the scoped content context required for prompt optimization.',
  ),
  internalAction(
    'content.optimization.prompt.optimize',
    'Optimize Content Prompt',
    'Produces one optimized content prompt from approved context.',
  ),
  internalAction(
    'content.optimization.recommendations.derive',
    'Derive Optimization Recommendations',
    'Derives recommendations from one content optimization analysis.',
  ),
  internalAction(
    'content.optimization.suggestions.generate',
    'Generate Optimization Suggestions',
    'Generates bounded suggestions for one content optimization run.',
  ),
  internalAction(
    'content.optimization.suggestion.apply',
    'Apply Optimization Suggestion',
    'Applies one approved content optimization suggestion.',
  ),
  internalAction(
    'content.optimization.winner.requeue',
    'Requeue Optimization Winner',
    'Requeues the winning content variant for its next workflow.',
  ),
  internalAction(
    'content.optimization.ab-test.execution.plan',
    'Plan Optimization A/B Test',
    'Plans the bounded arms for one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.arm.create',
    'Create Optimization A/B Arm',
    'Creates one arm for an optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.execution.finalize',
    'Finalize Optimization A/B Test',
    'Finalizes the creation of one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.resolution.plan',
    'Plan A/B Test Resolution',
    'Plans outcome collection for one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.outcome.persist',
    'Persist A/B Test Outcome',
    'Persists one outcome for an optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.resolution.finalize',
    'Finalize A/B Test Resolution',
    'Finalizes the resolved outcome of one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.validated.load',
    'Load Validated A/B Test',
    'Loads one validated optimization A/B test for resolution.',
  ),
  internalAction(
    'patterns.extraction.load',
    'Load Pattern Extraction Context',
    'Loads one organization-scoped pattern extraction context.',
  ),
  internalAction(
    'patterns.extraction.scan-ads',
    'Scan Ad Patterns',
    'Scans tenant-scoped ads for anonymous pattern signals.',
  ),
  internalAction(
    'patterns.extraction.scan-content',
    'Scan Content Patterns',
    'Scans tenant-scoped content for anonymous pattern signals.',
  ),
  internalAction(
    'patterns.extraction.build',
    'Build Pattern Candidates',
    'Builds anonymous pattern candidates from one tenant scan.',
  ),
  internalAction(
    'patterns.extraction.persist-candidate',
    'Persist Pattern Candidate',
    'Persists one anonymous candidate and promotes cross-tenant patterns at the privacy threshold.',
  ),
  internalAction(
    'patterns.extraction.save-checkpoints',
    'Save Pattern Extraction Checkpoints',
    'Saves tenant-scoped checkpoints after pattern extraction.',
  ),
  internalAction(
    'content-intelligence.generate',
    'Generate Content Intelligence Variants',
    'Generates platform-aware content variants from tenant context.',
    { authorization: 'user' },
  ),
  internalAction(
    'evergreen-release-expansion',
    'Evergreen Release Expansion',
    'Materializes the next bounded evergreen release.',
  ),
  internalAction(
    'long-form.persist-output',
    'Persist Long-form Output',
    'Persists exactly one selected long-form output.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'long-form.transform-text',
    'Transform Long-form Text',
    'Transforms a transcript into one validated long-form document.',
    {
      authorization: 'public',
      credits: { mode: 'dynamic' },
      visibility: 'public',
    },
  ),
  internalAction(
    'newsletter.generate-draft',
    'Generate Newsletter Draft',
    'Generates and persists one tenant newsletter draft.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'newsletter.generate-topics',
    'Generate Newsletter Topics',
    'Generates tenant-scoped newsletter topic proposals.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'reply-bot.organization.discover-bots',
    'Discover Organization Reply Bots',
    'Discovers enabled reply bots for one organization workflow.',
  ),
  internalAction(
    'reply-bot.organization.finalize',
    'Finalize Organization Reply Bots',
    'Finalizes one organization-level reply-bot workflow.',
  ),
  internalAction(
    'reply-bot.bot.fetch-candidates',
    'Fetch Reply Bot Candidates',
    'Fetches bounded candidate content for one reply bot.',
  ),
  internalAction(
    'reply-bot.bot.finalize',
    'Finalize Reply Bot',
    'Finalizes one bot-level candidate processing workflow.',
  ),
  internalAction(
    'reply-bot.content.claim',
    'Claim Reply Bot Content',
    'Claims one candidate content item for reply-bot processing.',
  ),
  internalAction(
    'reply-bot.content.generate-reply',
    'Generate Reply Bot Reply',
    'Generates one reply for a claimed content item.',
  ),
  internalAction(
    'reply-bot.content.generate-dm',
    'Generate Reply Bot DM',
    'Generates an optional direct message for a claimed content item.',
  ),
  internalAction(
    'reply-bot.content.send-reply',
    'Send Reply Bot Reply',
    'Sends one generated reply through its scoped connected account.',
  ),
  internalAction(
    'reply-bot.content.finalize',
    'Finalize Reply Bot Content',
    'Finalizes one processed reply-bot content item.',
  ),
  internalAction(
    'reply-bot.dm.send',
    'Send Reply Bot DM',
    'Sends one scheduled reply-bot direct message.',
  ),
  internalAction(
    'reply-bot.dm.finalize',
    'Finalize Reply Bot DM',
    'Finalizes one reply-bot direct-message workflow.',
  ),
  internalAction(
    'reply-bot.test.load',
    'Load Reply Bot Test',
    'Loads scoped configuration for one reply-bot generation test.',
  ),
  internalAction(
    'reply-bot.test.finalize',
    'Finalize Reply Bot Test',
    'Returns the validated output of one reply-bot generation test.',
  ),
  internalAction(
    'author-reply.resolve-intent',
    'Resolve Author Reply Intent',
    'Resolves and validates the requested author-reply operation.',
  ),
  internalAction(
    'author-reply.resolve-credential',
    'Resolve Author Reply Credential',
    'Resolves the scoped connected account for an author reply.',
  ),
  internalAction(
    'author-reply.generate-draft',
    'Generate Author Reply Draft',
    'Generates one author reply from the resolved intent and context.',
  ),
  internalAction(
    'author-reply.finalize-draft',
    'Finalize Author Reply Draft',
    'Returns the validated typed result for an author-reply draft.',
  ),
  internalAction(
    'author-reply.send',
    'Send Author Reply',
    'Sends one author reply through its connected account.',
  ),
  internalAction(
    'author-reply.finalize-send',
    'Finalize Author Reply Send',
    'Records the closed loop for one sent author reply.',
  ),
  internalAction(
    'reply.inbound.prepare',
    'Prepare Inbound Reply',
    'Validates and prepares one inbound reply event for child processing.',
  ),
  internalAction(
    'reply.inbound.finalize',
    'Finalize Inbound Reply',
    'Finalizes one inbound reply workflow after its child action settles.',
  ),
  internalAction(
    'reply.post-watch.fetch',
    'Fetch Watched Post Replies',
    'Fetches bounded inbound replies for one watched social post.',
  ),
  internalAction(
    'reply.post-watch.finalize',
    'Finalize Watched Post Run',
    'Finalizes one watched-post workflow after its inbound children settle.',
  ),
  internalAction(
    'social.inbox.outbound.reserve',
    'Reserve Social Inbox Outbound',
    'Validates and reserves one social inbox outbound operation.',
  ),
  internalAction(
    'social.inbox.outbound.provider',
    'Send Social Inbox Outbound',
    'Sends one reserved social inbox reply or direct message.',
  ),
  internalAction(
    'social.inbox.outbound.finalize',
    'Finalize Social Inbox Outbound',
    'Finalizes conversation state after one social inbox outbound operation.',
  ),
  internalAction(
    'social.inbox.sync.validate',
    'Validate Social Inbox Sync',
    'Validates one tenant-scoped social inbox synchronization request.',
  ),
  internalAction(
    'social.inbox.sync.youtube-comments',
    'Sync YouTube Comments',
    'Ingests tenant-scoped YouTube comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.instagram-comments',
    'Sync Instagram Comments',
    'Ingests tenant-scoped Instagram comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.instagram-dms',
    'Sync Instagram DMs',
    'Ingests tenant-scoped Instagram direct messages into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.x-comments',
    'Sync X Comments',
    'Ingests tenant-scoped X replies into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.x-dms',
    'Sync X DMs',
    'Ingests tenant-scoped X direct messages into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.linkedin-comments',
    'Sync LinkedIn Comments',
    'Ingests tenant-scoped LinkedIn comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.linkedin-dms',
    'Sync LinkedIn DMs',
    'Ingests tenant-scoped LinkedIn direct messages into the social inbox.',
  ),
  internalAction(
    'review-gate-timeout',
    'Review Gate Timeout Resolution',
    'Resolves workflow review gates whose timeout elapsed.',
  ),
  internalAction(
    'scheduled-post.claim',
    'Claim Scheduled Post',
    'Claims the immutable approval and validates the scheduled post scope.',
  ),
  internalAction(
    'scheduled-post.deliver',
    'Deliver Scheduled Post',
    'Publishes one claimed post through its connected brand account.',
  ),
  internalAction(
    'scheduled-post.fail',
    'Fail Scheduled Post',
    'Projects a terminal pre-delivery workflow failure onto one post.',
  ),
  internalAction(
    'scheduled-post.finalize',
    'Finalize Scheduled Post',
    'Finalizes approval, activity, and recurrence state after delivery.',
  ),
  internalAction(
    'social.reply-campaign.load',
    'Load Social Reply Campaign',
    'Loads and validates one social reply campaign tick.',
  ),
  internalAction(
    'social.reply-campaign.reclaim',
    'Reclaim Social Reply Campaign Recipient',
    'Reclaims stale in-progress recipients for one social reply campaign.',
  ),
  internalAction(
    'social.reply-campaign.throttle',
    'Throttle Social Reply Campaign',
    'Evaluates the durable pacing window for one social reply campaign.',
  ),
  internalAction(
    'social.reply-campaign.claim',
    'Claim Social Reply Campaign Recipient',
    'Claims one pending recipient for a social reply campaign tick.',
  ),
  internalAction(
    'social.reply-campaign.prepare',
    'Prepare Social Reply Campaign Message',
    'Prepares one claimed social reply campaign message for delivery.',
  ),
  internalAction(
    'social.reply-campaign.finalize',
    'Finalize Social Reply Campaign Tick',
    'Finalizes one social reply campaign recipient and campaign state.',
  ),
  internalAction(
    'streak-maintenance',
    'Streak Maintenance',
    'Processes daily streak reminders, freezes, and breaks.',
  ),
  internalAction(
    'tiktok-status-reconciliation',
    'TikTok Status Reconciliation',
    'Reconciles pending TikTok publication status.',
  ),
  internalAction(
    'twitter.pipeline.search-recent',
    'Search Recent X Posts',
    'Searches recent X posts through a scoped connected account.',
  ),
  internalAction(
    'twitter.pipeline.draft.build-prompt',
    'Build X Draft Prompt',
    'Builds the strategy prompt for X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.draft.generate',
    'Generate X Drafts',
    'Generates candidate X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.draft.parse',
    'Parse X Drafts',
    'Parses and validates generated X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.publish.resolve-credential',
    'Resolve X Publish Credential',
    'Resolves the scoped connected account for X publication.',
  ),
  internalAction(
    'twitter.pipeline.publish.send',
    'Send X Publication',
    'Publishes one validated X post through its connected account.',
  ),
  internalAction(
    'youtube.clip.create-session',
    'Create Public Clip Session',
    'Creates or reuses one idempotent public YouTube clip session.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.dispatch-preview',
    'Dispatch Public Clip Preview',
    'Dispatches one reserved clip preview render.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.read-session',
    'Read Public Clip Session',
    'Reads one public clip session and reconciles its preview state.',
    { authorization: 'public', idempotency: 'none', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.release-session',
    'Release Public Clip Session',
    'Compensates a newly created public clip session after downstream workflow failure.',
    { authorization: 'public' },
  ),
  internalAction(
    'youtube.clip.reserve-preview',
    'Reserve Public Clip Preview',
    'Reserves one clip recommendation for preview rendering.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.create-source-library-asset',
    'Save YouTube Source to Library',
    'Promotes one trusted temporary YouTube source into a durable Library asset.',
    { authorization: 'user' },
  ),
  internalAction(
    'youtube.extract-audio',
    'Extract YouTube Audio',
    'Downloads one resolved YouTube source and extracts its temporary audio.',
    { authorization: 'public' },
  ),
  internalAction(
    'youtube.plan-source-library-asset',
    'Plan YouTube Source Library Asset',
    'Validates one retained YouTube source and derives its deterministic Library identity.',
    { authorization: 'user' },
  ),
  internalAction(
    'youtube.transcribe-audio',
    'Transcribe YouTube Audio',
    'Transcribes one temporary YouTube audio artifact.',
    { authorization: 'public', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'youtube.resolve-source',
    'Resolve YouTube Source',
    'Validates and resolves one public YouTube source.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube-status-reconciliation',
    'YouTube Status Reconciliation',
    'Reconciles YouTube video visibility.',
  ),
  internalAction(
    'youtube-comments-ingest',
    'Ingest YouTube Comments',
    'Ingests one connected YouTube account into the social inbox.',
  ),
  internalAction(
    'email-digest.send',
    'Send Email Digest',
    'Builds and delivers one tenant-scoped email digest.',
  ),
  internalAction(
    'agent-campaign.memory.extract',
    'Extract Agent Campaign Memory',
    'Extracts durable winner memory for one tenant campaign.',
  ),
  internalAction(
    'agent-campaign.orchestration.run',
    'Run Agent Campaign Cycle',
    'Executes one tenant campaign orchestration cycle.',
  ),
  internalAction(
    'agent-campaign.triggers.evaluate',
    'Evaluate Agent Campaign Triggers',
    'Evaluates armed triggers for one tenant campaign.',
  ),
  internalAction(
    'batch.generation.mark-queued',
    'Mark Batch Generation Queued',
    'Claims one batch generation request for workflow execution.',
  ),
  internalAction(
    'batch.generation.process',
    'Process Batch Generation',
    'Generates one claimed batch through the shared generation service.',
  ),
  internalAction(
    'batch.generation.settle',
    'Settle Batch Generation',
    'Finalizes credits and durable state for one batch generation run.',
  ),
  internalAction(
    'insight.generate',
    'Generate Insight',
    'Generates and persists one tenant-scoped insight.',
  ),
  internalAction(
    'knowledge.source.discover-backfill',
    'Discover Knowledge Source Backfill',
    'Discovers bounded knowledge sources that require ingestion.',
  ),
  internalAction(
    'knowledge.source.ingest',
    'Ingest Knowledge Source',
    'Ingests one tenant-scoped knowledge source into its context base.',
  ),
  internalAction(
    'lifecycle-email.send',
    'Send Lifecycle Email',
    'Builds and delivers one lifecycle email.',
  ),
  internalAction(
    'signup.prefill.execute',
    'Execute Signup Prefill',
    'Builds and persists one signup prefill from validated onboarding context.',
  ),
  internalAction(
    'signup.prefill.fail',
    'Fail Signup Prefill',
    'Projects one terminal signup-prefill workflow failure.',
  ),
  internalAction(
    'telegram.distribution.deliver',
    'Deliver Telegram Distribution',
    'Delivers one tenant-scoped Telegram distribution request.',
  ),
  internalAction(
    'workflow.artifact.cleanup',
    'Clean Up Workflow Artifacts',
    'Deletes temporary storage objects owned by one workflow execution.',
  ),
  internalAction(
    'workflow.artifact.cleanup-expired',
    'Clean Up Expired Workflow Artifacts',
    'Processes one bounded batch of expired workflow storage and execution payloads.',
  ),
  internalAction(
    'workflow.artifact.promote',
    'Promote Workflow Artifact',
    'Marks one temporary workflow artifact as retained by a durable Library record.',
    { authorization: 'user' },
  ),
  internalAction(
    'workflow.artifact.register',
    'Register Workflow Artifact',
    'Registers one temporary workflow storage object for terminal and TTL cleanup.',
    { authorization: 'public' },
  ),
  internalAction(
    'workflow.for-each',
    'Run Workflow for Each Item',
    'Runs or durably schedules one registered child workflow for each item in a bounded collection.',
  ),
  internalAction(
    'workflow.collect-output',
    'Collect Workflow Output',
    'Collects terminal workflow inputs into one structured result.',
    { authorization: 'user' },
  ),
];

const definitions = [...ALL_TOOLS.map(toolAction), ...INTERNAL_ACTIONS];
const duplicateIds = definitions
  .map((definition) => definition.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length > 0) {
  throw new Error(
    `Duplicate Genfeed action definitions: ${[...new Set(duplicateIds)].join(', ')}`,
  );
}

export const ALL_ACTIONS: readonly GenfeedActionDefinition[] = definitions;

const ACTIONS_BY_ID = new Map(
  ALL_ACTIONS.map((definition) => [definition.id, definition]),
);

export function getActionDefinition(
  actionId: string,
): GenfeedActionDefinition | undefined {
  return ACTIONS_BY_ID.get(actionId);
}

export function createGenfeedActionNode(
  input: CreateGenfeedActionNodeInput,
): GenfeedActionNodeDefinition {
  const action = getActionDefinition(input.actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action: ${input.actionId}`);
  }
  return {
    data: {
      config: { actionId: action.id, parameters: input.parameters ?? {} },
      inputVariableKeys: input.inputVariableKeys ?? [],
      label: input.label ?? action.label,
    },
    id: input.id,
    position: input.position ?? { x: 0, y: 120 },
    type: 'genfeedAction',
  };
}
