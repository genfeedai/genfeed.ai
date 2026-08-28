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
    }),
);

const INTERNAL_ACTIONS: readonly GenfeedActionDefinition[] = [
  ...WORKFLOW_ACTION_DEFINITIONS,
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
    'campaign-dm-automation',
    'Campaign DM Automation',
    'Generates and sends outreach-campaign direct messages.',
  ),
  internalAction(
    'campaign-reply-automation',
    'Campaign Reply Automation',
    'Generates and posts outreach-campaign replies.',
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
    'reply-dm-automation',
    'Reply and DM Automation',
    'Generates and sends reply-bot replies and direct messages.',
  ),
  internalAction(
    'social-inbox-post-reply',
    'Post Social Inbox Reply',
    'Posts one reply from a social inbox conversation.',
  ),
  internalAction(
    'social-inbox-send-dm',
    'Send Social Inbox DM',
    'Sends one direct message from a social inbox conversation.',
  ),
  internalAction(
    'review-gate-timeout',
    'Review Gate Timeout Resolution',
    'Resolves workflow review gates whose timeout elapsed.',
  ),
  internalAction(
    'scheduled-post-publishing',
    'Scheduled Post Publishing',
    'Publishes due posts through the connected brand account.',
  ),
  internalAction(
    'social-reply-campaign',
    'Inbox Reply Campaign Dispatch',
    'Dispatches one rate-limited inbox campaign message.',
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
    'twitter-publish-action',
    'X Publish Action',
    'Publishes X originals, replies, quotes, and reposts.',
  ),
  internalAction(
    'youtube.clip.create-session',
    'Create Public Clip Session',
    'Creates or reuses one idempotent public YouTube clip session.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.dispatch-analysis',
    'Dispatch Public Clip Analysis',
    'Dispatches analysis for one new public clip session.',
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
    'youtube.clip.reserve-preview',
    'Reserve Public Clip Preview',
    'Reserves one clip recommendation for preview rendering.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.obtain-transcript',
    'Obtain YouTube Transcript',
    'Extracts audio and transcribes one resolved video.',
    {
      authorization: 'public',
      credits: { mode: 'dynamic' },
      visibility: 'public',
    },
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
      config: { actionId: action.id, parameters: {} },
      inputVariableKeys: input.inputVariableKeys ?? [],
      label: input.label ?? action.label,
    },
    id: input.id,
    position: input.position ?? { x: 0, y: 120 },
    type: 'genfeedAction',
  };
}
